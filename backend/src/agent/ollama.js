
import ollama from "ollama";
import dotenv from "dotenv";

import { toolSchemas } from "./registry.js";
import { executeTool } from "./executor.js";

dotenv.config();

const MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

const MAX_ITERATIONS = Number(
    process.env.MAX_TOOL_ITERATIONS || 8
);

const SYSTEM_PROMPT = `
You are STRANGE, a local desktop assistant.

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

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {

        const response = await ollama.chat({
            model: MODEL,
            messages,
            tools: toolSchemas,
            stream: false
        });

        const message = response.message;

        messages.push(message);

        const toolCalls = message.tool_calls ?? [];

        if (toolCalls.length === 0) {
            return {
                success: true,
                answer: message.content,
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
