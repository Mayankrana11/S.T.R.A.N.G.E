import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ollama from "ollama";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ENV_PATH = path.resolve(__dirname, "../.env");

dotenv.config({ path: BACKEND_ENV_PATH, override: true });

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const API_URL = `${BASE_URL}/chat`;

function normalizeModelTag(rawName) {
    if (!rawName || typeof rawName !== "string") return "";
    const trimmed = rawName.trim();
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

async function queryLocalOllamaModel() {
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

        return {
            model: matchedMainInstalled?.model || matchedMainRunning?.model || targetMainName,
            parameter_size: mainDetails.parameter_size || null,
            quantization_level: mainDetails.quantization_level || null,
            family: mainDetails.family || null,
            loaded_in_vram: Boolean(matchedMainRunning),
            vision_model:
                matchedVisionInstalled?.model ||
                matchedVisionRunning?.model ||
                targetVisionName,
            vision_parameter_size: visionDetails.parameter_size || null,
            vision_quantization_level: visionDetails.quantization_level || null,
            vision_family: visionDetails.family || null,
            vision_loaded_in_vram: Boolean(matchedVisionRunning),
            host
        };
    } catch {
        return {
            model: configuredModel || "qwen3.5:4b",
            parameter_size: null,
            quantization_level: null,
            family: null,
            loaded_in_vram: false,
            vision_model: configuredVisionModel || "qwen2.5vl:3b",
            vision_parameter_size: null,
            vision_quantization_level: null,
            vision_family: null,
            vision_loaded_in_vram: false,
            host
        };
    }
}

async function resolveCurrentModelBanner() {
    const localInfo = await queryLocalOllamaModel();
    try {
        const res = await fetch(BASE_URL);
        if (res.ok) {
            const data = await res.json();
            if (data?.ollama?.model) {
                const remote = data.ollama;
                // If remote backend was started without .env loaded (where model == vision_model),
                // prefer the configured .env local resolution so main and vision models are accurately shown.
                if (
                    remote.model === remote.vision_model &&
                    localInfo.model !== localInfo.vision_model
                ) {
                    return localInfo;
                }
                return {
                    ...localInfo,
                    ...remote,
                    parameter_size:
                        remote.parameter_size || localInfo.parameter_size,
                    quantization_level:
                        remote.quantization_level || localInfo.quantization_level,
                    vision_parameter_size:
                        remote.vision_parameter_size || localInfo.vision_parameter_size,
                    vision_quantization_level:
                        remote.vision_quantization_level || localInfo.vision_quantization_level
                };
            }
        }
    } catch {
        // Backend not reachable yet; use local Ollama query
    }

    return localInfo;
}

function formatModelLabel(modelName, parameterSize, quantizationLevel) {
    if (!modelName) return "unknown";
    const meta = [parameterSize, quantizationLevel].filter(Boolean).join(", ");
    return meta ? `${modelName} (${meta})` : modelName;
}

function formatTimingsInline(timings) {
    if (!timings || typeof timings !== "object") return "";
    const parts = [
        `uia:${timings.uia_lookup_ms ?? 0}ms`,
        `input:${timings.mouse_keyboard_execution_ms ?? 0}ms`,
        `shot:${timings.screenshot_capture_ms ?? 0}ms`,
        `vision:${timings.vision_inference_ms ?? 0}ms`,
        `verify:${timings.verification_ms ?? 0}ms`,
        `overhead:${timings.tool_call_overhead_ms ?? 0}ms`,
        `total:${timings.total_ms ?? 0}ms`
    ];
    return ` [${parts.join(", ")}]`;
}

function formatToolCallSummary(tool, defaultMainModel = null) {
    const res = tool.result;
    const inner = res?.result;
    const status = res?.success === false ? "FAIL" : "OK";
    const toolModel =
        tool.vision_model ||
        inner?.vision_model ||
        inner?.model ||
        tool.model ||
        defaultMainModel;
    const modelBadge = toolModel ? ` [MODEL: ${toolModel}]` : "";
    let detail = "";

    if (res?.success === false) {
        const stage = inner?.failed_stage ? ` [stage: ${inner.failed_stage}]` : "";
        detail = ` -> [${status}]${modelBadge}${stage} ${res.error || inner?.error || "Unknown error"}${formatTimingsInline(inner?.timings_ms)}`;
    } else if (inner) {
        if (inner.action === "execute_action_sequence") {
            const cpReason = inner.checkpoint?.primary_reason ? `, checkpoint:${inner.checkpoint.primary_reason}` : "";
            const calcDisp = inner.calculator_display ? `, display:"${inner.calculator_display}"` : "";
            detail = ` -> [${status}]${modelBadge} batched ${inner.total_executed}/${inner.total_requested} action(s) in "${inner.target_window?.title || inner.app_name || "Desktop"}"${calcDisp}${cpReason}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_click") {
            detail = ` -> [${status}]${modelBadge} ${inner.click_type} ${inner.button}-click "${inner.matched_label || inner.target}" at (${inner.x}, ${inner.y}) via ${inner.detection_method}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_type") {
            const calcDisp = inner.calculator_display ? ` [display: "${inner.calculator_display}"]` : "";
            detail = ` -> [${status}]${modelBadge} typed "${inner.text}"${inner.target ? ` into "${inner.target}"` : ""}${calcDisp}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_scroll") {
            detail = ` -> [${status}]${modelBadge} scrolled ${inner.direction} (${inner.amount})${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_inspect") {
            const modeLabel = inner.vision_model ? `vision` : "uia+ocr";
            detail = ` -> [${status}]${modelBadge} inspected "${inner.window_title || inner.process_name || "Desktop"}" via ${modeLabel}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_control") {
            const calcDisp = inner.calculator_display ? `, display:"${inner.calculator_display}"` : "";
            detail = ` -> [${status}]${modelBadge} ${inner.total_steps ?? 0} action(s) (${inner.status}${calcDisp})${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "open_application") {
            detail = ` -> [${status}]${modelBadge} opened ${inner.application_name || inner.application}`;
        } else if (inner.action === "close_application") {
            detail = ` -> [${status}]${modelBadge} closed ${inner.application_name || inner.application}`;
        } else {
            detail = ` -> [${status}]${modelBadge}`;
        }
    } else if (modelBadge) {
        detail = ` -> [${status}]${modelBadge}`;
    }

    return `- ${tool.name}${detail}`;
}

async function sendMessage(message) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            console.log(`\n[ERROR] HTTP ${response.status}\n`);
            return;
        }

        const data = await response.json();

        // Verifier: if vision was called during this prompt, show the vision model name;
        // otherwise show the model that processed the prompt.
        const toolVisionModel = data.tool_calls
            ?.map((t) => t.vision_model || t.result?.result?.vision_model)
            .find(Boolean);
        const verifiedModel = data.vision_model || toolVisionModel || data.model;

        if (verifiedModel) {
            console.log(`\n[MODEL: ${verifiedModel}]`);
        } else {
            console.log();
        }

        console.log(
            data.answer ??
            data.response ??
            data.message ??
            JSON.stringify(data, null, 2)
        );

        if (data.tool_calls?.length) {
            console.log("\n[TOOLS]");
            for (const tool of data.tool_calls) {
                console.log(formatToolCallSummary(tool, data.main_model || data.model));
                const inner = tool.result?.result;
                if (inner?.results?.length) {
                    for (const step of inner.results) {
                        const stepState = step.success ? "OK" : `FAIL: ${step.error}`;
                        const winTitle = step.target_window?.title ? ` [${step.target_window.title}]` : "";
                        const stepModel =
                            step.vision_model ||
                            (String(step.detection_method || "").includes("vision")
                                ? inner.vision_model || verifiedModel
                                : null);
                        const stepModelTag = stepModel ? ` [MODEL: ${stepModel}]` : "";
                        console.log(`    [Action ${(step.step_index ?? 0) + 1}]${stepModelTag} ${step.action}${winTitle}: ${stepState} (${step.duration_ms ?? 0}ms)`);
                    }
                }
                if (inner?.steps_executed?.length) {
                    for (const step of inner.steps_executed) {
                        const stepModel = step.vision_model || step.model || inner.vision_model || null;
                        const stepModelTag = stepModel ? ` [MODEL: ${stepModel}]` : "";
                        console.log(`    [Step ${step.step}]${stepModelTag} ${step.action}: ${step.outcome} (${step.thought || ""})`);
                    }
                }
            }
        }

        console.log();
    } catch (error) {
        console.log("\n[ERROR] Could not connect to S.T.R.A.N.G.E.");
        console.log("Make sure the backend server is running.");
        console.log(error.message);
        console.log();
    }
}

const modelInfo = await resolveCurrentModelBanner();

console.log("==================================");
console.log("       S.T.R.A.N.G.E. TERMINAL");
console.log("==================================");
console.log(
    `Ollama Model : ${formatModelLabel(
        modelInfo.model,
        modelInfo.parameter_size,
        modelInfo.quantization_level
    )}`
);
console.log(
    `Vision Model : ${formatModelLabel(
        modelInfo.vision_model,
        modelInfo.vision_parameter_size,
        modelInfo.vision_quantization_level
    )}`
);
console.log(`Ollama Host  : ${modelInfo.host}`);
console.log("----------------------------------");
console.log("Type a command or question.");
console.log("Type 'exit' to quit.\n");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "S.T.R.A.N.G.E> ",
});

rl.prompt();

rl.on("line", async (input) => {
    const message = input.trim();

    if (!message) {
        rl.prompt();
        return;
    }

    if (message.toLowerCase() === "exit") {
        rl.close();
        return;
    }

    rl.pause();

    await sendMessage(message);

    rl.resume();
    rl.prompt();
});

rl.on("close", () => {
    console.log("\nS.T.R.A.N.G.E. terminal closed.");
    setImmediate(() => process.exit(0));
});
