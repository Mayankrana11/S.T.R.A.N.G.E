import ollama from "ollama";
import dotenv from "dotenv";

import { toolSchemas } from "./registry.js";
import { executeTool } from "./executor.js";

dotenv.config();

const MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

const MAX_ITERATIONS = Number(
    process.env.MAX_TOOL_ITERATIONS || 12
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

APPLICATION LAUNCHING AND CLOSING:
- Supported applications include Visual Studio Code (vscode), Visual Studio (visual_studio), Google Chrome (chrome), Notepad (notepad), Calculator (calculator), Paint (paint), Steam (steam), Discord (discord), and Spotify (spotify).
- When the user asks to open or launch an application (including by alias or role such as "my code editor" -> "vscode"), call open_application directly instead of list_applications.
- When the user asks to close, quit, exit, or terminate an application, call close_application directly.

IN-APPLICATION DESKTOP CONTROL (WINDOWS UI AUTOMATION + QWEN VISION):
- When the user asks to interact inside an application (such as clicking buttons, selecting playlists, enabling shuffle, clicking play, typing into a search bar, scrolling, downloading a game in Steam, or opening a video/short on YouTube):
  1. If the application is not open yet (e.g. "open spotify and play my playlist 'songs' on shuffle" or "open steam and download X"), FIRST call open_application (or browser_navigate for a website URL like "https://www.youtube.com").
  2. Next, perform the in-application actions sequentially:
     - Use desktop_click for clicking a specific button, playlist, link, or UI element (supports button: "left" | "right", click_type: "single" | "double").
     - Use desktop_type for typing into a search bar or input field (e.g. searching for a playlist, game, or YouTube channel).
     - Use desktop_scroll for scrolling "up", "down", "left", or "right".
     - Use desktop_press_key for keyboard shortcuts (e.g. "Enter", "Space", "ctrl+k", "ctrl+l").
     - Use desktop_control when you want the vision/UIA controller to autonomously step through a multi-step in-app goal (e.g. goal: "go to playlists, select 'songs', click shuffle, and click play", app_name: "spotify").
  3. Execute UI actions sequentially one step at a time and check the returned tool result before proceeding.
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
            think: process.env.OLLAMA_THINK === "true",
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

        // Execute tool calls strictly sequentially one after another
        for (const toolCall of toolCalls) {
            console.log(
                `[STRANGE:AGENT] [Step ${iteration + 1}/${MAX_ITERATIONS}] Tool call -> ${toolCall.function?.name}`,
                toolCall.function?.arguments
            );

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
