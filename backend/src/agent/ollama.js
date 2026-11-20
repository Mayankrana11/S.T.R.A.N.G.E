import path from "node:path";
import { fileURLToPath } from "node:url";
import ollama from "ollama";
import dotenv from "dotenv";

import { toolSchemas } from "./registry.js";
import { executeTool } from "./executor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ENV_PATH = path.resolve(__dirname, "../../.env");

dotenv.config({ path: BACKEND_ENV_PATH, override: true });

let cachedResolvedModel = null;
let cachedResolvedVisionModel = null;

function normalizeModelTag(rawName) {
    if (!rawName || typeof rawName !== "string") return "";
    const trimmed = rawName.trim();
    // Normalize e.g. "qwen2.5vl-3b" -> "qwen2.5vl:3b" if user wrote hyphen before size tag
    if (!trimmed.includes(":") && /-[0-9]+(\.[0-9]+)?b$/i.test(trimmed)) {
        return trimmed.replace(/-([0-9]+(?:\.[0-9]+)?b)$/i, ":$1");
    }
    return trimmed;
}

function findMatchingOllamaModel(targetName, models = []) {
    if (!targetName || !Array.isArray(models)) return null;
    const rawLower = targetName.trim().toLowerCase();
    const normLower = normalizeModelTag(targetName).toLowerCase();
    const hyphenLower = normLower.replace(/:([0-9]+(?:\.[0-9]+)?b.*)$/i, "-$1");

    return (
        models.find((m) => {
            const name = (m.name || "").toLowerCase();
            const model = (m.model || "").toLowerCase();
            return (
                name === rawLower ||
                model === rawLower ||
                name === normLower ||
                model === normLower ||
                name === hyphenLower ||
                model === hyphenLower
            );
        }) || null
    );
}

export async function getActiveModelInfo() {
    dotenv.config({ path: BACKEND_ENV_PATH, override: true });
    const configuredModel = normalizeModelTag(process.env.OLLAMA_MODEL) || "qwen3.5:4b";
    const configuredVisionModel =
        normalizeModelTag(process.env.OLLAMA_VISION_MODEL) || "qwen2.5vl:3b";
    const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

    try {
        let runningModels = [];
        let installedModels = [];

        for (let attempt = 0; attempt < 4; attempt++) {
            const [psRes, listRes] = await Promise.all([
                ollama.ps().catch(() => ({ models: [] })),
                ollama.list().catch(() => ({ models: [] }))
            ]);

            runningModels = psRes?.models ?? [];
            installedModels = listRes?.models ?? [];

            if (installedModels.length > 0 || runningModels.length > 0) {
                break;
            }
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 350));
            }
        }

        const targetMainName =
            configuredModel ||
            runningModels[0]?.model ||
            runningModels[0]?.name ||
            installedModels[0]?.model ||
            installedModels[0]?.name ||
            "qwen3.5:4b";

        const matchedMainRunning = findMatchingOllamaModel(targetMainName, runningModels);
        const matchedMainInstalled = findMatchingOllamaModel(targetMainName, installedModels);
        const mainDetails = matchedMainRunning?.details || matchedMainInstalled?.details || {};

        const targetVisionName = configuredVisionModel || targetMainName;
        const matchedVisionRunning = findMatchingOllamaModel(targetVisionName, runningModels);
        const matchedVisionInstalled = findMatchingOllamaModel(targetVisionName, installedModels);
        const visionDetails =
            matchedVisionRunning?.details || matchedVisionInstalled?.details || {};

        cachedResolvedModel =
            matchedMainInstalled?.model ||
            matchedMainRunning?.model ||
            targetMainName;

        cachedResolvedVisionModel =
            matchedVisionInstalled?.model ||
            matchedVisionRunning?.model ||
            targetVisionName;

        return {
            model: cachedResolvedModel,
            parameter_size: mainDetails.parameter_size || null,
            quantization_level: mainDetails.quantization_level || null,
            family: mainDetails.family || null,
            loaded_in_vram: Boolean(matchedMainRunning),
            vision_model: cachedResolvedVisionModel,
            vision_parameter_size: visionDetails.parameter_size || null,
            vision_quantization_level: visionDetails.quantization_level || null,
            vision_family: visionDetails.family || null,
            vision_loaded_in_vram: Boolean(matchedVisionRunning),
            host
        };
    } catch {
        const fallbackMain = configuredModel || cachedResolvedModel || "qwen3.5:4b";
        const fallbackVision =
            configuredVisionModel || cachedResolvedVisionModel || "qwen2.5vl:3b";
        return {
            model: fallbackMain,
            parameter_size: null,
            quantization_level: null,
            family: null,
            loaded_in_vram: false,
            vision_model: fallbackVision,
            vision_parameter_size: null,
            vision_quantization_level: null,
            vision_family: null,
            vision_loaded_in_vram: false,
            host
        };
    }
}

const MAX_ITERATIONS = Number(
    process.env.MAX_TOOL_ITERATIONS || 12
);

const SYSTEM_PROMPT = `
You are STRANGE, a local desktop assistant.
S.T.R.A.N.G.E stands for Smart Task Reasoning and Autonomous Navigation for General Execution
You can use tools to interact with the computer.

Rules:
1. ONLY use tools when the user explicitly requests a computer action (opening/closing apps, interacting with desktop UI, reading/writing sandbox files, checking system stats/processes, browsing URLs, or inspecting the screen).
2. For greetings (such as "hello", "hi", "hey", "good morning"), small talk, thanks, or general knowledge questions that do not require computer interaction, NEVER call any tool (and NEVER call desktop_inspect) — respond directly in normal plain text.
3. Do not invent tool names.
4. Do not claim an action succeeded without tool results.
5. Use the correct tool for the requested task.
6. If a tool fails, inspect the error and decide whether
   another attempt is appropriate.
7. Do not repeatedly call a tool with identical arguments
   after it has failed.
8. If a tool returns requires_clarification: true or requires_confirmation: true
   (such as when multiple applications match, confidence is low, or a destructive
   action requires confirmation), do NOT guess or call the tool again. Ask the
   user to clarify or confirm.

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
- Supported applications include Visual Studio Code (vscode), Visual Studio (visual_studio), WhatsApp (whatsapp), Google Chrome (chrome), Notepad (notepad), Calculator (calculator), Paint (paint), Steam (steam), Discord (discord), and Spotify (spotify).
- When the user asks to open or launch an application (including by alias or role such as "my code editor" -> "vscode", or "whatsapp" -> "whatsapp" desktop app via open_application, never via browser), call open_application directly instead of list_applications.
- When the user asks to close, quit, exit, or terminate an application, call close_application directly.

BATCHED DESKTOP AUTOMATION (SEPARATE PLANNING FROM EXECUTION):
- When the user asks to interact inside an application (such as calculating in Calculator, typing in Notepad, clicking buttons, selecting playlists, enabling shuffle, clicking play, typing into a search bar, scrolling, dragging, or using keyboard shortcuts):
  1. If the application is not open yet, FIRST call open_application (or browser_navigate for a website URL).
  2. ALWAYS use execute_action_sequence to batch ALL known desktop steps into a SINGLE tool call instead of calling desktop_click, desktop_type, or desktop_press_key one by one.
  3. NEVER call take_screenshot or desktop_inspect before or between desktop actions unless the user explicitly asks to take a screenshot or inspect the screen.
  4. Examples of single-call batched execution with execute_action_sequence:
     - Calculator (e.g. "do 5+5"): {"app_name": "calculator", "actions": [{"action": "type_text", "text": "5+5=", "clear_first": true}]} OR {"app_name": "calculator", "actions": [{"action": "left_click", "target": "Clear"}, {"action": "left_click", "target": "5"}, {"action": "left_click", "target": "+"}, {"action": "left_click", "target": "5"}, {"action": "left_click", "target": "="}]}
     - Notepad (e.g. "type hello"): {"app_name": "notepad", "actions": [{"action": "type_text", "text": "hello"}]}
     - Searching / playing inside an app: {"app_name": "spotify", "actions": [{"action": "key_press", "key": "ctrl+k"}, {"action": "wait", "duration_ms": 150}, {"action": "type_text", "text": "songs", "press_enter": true}]}
  5. Use desktop_control only when autonomous multi-checkpoint UIA/OCR/Vision navigation is required for an open-ended visual goal.
`;

function compactToolResultForModel(toolName, rawResult) {
    if (!rawResult || typeof rawResult !== "object") return rawResult;
    const inner = rawResult.result;
    if (!inner || typeof inner !== "object") return rawResult;

    if (
        toolName === "execute_action_sequence" ||
        toolName === "desktop_click" ||
        toolName === "left_click" ||
        toolName === "right_click" ||
        toolName === "double_click" ||
        toolName === "desktop_type" ||
        toolName === "desktop_press_key" ||
        toolName === "desktop_scroll" ||
        toolName === "desktop_control"
    ) {
        const compactSteps = Array.isArray(inner.results)
            ? inner.results.map((r) => ({
                  step: (r.step_index ?? 0) + 1,
                  action: r.action,
                  target: r.matched_label || r.target || r.text || r.key || undefined,
                  method: r.detection_method || undefined,
                  success: r.success,
                  calculator_display: r.calculator_display || undefined,
                  error: r.error || undefined
              }))
            : undefined;

        return {
            success: rawResult.success,
            tool: toolName,
            requires_confirmation: rawResult.requires_confirmation || false,
            requires_clarification: rawResult.requires_clarification || false,
            error: rawResult.error || undefined,
            result: {
                success: inner.success,
                action: inner.action,
                status: inner.status || (inner.success ? "completed" : "failed"),
                app_name: inner.app_name || undefined,
                window_title: inner.target_window?.title || inner.window_title || undefined,
                calculator_display: inner.calculator_display || undefined,
                focused_value: inner.focused_value || undefined,
                matched_label: inner.matched_label || undefined,
                detection_method: inner.detection_method || undefined,
                total_requested: inner.total_requested,
                total_executed: inner.total_executed,
                steps: compactSteps || inner.steps_executed || undefined,
                checkpoint_reason: inner.checkpoint?.primary_reason || undefined,
                timings_ms: inner.timings_ms
            }
        };
    }

    if (toolName === "desktop_inspect") {
        return {
            success: rawResult.success,
            tool: toolName,
            error: rawResult.error || undefined,
            result: {
                success: inner.success,
                action: inner.action,
                model: inner.model || undefined,
                vision_model: inner.vision_model || undefined,
                window_title: inner.window_title || undefined,
                process_name: inner.process_name || undefined,
                vision_analysis: inner.vision_analysis || undefined,
                uia_elements_count: Array.isArray(inner.uia_elements_sample)
                    ? inner.uia_elements_sample.length
                    : 0,
                timings_ms: inner.timings_ms
            }
        };
    }

    return rawResult;
}

const PRIMITIVE_TO_SEQUENCE_ACTION = {
    desktop_click: (a) => ({
        action: a.click_type === "double" ? "double_click" : a.button === "right" ? "right_click" : a.button === "middle" ? "middle_click" : "left_click",
        target: a.target,
        x: a.x,
        y: a.y
    }),
    left_click: (a) => ({ action: "left_click", target: a.target, x: a.x, y: a.y }),
    right_click: (a) => ({ action: "right_click", target: a.target, x: a.x, y: a.y }),
    double_click: (a) => ({ action: "double_click", target: a.target, x: a.x, y: a.y }),
    move_mouse: (a) => ({ action: "move_mouse", x: a.x, y: a.y, duration_ms: a.duration_ms }),
    desktop_scroll: (a) => ({ action: "scroll", direction: a.direction, amount: a.amount, target: a.target, x: a.x, y: a.y }),
    desktop_type: (a) => ({ action: "type_text", text: a.text, target: a.target, press_enter: a.press_enter, clear_first: a.clear_first }),
    desktop_press_key: (a) => ({ action: "key_press", key: a.key, modifiers: a.modifiers })
};

function coalesceToolCalls(toolCalls) {
    if (!Array.isArray(toolCalls) || toolCalls.length <= 1) return toolCalls;

    const coalesced = [];
    let i = 0;

    while (i < toolCalls.length) {
        const current = toolCalls[i];
        const name = current?.function?.name;

        if (PRIMITIVE_TO_SEQUENCE_ACTION[name]) {
            const batchSteps = [];
            let batchAppName = null;
            let j = i;

            while (j < toolCalls.length) {
                const nextCall = toolCalls[j];
                const nextName = nextCall?.function?.name;
                const mapper = PRIMITIVE_TO_SEQUENCE_ACTION[nextName];
                if (!mapper) break;

                let parsedArgs = nextCall.function?.arguments || {};
                if (typeof parsedArgs === "string") {
                    try {
                        parsedArgs = JSON.parse(parsedArgs);
                    } catch {
                        break;
                    }
                }

                if (parsedArgs.app_name && !batchAppName) {
                    batchAppName = parsedArgs.app_name;
                } else if (parsedArgs.app_name && batchAppName && parsedArgs.app_name !== batchAppName) {
                    break;
                }

                batchSteps.push(mapper(parsedArgs));
                j++;
            }

            if (batchSteps.length > 1) {
                coalesced.push({
                    function: {
                        name: "execute_action_sequence",
                        arguments: {
                            ...(batchAppName ? { app_name: batchAppName } : {}),
                            actions: batchSteps
                        }
                    }
                });
                i = j;
                continue;
            }
        }

        coalesced.push(current);
        i++;
    }

    return coalesced;
}

function isConversationalNoToolPrompt(userMessage) {
    const cleaned = String(userMessage || "").trim();
    if (!cleaned) return true;
    return /^(hi|hello|hey|yo|sup|hola|namaste|greetings|good\s+(morning|afternoon|evening|night)|how\s+are\s+you(\s+doing)?|how'?s\s+it\s+going|what'?s\s+up|who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what\s+does\s+s\.?t\.?r\.?a\.?n\.?g\.?e\.?\s+stand\s+for|thanks|thank\s+you|thx|ok|okay|cool|nice|great|awesome|bye|goodbye|see\s+ya)(\s+strange|\s+there)?[!?.~\s]*$/i.test(
        cleaned
    );
}

function isExplicitScreenInspectRequest(userMessage) {
    const cleaned = String(userMessage || "").trim();
    return /\b(inspect|screen|screenshot|capture|window|visible|see|look|watch|display|showing|what\s+is\s+on|what'?s\s+on|describe|ui|button|element|ocr|vision)\b/i.test(
        cleaned
    );
}

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
    let pendingConfirmationMessage = null;
    const modelInfo = await getActiveModelInfo();
    const activeModel = modelInfo.model;
    let mainModelUsed = activeModel;
    let visionModelUsed = null;
    const modelsUsed = [];
    const conversationalOnly = isConversationalNoToolPrompt(userMessage);

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const stopTools = Boolean(
            conversationalOnly ||
            pendingClarificationMessage ||
            pendingConfirmationMessage
        );

        console.log(
            `[STRANGE:AGENT] [Step ${iteration + 1}/${MAX_ITERATIONS}] [MODEL: ${activeModel}] Processing prompt...`
        );

        const response = await ollama.chat({
            model: activeModel,
            think: process.env.OLLAMA_THINK === "true",
            options: {
                temperature: 0
            },
            messages,
            tools: stopTools ? [] : toolSchemas,
            stream: false
        });

        if (response?.model) {
            mainModelUsed = response.model;
        }
        if (!modelsUsed.includes(mainModelUsed)) {
            modelsUsed.push(mainModelUsed);
        }

        let message = response.message;
        const rawToolCalls = message.tool_calls ?? [];

        // Guard against hallucinated desktop_inspect calls when the user did not ask to inspect the screen
        const filteredRawToolCalls =
            iteration === 0 && !isExplicitScreenInspectRequest(userMessage)
                ? rawToolCalls.filter((tc) => tc?.function?.name !== "desktop_inspect")
                : rawToolCalls;

        if (
            iteration === 0 &&
            rawToolCalls.length > 0 &&
            filteredRawToolCalls.length === 0 &&
            !message.content
        ) {
            const directResponse = await ollama.chat({
                model: activeModel,
                think: process.env.OLLAMA_THINK === "true",
                options: { temperature: 0 },
                messages,
                tools: [],
                stream: false
            });
            if (directResponse?.model) {
                mainModelUsed = directResponse.model;
            }
            message = directResponse.message;
        }

        messages.push(message);

        const toolCalls = coalesceToolCalls(filteredRawToolCalls);

        if (toolCalls.length === 0) {
            const effectiveModel = visionModelUsed || mainModelUsed;
            return {
                success: true,
                model: effectiveModel,
                main_model: mainModelUsed,
                vision_model: visionModelUsed,
                models_used: modelsUsed,
                answer: message.content || pendingConfirmationMessage || pendingClarificationMessage,
                requires_clarification: Boolean(pendingClarificationMessage),
                requires_confirmation: Boolean(pendingConfirmationMessage),
                tool_calls: executedTools,
                iterations: iteration + 1
            };
        }

        // Execute tool calls strictly sequentially one after another
        for (const toolCall of toolCalls) {
            console.log(
                `[STRANGE:AGENT] [Step ${iteration + 1}/${MAX_ITERATIONS}] [MODEL: ${mainModelUsed}] Tool call -> ${toolCall.function?.name}`,
                toolCall.function?.arguments
            );

            const result = await executeTool(toolCall);
            const innerResult = result?.result;
            const toolVisionModel =
                innerResult?.vision_model ||
                result?.vision_model ||
                (Number(innerResult?.timings_ms?.vision_inference_ms || 0) > 0
                    ? modelInfo.vision_model
                    : null);

            if (toolVisionModel) {
                visionModelUsed = toolVisionModel;
                if (!modelsUsed.includes(toolVisionModel)) {
                    modelsUsed.push(toolVisionModel);
                }
                console.log(
                    `[STRANGE:AGENT] [Step ${iteration + 1}/${MAX_ITERATIONS}] [MODEL: ${toolVisionModel}] Vision inference executed during ${toolCall.function?.name}`
                );
            }

            executedTools.push({
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
                model: toolVisionModel || mainModelUsed,
                vision_model: toolVisionModel || null,
                result
            });

            if (result?.requires_clarification) {
                pendingClarificationMessage =
                    result.message || result.error || "Please clarify which application you meant.";
            }

            if (result?.requires_confirmation) {
                pendingConfirmationMessage =
                    result.message || result.error || "Please confirm if you want to proceed with this destructive action.";
            }

            const compactForLlm = compactToolResultForModel(toolCall.function.name, result);
            messages.push({
                role: "tool",
                content: JSON.stringify(compactForLlm)
            });
        }
    }

    const effectiveModel = visionModelUsed || mainModelUsed;
    return {
        success: false,
        model: effectiveModel,
        main_model: mainModelUsed,
        vision_model: visionModelUsed,
        models_used: modelsUsed,
        answer: "Maximum tool iterations reached.",
        tool_calls: executedTools
    };
}
