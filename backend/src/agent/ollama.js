
import ollama from "ollama";
import dotenv from "dotenv";

import { toolSchemas } from "./registry.js";
import { executeTool } from "./executor.js";

dotenv.config();

const MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

const MAX_ITERATIONS = Number(
    process.env.MAX_TOOL_ITERATIONS || 8
);

const SYSTEM_PROMPT = `
You are STRANGE, a local desktop assistant.
S.T.R.A.N.G.E stands for Smart Task Reasoning and Autonomous Navigation for General Execution
You can use tools to interact with the computer.

Rules:
1. Use tools when the user requests an action.
2. Do not invent tool names.
3. Do not claim an action succeeded without tool results.
4. Use the correct tool for the requested task.
5. If the user asks a normal question, answer normally.
6. If a tool fails, inspect the error and decide whether
   another attempt is appropriate.
7. Do not repeatedly call a tool with identical arguments
   after it has failed.
8. If a tool returns requires_clarification: true (such as when multiple
   applications match or confidence is low), do NOT guess or call the tool
   again. Ask the user to clarify which application they meant.

IMPORTANT FILESYSTEM PATH NORMALIZATION:

The filesystem tools already operate inside the sandbox root.

Never include the sandbox directory name in a filesystem tool path.

Correct:
- Read strange_test.txt -> {"path":"strange_test.txt"}
- Create hello.txt -> {"path":"hello.txt"}
- Create evaluation_test -> {"path":"evaluation_test"}
- List sandbox contents -> {"path":"."}

Incorrect:
- {"path":"sandbox/strange_test.txt"}
- {"path":"sandbox/hello.txt"}
- {"path":"sandbox/evaluation_test"}

When the user says "in the sandbox", "inside the sandbox", or "from the sandbox",
that describes the tool's execution environment. It does not belong in the path.

Before calling any filesystem tool, verify that the path does not begin with "sandbox/".

APPLICATION LAUNCHING:
- When the user asks to open or launch an application (including by alias or role such as "my code editor" -> "vscode"), call open_application directly instead of list_applications.
`;

export async function askOllama(userMessage) {
    const messages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        },
        {
            role: "user",
            content: userMessage
        }
    ];

    const executedTools = [];
    let pendingClarificationMessage = null;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {

        const response = await ollama.chat({
            model: MODEL,
            messages,
            tools: pendingClarificationMessage ? [] : toolSchemas,
            stream: false
        });

        const message = response.message;

        messages.push(message);

        const toolCalls = message.tool_calls ?? [];

        if (toolCalls.length === 0) {
            return {
                success: true,
                answer: message.content || pendingClarificationMessage,
                requires_clarification: Boolean(pendingClarificationMessage),
                tool_calls: executedTools,
                iterations: iteration + 1
            };
        }

        for (const toolCall of toolCalls) {

            const result = await executeTool(toolCall);

            executedTools.push({
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
                result
            });

            if (result?.requires_clarification) {
                pendingClarificationMessage =
                    result.message || result.error || "Please clarify which application you meant.";
            }

            messages.push({
                role: "tool",
                content: JSON.stringify(result)
            });
        }
    }

    return {
        success: false,
        answer: "Maximum tool iterations reached.",
        tool_calls: executedTools
    };
}
