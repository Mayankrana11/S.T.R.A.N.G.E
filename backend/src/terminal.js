import dotenv from "dotenv";
import ollama from "ollama";
import readline from "node:readline";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const API_URL = `${BASE_URL}/chat`;

async function queryLocalOllamaModel() {
    dotenv.config({ override: true });
    const configuredModel = process.env.OLLAMA_MODEL?.trim();
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
            parameter_size: details.parameter_size || null,
            quantization_level: details.quantization_level || null,
            family: details.family || null,
            loaded_in_vram: Boolean(matchedRunning),
            host
        };
    } catch {
        return {
            model: configuredModel || "unknown",
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

function formatToolCallSummary(tool) {
    const res = tool.result;
    const inner = res?.result;
    const status = res?.success === false ? "FAIL" : "OK";
    let detail = "";

    if (res?.success === false) {
        const stage = inner?.failed_stage ? ` [stage: ${inner.failed_stage}]` : "";
        detail = ` -> [${status}]${stage} ${res.error || inner?.error || "Unknown error"}`;
    } else if (inner) {
        if (inner.action === "desktop_click") {
            detail = ` -> [${status}] ${inner.click_type} ${inner.button}-click "${inner.matched_label || inner.target}" at (${inner.x}, ${inner.y}) via ${inner.detection_method}`;
        } else if (inner.action === "desktop_type") {
            detail = ` -> [${status}] typed "${inner.text}"${inner.target ? ` into "${inner.target}"` : ""}`;
        } else if (inner.action === "desktop_scroll") {
            detail = ` -> [${status}] scrolled ${inner.direction} (${inner.amount})`;
        } else if (inner.action === "desktop_control") {
            detail = ` -> [${status}] ${inner.total_steps ?? 0} step(s) (${inner.status})`;
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
                if (tool.result?.result?.steps_executed?.length) {
                    for (const step of tool.result.result.steps_executed) {
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
