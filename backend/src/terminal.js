import dotenv from "dotenv";
import ollama from "ollama";
import readline from "node:readline";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const API_URL = `${BASE_URL}/chat`;

async function queryLocalOllamaModel() {
    dotenv.config({ override: true });
    const configuredModel = process.env.OLLAMA_MODEL?.trim();
    const configuredVisionModel = process.env.OLLAMA_VISION_MODEL?.trim() || configuredModel;
    const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

    try {
        const [psRes, listRes] = await Promise.all([
            ollama.ps().catch(() => ({ models: [] })),
            ollama.list().catch(() => ({ models: [] }))
        ]);

        const runningModels = psRes?.models ?? [];
        const installedModels = listRes?.models ?? [];

        const targetName =
            configuredModel ||
            runningModels[0]?.model ||
            runningModels[0]?.name ||
            installedModels[0]?.model ||
            installedModels[0]?.name ||
            "unknown";

        const matchedRunning = runningModels.find(
            (m) => m.name === targetName || m.model === targetName
        );
        const matchedInstalled = installedModels.find(
            (m) => m.name === targetName || m.model === targetName
        );
        const details = matchedRunning?.details || matchedInstalled?.details || {};

        return {
            model: matchedInstalled?.model || matchedRunning?.model || targetName,
            vision_model: configuredVisionModel || matchedInstalled?.model || targetName,
            parameter_size: details.parameter_size || null,
            quantization_level: details.quantization_level || null,
            family: details.family || null,
            loaded_in_vram: Boolean(matchedRunning),
            host
        };
    } catch {
        return {
            model: configuredModel || "unknown",
            vision_model: configuredVisionModel || configuredModel || "unknown",
            parameter_size: null,
            quantization_level: null,
            family: null,
            loaded_in_vram: false,
            host
        };
    }
}

async function resolveCurrentModelBanner() {
    try {
        const res = await fetch(BASE_URL);
        if (res.ok) {
            const data = await res.json();
            if (data?.ollama?.model) {
                return data.ollama;
            }
        }
    } catch {
        // Backend not reachable yet; query local Ollama directly
    }

    return queryLocalOllamaModel();
}

function formatModelLabel(info) {
    if (!info || !info.model) return "unknown";
    const meta = [info.parameter_size, info.quantization_level].filter(Boolean).join(", ");
    return meta ? `${info.model} (${meta})` : info.model;
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

function formatToolCallSummary(tool) {
    const res = tool.result;
    const inner = res?.result;
    const status = res?.success === false ? "FAIL" : "OK";
    let detail = "";

    if (res?.success === false) {
        const stage = inner?.failed_stage ? ` [stage: ${inner.failed_stage}]` : "";
        detail = ` -> [${status}]${stage} ${res.error || inner?.error || "Unknown error"}${formatTimingsInline(inner?.timings_ms)}`;
    } else if (inner) {
        if (inner.action === "execute_action_sequence") {
            const cpReason = inner.checkpoint?.primary_reason ? `, checkpoint:${inner.checkpoint.primary_reason}` : "";
            const calcDisp = inner.calculator_display ? `, display:"${inner.calculator_display}"` : "";
            detail = ` -> [${status}] batched ${inner.total_executed}/${inner.total_requested} action(s) in "${inner.target_window?.title || inner.app_name || "Desktop"}"${calcDisp}${cpReason}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_click") {
            detail = ` -> [${status}] ${inner.click_type} ${inner.button}-click "${inner.matched_label || inner.target}" at (${inner.x}, ${inner.y}) via ${inner.detection_method}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_type") {
            const calcDisp = inner.calculator_display ? ` [display: "${inner.calculator_display}"]` : "";
            detail = ` -> [${status}] typed "${inner.text}"${inner.target ? ` into "${inner.target}"` : ""}${calcDisp}${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_scroll") {
            detail = ` -> [${status}] scrolled ${inner.direction} (${inner.amount})${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "desktop_control") {
            const calcDisp = inner.calculator_display ? `, display:"${inner.calculator_display}"` : "";
            detail = ` -> [${status}] ${inner.total_steps ?? 0} action(s) (${inner.status}${calcDisp})${formatTimingsInline(inner.timings_ms)}`;
        } else if (inner.action === "open_application") {
            detail = ` -> [${status}] opened ${inner.application_name || inner.application}`;
        } else if (inner.action === "close_application") {
            detail = ` -> [${status}] closed ${inner.application_name || inner.application}`;
        }
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

        if (data.model) {
            console.log(`\n[MODEL: ${data.model}]`);
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
                console.log(formatToolCallSummary(tool));
                const inner = tool.result?.result;
                if (inner?.results?.length) {
                    for (const step of inner.results) {
                        const stepState = step.success ? "OK" : `FAIL: ${step.error}`;
                        const winTitle = step.target_window?.title ? ` [${step.target_window.title}]` : "";
                        console.log(`    [Action ${(step.step_index ?? 0) + 1}] ${step.action}${winTitle}: ${stepState} (${step.duration_ms ?? 0}ms)`);
                    }
                }
                if (inner?.steps_executed?.length) {
                    for (const step of inner.steps_executed) {
                        console.log(`    [Step ${step.step}] ${step.action}: ${step.outcome} (${step.thought || ""})`);
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
console.log(`Ollama Model : ${formatModelLabel(modelInfo)}`);
if (modelInfo.vision_model && modelInfo.vision_model !== modelInfo.model) {
    console.log(`Vision Model : ${modelInfo.vision_model}`);
}
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
    process.exit(0);
});
