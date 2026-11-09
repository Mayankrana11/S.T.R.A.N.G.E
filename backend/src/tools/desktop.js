import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import ollama from "ollama";
import dotenv from "dotenv";

import { resolveApplication } from "./applications.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || process.env.OLLAMA_MODEL || "qwen3.5:4b";

const NATIVE_DIR = path.resolve(__dirname, "./native");
const NATIVE_CS_PATH = path.join(NATIVE_DIR, "StrangeDesktopNative.cs");
const NATIVE_EXE_PATH = path.join(NATIVE_DIR, "StrangeDesktopNative.exe");
const SCREENSHOT_DIR = path.resolve(__dirname, "../../sandbox/screenshots");

// Application desktop profiles: maps canonical app IDs to window process names,
// title keywords, whether Windows UIA is unoptimized (Electron/CEF), and vision layout hints.
export const APP_DESKTOP_PROFILES = {
    spotify: {
        id: "spotify",
        name: "Spotify",
        processNames: ["Spotify"],
        titleKeywords: ["spotify"],
        isElectronOrCef: true,
        uiHints:
            "Spotify Desktop UI: Left sidebar lists 'Your Library' and playlists (such as 'songs'). Top bar has Home icon and Search bar (or press Ctrl+K to search). Inside a playlist view, the large bright green circular button with a triangle is the Play button, and the crossed-arrows icon next to the green Play button (or in the bottom playback bar) is the Shuffle button."
    },
    steam: {
        id: "steam",
        name: "Steam",
        processNames: ["steamwebhelper", "steam"],
        titleKeywords: ["steam"],
        isElectronOrCef: true,
        uiHints:
            "Steam Client UI: Top navigation has STORE, LIBRARY, COMMUNITY. In LIBRARY, the left sidebar has a 'Search by Name' input box and the list of games; clicking a game opens its page with a blue 'Install' or green 'Play' button. In STORE, top-right has the 'search' input box."
    },
    discord: {
        id: "discord",
        name: "Discord",
        processNames: ["Discord"],
        titleKeywords: ["discord"],
        isElectronOrCef: true,
        uiHints:
            "Discord UI: Far-left column has server icons, second column has channels/direct messages, center pane has chat history and the message input box at the bottom."
    },
    vscode: {
        id: "vscode",
        name: "Visual Studio Code",
        processNames: ["Code"],
        titleKeywords: ["visual studio code"],
        isElectronOrCef: true,
        uiHints:
            "VS Code UI: Far-left is Activity Bar (Explorer, Search, Source Control, Extensions), left pane is Sidebar, center is Editor, bottom is Panel/Terminal."
    },
    chrome: {
        id: "chrome",
        name: "Google Chrome",
        processNames: ["chrome"],
        titleKeywords: ["google chrome", "chrome", "youtube"],
        isElectronOrCef: false,
        uiHints:
            "Google Chrome / Web UI: Top has browser tabs and the Address/URL bar (Ctrl+L focuses the URL bar). On YouTube, top center has the Search input box and magnifying glass button; left sidebar or top-right profile avatar navigates to 'Your channel' / 'You'; on a YouTube channel page, tabs include 'Home', 'Videos', 'Shorts', 'Playlists', and below the tabs is a grid of videos/shorts where the top-left (first) item is the latest video or latest short."
    },
    notepad: {
        id: "notepad",
        name: "Notepad",
        processNames: ["notepad"],
        titleKeywords: ["notepad"],
        isElectronOrCef: false,
        uiHints: "Windows Notepad UI: Top menu bar (File, Edit, View) and main text editor area."
    },
    calculator: {
        id: "calculator",
        name: "Calculator",
        processNames: ["CalculatorApp", "Calculator", "calc", "ApplicationFrameHost"],
        titleKeywords: ["calculator"],
        isElectronOrCef: false,
        uiHints: "Windows Calculator UI: Number pad (0-9), arithmetic operators (+, -, *, /, =), and Clear (C/CE) buttons."
    },
    paint: {
        id: "paint",
        name: "Paint",
        processNames: ["mspaint"],
        titleKeywords: ["paint"],
        isElectronOrCef: false,
        uiHints: "Microsoft Paint UI: Top ribbon toolbar with Tools, Brushes, Shapes, Colors, and central drawing canvas."
    },
    visual_studio: {
        id: "visual_studio",
        name: "Visual Studio",
        processNames: ["devenv"],
        titleKeywords: ["visual studio"],
        isElectronOrCef: false,
        uiHints: "Microsoft Visual Studio IDE UI: Top menu and toolbar (Start/Run button), center code editor, right Solution Explorer."
    }
};

// Track the most recently opened or interacted application so subsequent desktop tool calls
// automatically know which window to focus if app_name is omitted.
let lastActiveAppContext = {
    appId: null,
    timestamp: 0
};

export function recordActiveApplicationContext(appNameOrId) {
    if (!appNameOrId || typeof appNameOrId !== "string") return;
    const res = resolveApplication(appNameOrId);
    const canonical = res.status === "resolved" ? res.canonical_id : appNameOrId.toLowerCase().trim();
    lastActiveAppContext = {
        appId: canonical,
        timestamp: Date.now()
    };
}

// Structured terminal logger for clear debugging of every desktop control stage
function logDesktop(stage, message, details = null) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[STRANGE:DESKTOP ${timestamp}] [${stage}]`;
    if (details !== null && details !== undefined) {
        const detailStr =
            typeof details === "string"
                ? details
                : JSON.stringify(details);
        console.log(`${prefix} ${message} | ${detailStr}`);
    } else {
        console.log(`${prefix} ${message}`);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Native C# Engine Compilation & Persistent Bridge ---

function ensureNativeBinaryCompiled() {
    try {
        if (fs.existsSync(NATIVE_EXE_PATH) && fs.existsSync(NATIVE_CS_PATH)) {
            const exeStat = fs.statSync(NATIVE_EXE_PATH);
            const csStat = fs.statSync(NATIVE_CS_PATH);
            if (exeStat.mtimeMs >= csStat.mtimeMs) {
                return true;
            }
        }

        if (!fs.existsSync(NATIVE_CS_PATH)) {
            logDesktop("FAIL:NATIVE", `Native C# source file missing at ${NATIVE_CS_PATH}`);
            return false;
        }

        const fwDir = path.join(
            process.env.SystemRoot || "C:\\Windows",
            "Microsoft.NET",
            "Framework64",
            "v4.0.30319"
        );
        const cscPath = path.join(fwDir, "csc.exe");

        if (!fs.existsSync(cscPath)) {
            logDesktop("FAIL:NATIVE", `C# compiler (csc.exe) not found at ${cscPath}`);
            return false;
        }

        logDesktop("NATIVE", "Compiling StrangeDesktopNative.exe via csc.exe...");
        execFileSync(
            cscPath,
            [
                "/nologo",
                "/optimize+",
                "/target:exe",
                `/out:${NATIVE_EXE_PATH}`,
                `/r:${path.join(fwDir, "System.Drawing.dll")}`,
                `/r:${path.join(fwDir, "System.Windows.Forms.dll")}`,
                `/r:${path.join(fwDir, "System.Web.Extensions.dll")}`,
                `/r:${path.join(fwDir, "WPF", "UIAutomationClient.dll")}`,
                `/r:${path.join(fwDir, "WPF", "UIAutomationTypes.dll")}`,
                `/r:${path.join(fwDir, "WPF", "WindowsBase.dll")}`,
                NATIVE_CS_PATH
            ],
            {
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 20000
            }
        );

        logDesktop("NATIVE", "StrangeDesktopNative.exe compiled successfully.");
        return fs.existsSync(NATIVE_EXE_PATH);
    } catch (error) {
        logDesktop("FAIL:NATIVE", `Failed to compile StrangeDesktopNative.exe: ${error.message}`);
        return false;
    }
}

class NativeDesktopBridge {
    constructor() {
        this.proc = null;
        this.rl = null;
        this.reqCounter = 0;
        this.pending = new Map();
    }

    async ensureStarted() {
        if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
            return true;
        }

        if (!ensureNativeBinaryCompiled()) {
            throw new Error("StrangeDesktopNative.exe is unavailable and could not be compiled.");
        }

        this.proc = spawn(NATIVE_EXE_PATH, ["--server"], {
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"]
        });

        this.rl = readline.createInterface({
            input: this.proc.stdout,
            crlfDelay: Infinity
        });

        this.rl.on("line", (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
                const parsed = JSON.parse(trimmed);
                const id = parsed.id;
                if (id !== undefined && this.pending.has(id)) {
                    const { resolve, timer } = this.pending.get(id);
                    clearTimeout(timer);
                    this.pending.delete(id);
                    resolve(parsed);
                }
            } catch (err) {
                logDesktop("WARN:NATIVE", `Malformed JSON from native bridge: ${trimmed.slice(0, 160)}`);
            }
        });

        this.proc.on("exit", (code) => {
            for (const [, entry] of this.pending.entries()) {
                clearTimeout(entry.timer);
                entry.reject(new Error(`Native desktop bridge exited unexpectedly (code ${code})`));
            }
            this.pending.clear();
            this.proc = null;
        });

        this.proc.on("error", (err) => {
            logDesktop("FAIL:NATIVE", `Native process error: ${err.message}`);
        });

        return true;
    }

    async send(command, payload = {}, timeoutMs = 10000) {
        await this.ensureStarted();
        const id = ++this.reqCounter;
        const message = JSON.stringify({ id, command, ...payload }) + "\n";

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`Native desktop command "${command}" timed out after ${timeoutMs}ms`));
                }
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });

            try {
                this.proc.stdin.write(message, "utf8");
            } catch (err) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(err);
            }
        });
    }
}

const nativeBridge = new NativeDesktopBridge();

// --- Strict Sequential Action Queue (Mutex) ---
// Ensures cursor movements, clicks, keystrokes, scrolls, and window focus operations
// execute strictly one after another and never overlap.
let actionQueuePromise = Promise.resolve();
let actionSequenceCounter = 0;

function enqueueDesktopAction(actionName, summary, fn) {
    const seqId = ++actionSequenceCounter;
    logDesktop("QUEUE", `Enqueued #${seqId} ${actionName}`, summary);

    const run = async () => {
        const t0 = Date.now();
        logDesktop("START", `Executing #${seqId} ${actionName}`);
        try {
            const result = await fn(seqId);
            const elapsed = Date.now() - t0;
            if (result && result.success === false) {
                logDesktop("FAIL", `Action #${seqId} ${actionName} failed in ${elapsed}ms`, {
                    error: result.error,
                    stage: result.failed_stage || "execution"
                });
            } else {
                logDesktop("DONE", `Action #${seqId} ${actionName} succeeded in ${elapsed}ms`);
            }
            return result;
        } catch (error) {
            const elapsed = Date.now() - t0;
            logDesktop("ERROR", `Action #${seqId} ${actionName} threw exception after ${elapsed}ms: ${error.message}`);
            return {
                success: false,
                action: actionName,
                failed_stage: "exception",
                error: error.message
            };
        }
    };

    const nextPromise = actionQueuePromise.then(run, run);
    // Keep queue alive even if one action rejects
    actionQueuePromise = nextPromise.catch(() => {});
    return nextPromise;
}

// --- Application Profile & Window Focusing Helpers ---

export function resolveDesktopAppProfile(appName) {
    const raw = typeof appName === "string" ? appName.trim() : "";

    if (!raw) {
        // Check if an app was recently opened/interacted with within the last 5 minutes
        if (
            lastActiveAppContext.appId &&
            Date.now() - lastActiveAppContext.timestamp < 5 * 60 * 1000
        ) {
            const cachedId = lastActiveAppContext.appId;
            if (APP_DESKTOP_PROFILES[cachedId]) {
                return APP_DESKTOP_PROFILES[cachedId];
            }
        }
        return null;
    }

    const lower = raw.toLowerCase();
    if (
        lower.includes("youtube") ||
        lower.includes("browser") ||
        lower.includes("web") ||
        lower.includes("google")
    ) {
        return APP_DESKTOP_PROFILES.chrome;
    }

    const appRes = resolveApplication(raw);
    if (appRes.status === "resolved" && APP_DESKTOP_PROFILES[appRes.canonical_id]) {
        return APP_DESKTOP_PROFILES[appRes.canonical_id];
    }

    if (APP_DESKTOP_PROFILES[lower]) {
        return APP_DESKTOP_PROFILES[lower];
    }

    // Dynamic fallback profile for arbitrary window titles/processes
    return {
        id: lower,
        name: raw,
        processNames: [lower.replace(/\.exe$/i, "")],
        titleKeywords: [lower],
        isElectronOrCef: false,
        uiHints: `Application window: ${raw}`
    };
}

function isElectronOrCefWindow(windowInfo, profile) {
    if (profile?.isElectronOrCef) return true;
    const proc = (windowInfo?.process_name || "").toLowerCase();
    const cls = (windowInfo?.class_name || "").toLowerCase();

    if (
        proc === "spotify" ||
        proc === "steam" ||
        proc === "steamwebhelper" ||
        proc === "discord" ||
        proc === "code"
    ) {
        return true;
    }

    // Electron apps also use Chrome_WidgetWin_1, whereas actual Google Chrome has process_name === "chrome"
    if (cls.includes("sdl_app") || cls.includes("vguipopupwindow")) {
        return true;
    }

    return false;
}

export async function ensureTargetWindow(appName, options = {}) {
    const {
        waitTimeoutMs = 7500,
        settleAfterFocusMs = 280
    } = options;

    const profile = resolveDesktopAppProfile(appName);

    if (!profile && !appName) {
        const active = await nativeBridge.send("get_active_window");
        if (active?.success) {
            return {
                success: true,
                window: active,
                profile: null,
                is_electron: isElectronOrCefWindow(active, null)
            };
        }
        return {
            success: false,
            failed_stage: "window_lookup",
            error: active?.error || "No active foreground window detected."
        };
    }

    const deadline = Date.now() + waitTimeoutMs;
    let attempts = 0;
    let lastError = null;

    while (Date.now() <= deadline) {
        attempts++;
        const focusRes = await nativeBridge.send("focus_window", {
            process_names: profile.processNames,
            title_query: profile.titleKeywords?.[0] || profile.name
        });

        if (focusRes?.success && focusRes.rect?.width >= 100 && focusRes.rect?.height >= 80) {
            recordActiveApplicationContext(profile.id);

            // If we had to wait multiple attempts because the app was just launched, give its UI extra time to render
            const extraWait = attempts > 1 ? 850 : settleAfterFocusMs;
            if (extraWait > 0) {
                await sleep(extraWait);
            }

            logDesktop("WINDOW", `Focused "${focusRes.title}" (${focusRes.process_name}, PID ${focusRes.pid})`, {
                hwnd: focusRes.hwnd,
                rect: focusRes.rect,
                attempts
            });

            return {
                success: true,
                window: focusRes,
                profile,
                is_electron: isElectronOrCefWindow(focusRes, profile)
            };
        }

        lastError = focusRes?.error || `Window for "${profile.name}" not found yet`;
        await sleep(350);
    }

    logDesktop(
        "FAIL:WINDOW",
        `Could not find or focus window for "${profile.name}" after ${waitTimeoutMs}ms (${attempts} attempts)`
    );

    return {
        success: false,
        failed_stage: "window_focus",
        app_name: profile.id,
        error: `Window for "${profile.name}" is not open or visible (${lastError}). Call open_application first to launch ${profile.name}.`
    };
}

// --- Hybrid Target Detection: Windows UI Automation (UIA) First + Qwen3.5 Vision Fallback ---

async function selectUiaElementWithLLM(target, elements, windowInfo) {
    const interactiveCandidates = elements
        .filter((el) => el.name || el.help_text || el.automation_id)
        .slice(0, 45)
        .map((el) => ({
            index: el.index,
            type: el.control_type,
            name: el.name || el.help_text || el.automation_id,
            pos: [el.x, el.y]
        }));

    if (interactiveCandidates.length === 0) {
        return null;
    }

    const prompt = `You are selecting a Windows UI Automation element inside window "${windowInfo?.title || "Application"}".
Target requested by user: "${target}"

Available UI elements:
${JSON.stringify(interactiveCandidates)}

If one of the elements clearly matches "${target}", return JSON:
{"found": true, "index": <element index number>, "confidence": <0.0 to 1.0>, "reason": "<brief reason>"}
If none of the elements match "${target}", return JSON:
{"found": false, "index": -1, "confidence": 0, "reason": "not in UIA list"}`;

    try {
        const t0 = Date.now();
        const response = await ollama.chat({
            model: VISION_MODEL,
            think: false,
            format: "json",
            messages: [{ role: "user", content: prompt }]
        });

        const parsed = JSON.parse(response.message?.content || "{}");
        logDesktop("UIA:LLM", `Evaluated ${interactiveCandidates.length} UIA candidates in ${Date.now() - t0}ms`, parsed);

        if (parsed.found && typeof parsed.index === "number" && (parsed.confidence ?? 0.8) >= 0.65) {
            const matched = elements.find((e) => e.index === parsed.index);
            if (matched) {
                return {
                    element: matched,
                    confidence: parsed.confidence ?? 0.8,
                    reason: parsed.reason
                };
            }
        }
    } catch (err) {
        logDesktop("WARN:UIA:LLM", `UIA text LLM selection failed: ${err.message}`);
    }

    return null;
}

export async function tryResolveWithUIA(target, windowInfo, profile) {
    const t0 = Date.now();
    const uiaRes = await nativeBridge.send("uia_inspect", {
        hwnd: windowInfo?.hwnd || 0,
        query: target,
        max_elements: 180,
        timeout_ms: 1600
    });

    if (!uiaRes?.success) {
        logDesktop("WARN:UIA", `UIA inspection failed: ${uiaRes?.error || "unknown error"}`);
        return {
            found: false,
            reason: uiaRes?.error || "UIA inspect failed"
        };
    }

    const count = uiaRes.element_count || 0;
    const best = uiaRes.best_match;

    logDesktop(
        "UIA",
        `Scanned ${count} UIA elements (visited ${uiaRes.visited_nodes} nodes) in ${uiaRes.elapsed_ms}ms`,
        best ? { best_name: best.name, best_type: best.control_type, score: best.score, x: best.x, y: best.y } : { best_match: null }
    );

    // 1. High-confidence direct heuristic match (0ms LLM cost!)
    if (best && best.score >= 0.74) {
        return {
            found: true,
            method: "uia_direct",
            x: best.x,
            y: best.y,
            rect: best.rect,
            label: best.name || best.automation_id || best.help_text || target,
            control_type: best.control_type,
            confidence: best.score,
            elapsed_ms: Date.now() - t0
        };
    }

    // 2. If UIA returned rich interactive elements (e.g. Chrome browser bar / webpage or native app),
    // try fast text-only LLM selection before taking a screenshot
    if (count >= 4 && Array.isArray(uiaRes.elements)) {
        const llmPick = await selectUiaElementWithLLM(target, uiaRes.elements, windowInfo);
        if (llmPick?.element) {
            const el = llmPick.element;
            return {
                found: true,
                method: "uia_llm",
                x: el.x,
                y: el.y,
                rect: el.rect,
                label: el.name || el.automation_id || el.help_text || target,
                control_type: el.control_type,
                confidence: llmPick.confidence,
                elapsed_ms: Date.now() - t0
            };
        }
    }

    return {
        found: false,
        element_count: count,
        reason: count === 0 ? "No UIA elements exposed by window" : `Target "${target}" not matched among ${count} UIA elements`
    };
}

function parseVisionCoordinates(parsed, captureRect, imageSize) {
    if (!parsed || !parsed.found) return null;

    let normX = null;
    let normY = null;
    let bbox = parsed.bbox_2d || parsed.bbox || parsed.box;

    if (Array.isArray(bbox) && bbox.length === 4) {
        const [x1, y1, x2, y2] = bbox.map(Number);
        if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;

            // Check if model returned 0..1 ratios vs 0..1000 normalized vs image pixel coordinates
            if (x2 <= 1.0 && y2 <= 1.0 && x2 > 0 && y2 > 0) {
                normX = cx * 1000;
                normY = cy * 1000;
            } else if (
                imageSize?.width > 1000 &&
                (x2 > 1005 || y2 > 1005)
            ) {
                normX = (cx / imageSize.width) * 1000;
                normY = (cy / imageSize.height) * 1000;
            } else {
                normX = cx;
                normY = cy;
            }
        }
    } else if (Number.isFinite(Number(parsed.x)) && Number.isFinite(Number(parsed.y))) {
        const px = Number(parsed.x);
        const py = Number(parsed.y);
        if (px <= 1.0 && py <= 1.0 && px > 0 && py > 0) {
            normX = px * 1000;
            normY = py * 1000;
        } else {
            normX = px;
            normY = py;
        }
    }

    if (normX === null || normY === null) return null;

    // Clamp normalized coordinates to [0, 1000]
    normX = Math.max(0, Math.min(1000, normX));
    normY = Math.max(0, Math.min(1000, normY));

    const screenX = Math.round(captureRect.x + (normX / 1000) * captureRect.width);
    const screenY = Math.round(captureRect.y + (normY / 1000) * captureRect.height);

    return {
        x: screenX,
        y: screenY,
        norm_x: Math.round(normX),
        norm_y: Math.round(normY),
        bbox_2d: bbox || null
    };
}

export async function tryResolveWithVision(target, windowInfo, profile, extraContext = "") {
    const t0 = Date.now();
    await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
    const latestScreenshotPath = path.join(SCREENSHOT_DIR, "latest_vision.jpg");

    const cropRect =
        windowInfo?.rect?.width >= 120 && windowInfo?.rect?.height >= 100
            ? windowInfo.rect
            : undefined;

    const shotRes = await nativeBridge.send("screenshot", {
        hwnd: windowInfo?.hwnd || 0,
        crop_rect: cropRect,
        max_width: 1280,
        format: "jpeg",
        quality: 84,
        save_path: latestScreenshotPath
    });

    if (!shotRes?.success || !shotRes.base64) {
        logDesktop("FAIL:SCREENSHOT", `Screenshot capture failed: ${shotRes?.error || "No image data"}`);
        return {
            found: false,
            reason: `Screenshot failed: ${shotRes?.error || "No image data"}`
        };
    }

    const captureRect = shotRes.capture_rect;
    const imageSize = shotRes.image_size;

    logDesktop("VISION:SHOT", `Captured ${captureRect.width}x${captureRect.height} (resized ${imageSize.width}x${imageSize.height}, ${Math.round(shotRes.byte_length / 1024)}KB)`, {
        origin: `(${captureRect.x}, ${captureRect.y})`,
        saved: latestScreenshotPath
    });

    const appHint = profile?.uiHints ? `\nApplication UI Hints: ${profile.uiHints}` : "";
    const winTitle = windowInfo?.title ? `Window Title: "${windowInfo.title}" (${windowInfo.process_name})` : "Full Desktop Screen";

    const prompt = `You are a precision desktop vision grounding model analyzing a screenshot of ${winTitle}.${appHint}${extraContext ? `\nContext: ${extraContext}` : ""}

Locate the UI element matching this target: "${target}"

Instructions:
1. Carefully inspect buttons, icons, playlists, links, tabs, search bars, and text labels in the screenshot.
2. If the target is an icon button (such as Spotify's green Play triangle button, Spotify's crossed-arrows Shuffle button, a magnifying glass Search icon, or a YouTube video thumbnail), locate the icon's bounding box.
3. Return coordinates using 0-1000 normalized bounding box format [x1, y1, x2, y2] where (0,0) is top-left and (1000,1000) is bottom-right of the image.
4. If the target element is not currently visible on screen, set "found": false and indicate if scrolling "down" or "up" might reveal it.

Respond ONLY with valid JSON in this exact format:
{
  "found": true,
  "label": "name or description of matched element",
  "bbox_2d": [x1, y1, x2, y2],
  "confidence": 0.92,
  "needs_scroll": "none",
  "visible_summary": "brief 1-sentence summary of what is currently visible",
  "reason": "brief explanation of where the element is located"
}`;

    try {
        const llmStart = Date.now();
        const response = await ollama.chat({
            model: VISION_MODEL,
            think: false,
            format: "json",
            messages: [
                {
                    role: "user",
                    content: prompt,
                    images: [shotRes.base64]
                }
            ]
        });

        const llmMs = Date.now() - llmStart;
        const rawContent = response.message?.content || "{}";
        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            logDesktop("FAIL:VISION:JSON", `Vision model returned non-JSON: ${rawContent.slice(0, 200)}`);
            return {
                found: false,
                reason: "Vision model output was not valid JSON",
                raw_output: rawContent
            };
        }

        const coords = parseVisionCoordinates(parsed, captureRect, imageSize);
        if (parsed.found && coords) {
            logDesktop(
                "VISION:MATCH",
                `Located "${parsed.label || target}" at screen (${coords.x}, ${coords.y}) [norm: ${coords.norm_x},${coords.norm_y}] in ${llmMs}ms`,
                {
                    bbox_2d: coords.bbox_2d,
                    confidence: parsed.confidence,
                    reason: parsed.reason
                }
            );

            return {
                found: true,
                method: "vision",
                x: coords.x,
                y: coords.y,
                bbox_2d: coords.bbox_2d,
                capture_rect: captureRect,
                screenshot_path: latestScreenshotPath,
                label: parsed.label || target,
                confidence: parsed.confidence ?? 0.85,
                visible_summary: parsed.visible_summary,
                reason: parsed.reason,
                elapsed_ms: Date.now() - t0
            };
        }

        logDesktop("VISION:MISS", `Target "${target}" not found in current view (${llmMs}ms)`, {
            reason: parsed.reason,
            needs_scroll: parsed.needs_scroll,
            visible_summary: parsed.visible_summary
        });

        return {
            found: false,
            method: "vision",
            needs_scroll: parsed.needs_scroll || "none",
            visible_summary: parsed.visible_summary || null,
            reason: parsed.reason || `Target "${target}" was not found in the screenshot`,
            screenshot_path: latestScreenshotPath,
            elapsed_ms: Date.now() - t0
        };
    } catch (error) {
        logDesktop("FAIL:VISION", `Vision inference error: ${error.message}`);
        return {
            found: false,
            method: "vision",
            reason: `Vision inference failed: ${error.message}`
        };
    }
}

export async function resolveTargetCoordinates({
    target,
    appName,
    windowInfo,
    profile,
    mode = "auto",
    allowScrollRetry = true,
    maxScrollRetries = 2
}) {
    const isElectron = isElectronOrCefWindow(windowInfo, profile);
    const shouldTryUia =
        mode === "uia" ||
        (mode === "auto" && !isElectron);

    // 1. Try Windows UI Automation first for non-Electron apps (Chrome, Notepad, Calculator, Paint, etc.)
    if (shouldTryUia) {
        logDesktop("RESOLVE", `Attempting Windows UI Automation (UIA) first for target="${target}" in "${windowInfo?.title || appName || "Desktop"}"`);
        const uiaResult = await tryResolveWithUIA(target, windowInfo, profile);
        if (uiaResult.found) {
            return uiaResult;
        }
        if (mode === "uia") {
            return {
                found: false,
                failed_stage: "uia_lookup",
                error: uiaResult.reason || `Target "${target}" not found in Windows UI Automation tree.`
            };
        }
        logDesktop("FALLBACK", `UIA did not find "${target}" (${uiaResult.reason}). Switching to Qwen3.5 Vision screenshot inference...`);
    } else {
        logDesktop(
            "UIA:SKIP",
            `Skipping UIA for Electron/CEF app "${profile?.name || windowInfo?.process_name || appName}" -> Using Qwen3.5 Vision directly`
        );
    }

    // 2. Vision Screenshot Inference via qwen3.5:4b (with optional sequential scroll retry if element is below the fold)
    let visionResult = await tryResolveWithVision(target, windowInfo, profile);
    if (visionResult.found) {
        return visionResult;
    }

    if (allowScrollRetry && maxScrollRetries > 0 && windowInfo?.rect) {
        const scrollDir =
            visionResult.needs_scroll === "up" ? "up" : "down";
        const scrollX = Math.round(windowInfo.rect.x + windowInfo.rect.width * 0.5);
        const scrollY = Math.round(windowInfo.rect.y + windowInfo.rect.height * 0.55);

        for (let retry = 1; retry <= maxScrollRetries; retry++) {
            logDesktop(
                "SCROLL_RETRY",
                `Target "${target}" not visible; scrolling ${scrollDir} at (${scrollX}, ${scrollY}) [attempt ${retry}/${maxScrollRetries}]`
            );

            await nativeBridge.send("mouse_scroll", {
                direction: scrollDir,
                amount: 5,
                x: scrollX,
                y: scrollY
            });

            await sleep(480);

            visionResult = await tryResolveWithVision(
                target,
                windowInfo,
                profile,
                `Scrolled ${scrollDir} (attempt ${retry}) to look for "${target}".`
            );

            if (visionResult.found) {
                return visionResult;
            }
        }
    }

    return {
        found: false,
        failed_stage: "vision_lookup",
        visible_summary: visionResult.visible_summary,
        screenshot_path: visionResult.screenshot_path,
        error: visionResult.reason || `Could not locate target "${target}" via UIA or Vision.`
    };
}

// --- Exported Desktop Primitives & Tools ---

export async function moveMouse(args = {}) {
    const x = Number(args.x);
    const y = Number(args.y);
    const smooth = args.smooth !== false;
    const durationMs = Number(args.duration_ms ?? 120);

    return enqueueDesktopAction("move_mouse", { x, y, smooth }, async () => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return {
                success: false,
                action: "move_mouse",
                failed_stage: "validation",
                error: "Both x and y coordinates must be valid numbers."
            };
        }

        const res = await nativeBridge.send("move_mouse", {
            x: Math.round(x),
            y: Math.round(y),
            smooth,
            duration_ms: durationMs
        });

        await sleep(100);
        return {
            ...res,
            action: "move_mouse",
            simulated: false
        };
    });
}

export async function desktopClick(args = {}) {
    const button = (args.button || "left").toLowerCase();
    const clickType = (args.click_type || "single").toLowerCase();
    const target = typeof args.target === "string" ? args.target.trim() : "";
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const mode = (args.mode || "auto").toLowerCase();
    const hasExplicitCoords =
        args.x !== undefined &&
        args.y !== undefined &&
        args.x !== null &&
        args.y !== null &&
        Number.isFinite(Number(args.x)) &&
        Number.isFinite(Number(args.y));

    return enqueueDesktopAction(
        "desktop_click",
        { target: target || null, app_name: appName || null, button, click_type: clickType, x: args.x, y: args.y },
        async () => {
            if (!target && !hasExplicitCoords) {
                return {
                    success: false,
                    action: "desktop_click",
                    failed_stage: "validation",
                    error: "desktop_click requires either a 'target' UI element description or explicit 'x' and 'y' coordinates."
                };
            }

            let windowInfo = null;
            let profile = null;

            if (appName || !hasExplicitCoords) {
                const winRes = await ensureTargetWindow(appName);
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_click",
                        failed_stage: winRes.failed_stage || "window_focus",
                        app_name: appName,
                        error: winRes.error
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            let clickX = hasExplicitCoords ? Math.round(Number(args.x)) : null;
            let clickY = hasExplicitCoords ? Math.round(Number(args.y)) : null;
            let resolutionInfo = {
                method: "explicit_coordinates",
                label: target || `(${clickX}, ${clickY})`,
                confidence: 1
            };

            if (!hasExplicitCoords) {
                const resolved = await resolveTargetCoordinates({
                    target,
                    appName,
                    windowInfo,
                    profile,
                    mode,
                    allowScrollRetry: args.scroll_if_needed !== false
                });

                if (!resolved.found) {
                    return {
                        success: false,
                        action: "desktop_click",
                        failed_stage: resolved.failed_stage || "target_resolution",
                        target,
                        app_name: appName || windowInfo?.process_name || null,
                        window_title: windowInfo?.title || null,
                        visible_summary: resolved.visible_summary || null,
                        screenshot_path: resolved.screenshot_path || null,
                        error: resolved.error || `Could not find target "${target}" on screen.`,
                        simulated: false
                    };
                }

                clickX = resolved.x;
                clickY = resolved.y;
                resolutionInfo = resolved;
            }

            logDesktop(
                "INPUT:CLICK",
                `Performing sequential ${clickType} ${button}-click at (${clickX}, ${clickY}) [target="${resolutionInfo.label}", method=${resolutionInfo.method}]`
            );

            const clickRes = await nativeBridge.send("mouse_click", {
                x: clickX,
                y: clickY,
                button,
                click_type: clickType,
                smooth: true,
                duration_ms: 125,
                settle_ms: 55
            });

            if (!clickRes?.success) {
                return {
                    success: false,
                    action: "desktop_click",
                    failed_stage: "mouse_click",
                    target: target || null,
                    requested_x: clickX,
                    requested_y: clickY,
                    error: clickRes?.error || "Native mouse click failed.",
                    simulated: false
                };
            }

            // Post-click UI settle delay so menus/pages/buttons react before the next sequential action
            await sleep(360);

            return {
                success: true,
                action: "desktop_click",
                button,
                click_type: clickType,
                target: target || null,
                matched_label: resolutionInfo.label,
                detection_method: resolutionInfo.method,
                confidence: resolutionInfo.confidence,
                x: clickRes.x,
                y: clickRes.y,
                window_title: windowInfo?.title || null,
                app_name: profile?.id || appName || windowInfo?.process_name || null,
                simulated: false
            };
        }
    );
}

export async function leftClick(args = {}) {
    return desktopClick({ ...args, button: "left", click_type: "single" });
}

export async function rightClick(args = {}) {
    return desktopClick({ ...args, button: "right", click_type: "single" });
}

export async function doubleClick(args = {}) {
    return desktopClick({ ...args, button: "left", click_type: "double" });
}

export async function scrollDesktop(args = {}) {
    const direction = (args.direction || "down").toLowerCase();
    const amount = Math.max(1, Math.min(40, Number(args.amount ?? 5)));
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const target = typeof args.target === "string" ? args.target.trim() : "";

    return enqueueDesktopAction(
        "desktop_scroll",
        { direction, amount, app_name: appName || null, target: target || null },
        async () => {
            if (!["up", "down", "left", "right"].includes(direction)) {
                return {
                    success: false,
                    action: "desktop_scroll",
                    failed_stage: "validation",
                    error: `Invalid scroll direction "${direction}". Must be one of: up, down, left, right.`
                };
            }

            let windowInfo = null;
            let profile = null;
            if (appName || target) {
                const winRes = await ensureTargetWindow(appName);
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_scroll",
                        failed_stage: "window_focus",
                        error: winRes.error
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            let scrollX = Number.isFinite(Number(args.x)) ? Math.round(Number(args.x)) : null;
            let scrollY = Number.isFinite(Number(args.y)) ? Math.round(Number(args.y)) : null;

            if (scrollX === null && scrollY === null && target) {
                const resolved = await resolveTargetCoordinates({
                    target,
                    appName,
                    windowInfo,
                    profile,
                    allowScrollRetry: false
                });
                if (resolved.found) {
                    scrollX = resolved.x;
                    scrollY = resolved.y;
                }
            }

            // Default to center of target window so scroll wheel events go to the active scrollable pane
            if (scrollX === null && scrollY === null && windowInfo?.rect) {
                scrollX = Math.round(windowInfo.rect.x + windowInfo.rect.width * 0.5);
                scrollY = Math.round(windowInfo.rect.y + windowInfo.rect.height * 0.55);
            }

            const scrollRes = await nativeBridge.send("mouse_scroll", {
                direction,
                amount,
                x: scrollX,
                y: scrollY
            });

            if (!scrollRes?.success) {
                return {
                    success: false,
                    action: "desktop_scroll",
                    failed_stage: "mouse_scroll",
                    error: scrollRes?.error || "Mouse scroll failed.",
                    simulated: false
                };
            }

            await sleep(320);

            return {
                success: true,
                action: "desktop_scroll",
                direction,
                amount,
                x: scrollRes.x,
                y: scrollRes.y,
                window_title: windowInfo?.title || null,
                simulated: false
            };
        }
    );
}

export async function typeText(args = {}) {
    const text = typeof args.text === "string" ? args.text : String(args.text ?? "");
    const target = typeof args.target === "string" ? args.target.trim() : "";
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const pressEnter = args.press_enter !== undefined ? Boolean(args.press_enter) : false;
    const clearFirst = args.clear_first !== undefined ? Boolean(args.clear_first) : false;

    return enqueueDesktopAction(
        "desktop_type",
        { text, target: target || null, app_name: appName || null, press_enter: pressEnter, clear_first: clearFirst },
        async () => {
            if (!text) {
                return {
                    success: false,
                    action: "desktop_type",
                    failed_stage: "validation",
                    error: "Text to type must not be empty."
                };
            }

            let windowInfo = null;
            let profile = null;
            if (appName || target) {
                const winRes = await ensureTargetWindow(appName);
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_type",
                        failed_stage: "window_focus",
                        error: winRes.error
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            let clickedInput = null;
            if (target) {
                const resolved = await resolveTargetCoordinates({
                    target,
                    appName,
                    windowInfo,
                    profile,
                    allowScrollRetry: false
                });

                if (!resolved.found) {
                    return {
                        success: false,
                        action: "desktop_type",
                        failed_stage: "input_target_lookup",
                        target,
                        error: resolved.error || `Could not locate input field "${target}" before typing.`,
                        simulated: false
                    };
                }

                logDesktop("INPUT:FOCUS_FIELD", `Clicking input field "${target}" at (${resolved.x}, ${resolved.y}) before typing`);
                const clickRes = await nativeBridge.send("mouse_click", {
                    x: resolved.x,
                    y: resolved.y,
                    button: "left",
                    click_type: "single",
                    smooth: true,
                    duration_ms: 110,
                    settle_ms: 50
                });

                if (!clickRes?.success) {
                    return {
                        success: false,
                        action: "desktop_type",
                        failed_stage: "input_field_click",
                        error: clickRes?.error || `Failed to click input field "${target}"`,
                        simulated: false
                    };
                }

                clickedInput = {
                    x: resolved.x,
                    y: resolved.y,
                    method: resolved.method,
                    label: resolved.label
                };

                await sleep(220);
            }

            logDesktop("INPUT:TYPE", `Typing "${text}" (clear_first=${clearFirst}, press_enter=${pressEnter})`);
            const typeRes = await nativeBridge.send("type_text", {
                text,
                clear_first: clearFirst,
                press_enter: pressEnter,
                delay_ms: 15
            });

            if (!typeRes?.success) {
                return {
                    success: false,
                    action: "desktop_type",
                    failed_stage: "type_text",
                    error: typeRes?.error || "Failed to type text.",
                    simulated: false
                };
            }

            await sleep(pressEnter ? 500 : 250);

            return {
                success: true,
                action: "desktop_type",
                text,
                target: target || null,
                clicked_input: clickedInput,
                cleared_first: clearFirst,
                pressed_enter: pressEnter,
                window_title: windowInfo?.title || null,
                simulated: false
            };
        }
    );
}

export async function pressKey(args = {}) {
    const key = typeof args.key === "string" ? args.key.trim() : "";
    const modifiers = Array.isArray(args.modifiers) ? args.modifiers : [];
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";

    return enqueueDesktopAction(
        "desktop_press_key",
        { key, modifiers, app_name: appName || null },
        async () => {
            if (!key) {
                return {
                    success: false,
                    action: "desktop_press_key",
                    failed_stage: "validation",
                    error: "Key name is required (e.g. 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k')."
                };
            }

            let windowInfo = null;
            if (appName) {
                const winRes = await ensureTargetWindow(appName);
                if (!winRes.success) {
                    return {
                        success: false,
                        action: "desktop_press_key",
                        failed_stage: "window_focus",
                        error: winRes.error
                    };
                }
                windowInfo = winRes.window;
            }

            logDesktop("INPUT:KEY", `Pressing key "${key}"`, { modifiers });
            const keyRes = await nativeBridge.send("key_press", {
                key,
                modifiers
            });

            if (!keyRes?.success) {
                return {
                    success: false,
                    action: "desktop_press_key",
                    failed_stage: "key_press",
                    error: keyRes?.error || `Failed to press key "${key}".`,
                    simulated: false
                };
            }

            await sleep(280);

            return {
                success: true,
                action: "desktop_press_key",
                key,
                modifiers,
                window_title: windowInfo?.title || null,
                simulated: false
            };
        }
    );
}

export async function captureDesktopScreenshot(args = {}) {
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";

    return enqueueDesktopAction(
        "take_screenshot",
        { app_name: appName || null },
        async () => {
            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
            const fileName = `screenshot-${Date.now()}.jpg`;
            const savePath = path.join(SCREENSHOT_DIR, fileName);

            let cropRect;
            let windowTitle = null;
            if (appName) {
                const winRes = await ensureTargetWindow(appName);
                if (winRes.success && winRes.window?.rect) {
                    cropRect = winRes.window.rect;
                    windowTitle = winRes.window.title;
                }
            }

            const shotRes = await nativeBridge.send("screenshot", {
                crop_rect: cropRect,
                max_width: 1366,
                format: "jpeg",
                quality: 85,
                save_path: savePath
            });

            if (!shotRes?.success) {
                return {
                    success: false,
                    screenshot_available: false,
                    simulated: false,
                    error: shotRes?.error || "Screenshot capture failed."
                };
            }

            return {
                success: true,
                screenshot_available: true,
                simulated: false,
                path: savePath,
                window_title: windowTitle,
                capture_rect: shotRes.capture_rect,
                image_size: shotRes.image_size,
                byte_length: shotRes.byte_length
            };
        }
    );
}

export async function inspectDesktopUI(args = {}) {
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const question = typeof args.question === "string" ? args.question.trim() : "Describe the visible interactive UI elements, buttons, playlists, or items.";

    return enqueueDesktopAction(
        "desktop_inspect",
        { app_name: appName || null, question },
        async () => {
            const winRes = await ensureTargetWindow(appName);
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "desktop_inspect",
                    failed_stage: "window_focus",
                    error: winRes.error
                };
            }

            const windowInfo = winRes.window || null;
            const profile = winRes.profile || null;
            const isElectron = isElectronOrCefWindow(windowInfo, profile);

            let uiaSummary = [];
            if (!isElectron && windowInfo?.hwnd) {
                const uiaRes = await nativeBridge.send("uia_inspect", {
                    hwnd: windowInfo.hwnd,
                    max_elements: 60,
                    timeout_ms: 1200
                });
                if (uiaRes?.success && Array.isArray(uiaRes.elements)) {
                    uiaSummary = uiaRes.elements
                        .filter((e) => e.name)
                        .slice(0, 35)
                        .map((e) => ({
                            name: e.name,
                            type: e.control_type,
                            x: e.x,
                            y: e.y
                        }));
                }
            }

            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
            const savePath = path.join(SCREENSHOT_DIR, "latest_inspect.jpg");
            const shotRes = await nativeBridge.send("screenshot", {
                hwnd: windowInfo?.hwnd || 0,
                crop_rect: windowInfo?.rect,
                max_width: 1280,
                format: "jpeg",
                quality: 84,
                save_path: savePath
            });

            if (!shotRes?.success || !shotRes.base64) {
                return {
                    success: false,
                    action: "desktop_inspect",
                    failed_stage: "screenshot",
                    error: shotRes?.error || "Failed to capture screenshot for UI inspection."
                };
            }

            const prompt = `Inspect this screenshot of "${windowInfo?.title || "Desktop"}".
Question / Focus: ${question}
Return JSON with:
{
  "summary": "concise description of current screen state",
  "visible_elements": ["list of key visible buttons, playlists, tabs, inputs, or items"],
  "answer": "direct answer to the question"
}`;

            const response = await ollama.chat({
                model: VISION_MODEL,
                think: false,
                format: "json",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                        images: [shotRes.base64]
                    }
                ]
            });

            let parsed = {};
            try {
                parsed = JSON.parse(response.message?.content || "{}");
            } catch {
                parsed = { summary: response.message?.content || "" };
            }

            return {
                success: true,
                action: "desktop_inspect",
                window_title: windowInfo?.title || null,
                process_name: windowInfo?.process_name || null,
                is_electron: isElectron,
                uia_elements_sample: uiaSummary,
                vision_analysis: parsed,
                screenshot_path: savePath,
                simulated: false
            };
        }
    );
}

// --- Autonomous Multi-Step In-Application Desktop Controller ---
// Guides the cursor and keyboard step-by-step using UIA (when available) + Qwen3.5 Vision screenshots
export async function desktopControl(args = {}) {
    const goal = typeof args.goal === "string" ? args.goal.trim() : "";
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const maxSteps = Math.max(1, Math.min(15, Number(args.max_steps ?? 8)));

    return enqueueDesktopAction(
        "desktop_control",
        { goal, app_name: appName || null, max_steps: maxSteps },
        async () => {
            if (!goal) {
                return {
                    success: false,
                    action: "desktop_control",
                    failed_stage: "validation",
                    error: "A 'goal' string is required for desktop_control."
                };
            }

            const winRes = await ensureTargetWindow(appName, { waitTimeoutMs: 8000, settleAfterFocusMs: 450 });
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "desktop_control",
                    failed_stage: "window_focus",
                    app_name: appName,
                    error: winRes.error
                };
            }

            let windowInfo = winRes.window || null;
            const profile = winRes.profile || null;
            const isElectron = isElectronOrCefWindow(windowInfo, profile);

            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });

            const stepHistory = [];
            let lastClickedPoint = null;

            for (let step = 1; step <= maxSteps; step++) {
                // Re-verify active window bounds before each step
                if (profile) {
                    const refreshed = await nativeBridge.send("focus_window", {
                        process_names: profile.processNames,
                        title_query: profile.titleKeywords?.[0] || profile.name
                    });
                    if (refreshed?.success) {
                        windowInfo = refreshed;
                    }
                } else {
                    const active = await nativeBridge.send("get_active_window");
                    if (active?.success) windowInfo = active;
                }

                // Collect UIA interactive elements if non-Electron (e.g. Chrome, Notepad, Calculator)
                let uiaElements = [];
                if (!isElectron && windowInfo?.hwnd) {
                    const uiaRes = await nativeBridge.send("uia_inspect", {
                        hwnd: windowInfo.hwnd,
                        max_elements: 65,
                        timeout_ms: 1100
                    });
                    if (uiaRes?.success && Array.isArray(uiaRes.elements)) {
                        uiaElements = uiaRes.elements
                            .filter((e) => e.name || e.control_type === "Edit")
                            .slice(0, 40)
                            .map((e) => ({
                                id: e.index,
                                type: e.control_type,
                                name: e.name || e.help_text || e.automation_id,
                                x: e.x,
                                y: e.y
                            }));
                    }
                }

                const stepShotPath = path.join(SCREENSHOT_DIR, "latest_vision.jpg");
                const cropRect =
                    windowInfo?.rect?.width >= 120 && windowInfo?.rect?.height >= 100
                        ? windowInfo.rect
                        : undefined;

                const shotRes = await nativeBridge.send("screenshot", {
                    hwnd: windowInfo?.hwnd || 0,
                    crop_rect: cropRect,
                    max_width: 1280,
                    format: "jpeg",
                    quality: 84,
                    save_path: stepShotPath
                });

                if (!shotRes?.success || !shotRes.base64) {
                    return {
                        success: false,
                        action: "desktop_control",
                        failed_stage: `step_${step}_screenshot`,
                        steps_executed: stepHistory,
                        error: shotRes?.error || "Failed to capture screenshot during desktop_control."
                    };
                }

                const captureRect = shotRes.capture_rect;
                const imageSize = shotRes.image_size;

                const uiaContext =
                    uiaElements.length > 0
                        ? `\nWindows UI Automation (UIA) detected elements (you may set "uia_id" to click one directly): ${JSON.stringify(uiaElements)}`
                        : "";

                const historyText =
                    stepHistory.length > 0
                        ? `\nSteps already executed (DO NOT repeat completed steps; proceed to the next logical step):\n${stepHistory
                              .map((s, idx) => `${idx + 1}. ${s.action} on "${s.target || s.text || s.key}" -> ${s.outcome}`)
                              .join("\n")}`
                        : "\nNo steps executed yet.";

                const appHint = profile?.uiHints ? `\nApplication UI Hints: ${profile.uiHints}` : "";

                const plannerPrompt = `You are S.T.R.A.N.G.E., an autonomous desktop control vision agent controlling "${windowInfo?.title || appName || "Desktop"}".${appHint}${uiaContext}${historyText}

User Goal: "${goal}"
Current Step: ${step} of ${maxSteps}

Analyze the current screenshot and decide the SINGLE NEXT sequential action needed to complete the goal.
- If the goal is ALREADY completely achieved based on the screenshot and executed steps, return "action": "done".
- Never perform all steps at once; return only the single next action.
- For clicking an element on the screenshot, provide its 0-1000 normalized bounding box in "bbox_2d": [x1, y1, x2, y2] (or "uia_id" if matching a UIA element above).
- For typing into a search/input box: if the input box is not focused yet, either click it first OR return "action": "type" with "bbox_2d" of the input box, "text" to type, and "press_enter": true.
- For keyboard shortcuts (e.g. "ctrl+k" in Spotify to search, "ctrl+l" in Chrome to focus URL bar, "Enter", "Space"), use "action": "press_key" with "key".

Return ONLY valid JSON with this structure:
{
  "thought": "1-sentence observation of current screen and why this next step is chosen",
  "action": "left_click" | "double_click" | "right_click" | "type" | "scroll" | "press_key" | "done" | "fail",
  "target": "name/description of target UI element",
  "uia_id": null,
  "bbox_2d": [x1, y1, x2, y2],
  "text": "",
  "press_enter": true,
  "clear_first": false,
  "key": "",
  "scroll_direction": "down",
  "scroll_amount": 5
}`;

                const llmStart = Date.now();
                const response = await ollama.chat({
                    model: VISION_MODEL,
                    think: false,
                    format: "json",
                    messages: [
                        {
                            role: "user",
                            content: plannerPrompt,
                            images: [shotRes.base64]
                        }
                    ]
                });
                const llmMs = Date.now() - llmStart;

                let decision;
                try {
                    decision = JSON.parse(response.message?.content || "{}");
                } catch {
                    logDesktop("FAIL:CONTROL:JSON", `Invalid JSON at step ${step}: ${response.message?.content}`);
                    return {
                        success: false,
                        action: "desktop_control",
                        failed_stage: `step_${step}_json_parse`,
                        steps_executed: stepHistory,
                        error: "Vision model returned invalid JSON during step planning."
                    };
                }

                const stepAction = (decision.action || "").toLowerCase();
                logDesktop(
                    `CONTROL:${step}/${maxSteps}`,
                    `Action="${stepAction}" | Target="${decision.target || decision.text || decision.key || ""}" (${llmMs}ms)`,
                    { thought: decision.thought, bbox_2d: decision.bbox_2d, uia_id: decision.uia_id }
                );

                if (stepAction === "done" || stepAction === "completed") {
                    return {
                        success: true,
                        action: "desktop_control",
                        goal,
                        app_name: profile?.id || appName || windowInfo?.process_name || null,
                        window_title: windowInfo?.title || null,
                        status: "completed",
                        final_thought: decision.thought,
                        steps_executed: stepHistory,
                        total_steps: stepHistory.length,
                        simulated: false
                    };
                }

                if (stepAction === "fail" || stepAction === "failed") {
                    return {
                        success: false,
                        action: "desktop_control",
                        failed_stage: `step_${step}_model_abort`,
                        goal,
                        steps_executed: stepHistory,
                        error: decision.thought || "Vision agent reported that the goal cannot be completed from current screen."
                    };
                }

                // Resolve coordinates from uia_id or bbox_2d if needed
                let targetCoords = null;
                let coordMethod = "vision";

                if (decision.uia_id !== null && decision.uia_id !== undefined) {
                    const matchedUia = uiaElements.find((u) => u.id === Number(decision.uia_id));
                    if (matchedUia) {
                        targetCoords = { x: matchedUia.x, y: matchedUia.y };
                        coordMethod = "uia";
                    }
                }

                if (!targetCoords && decision.bbox_2d) {
                    targetCoords = parseVisionCoordinates(
                        { found: true, bbox_2d: decision.bbox_2d },
                        captureRect,
                        imageSize
                    );
                }

                // Execute the chosen sequential action
                if (
                    stepAction === "left_click" ||
                    stepAction === "click" ||
                    stepAction === "double_click" ||
                    stepAction === "right_click"
                ) {
                    if (!targetCoords && decision.target) {
                        const fallbackResolved = await resolveTargetCoordinates({
                            target: decision.target,
                            appName,
                            windowInfo,
                            profile,
                            allowScrollRetry: false
                        });
                        if (fallbackResolved.found) {
                            targetCoords = { x: fallbackResolved.x, y: fallbackResolved.y };
                            coordMethod = fallbackResolved.method;
                        }
                    }

                    if (!targetCoords) {
                        return {
                            success: false,
                            action: "desktop_control",
                            failed_stage: `step_${step}_missing_coordinates`,
                            steps_executed: stepHistory,
                            error: `Step ${step} (${stepAction} on "${decision.target}") failed: could not resolve coordinates.`
                        };
                    }

                    let clickType = stepAction === "double_click" ? "double" : "single";
                    const button = stepAction === "right_click" ? "right" : "left";

                    // Loop guard: if clicking the exact same spot as previous step, upgrade to double-click or note it
                    if (
                        lastClickedPoint &&
                        Math.abs(lastClickedPoint.x - targetCoords.x) <= 10 &&
                        Math.abs(lastClickedPoint.y - targetCoords.y) <= 10 &&
                        clickType === "single"
                    ) {
                        logDesktop("LOOP_GUARD", `Repeated click near (${targetCoords.x}, ${targetCoords.y}) -> Upgrading to double-click`);
                        clickType = "double";
                    }

                    const clickRes = await nativeBridge.send("mouse_click", {
                        x: targetCoords.x,
                        y: targetCoords.y,
                        button,
                        click_type: clickType,
                        smooth: true,
                        duration_ms: 125,
                        settle_ms: 55
                    });

                    if (!clickRes?.success) {
                        return {
                            success: false,
                            action: "desktop_control",
                            failed_stage: `step_${step}_click`,
                            steps_executed: stepHistory,
                            error: clickRes?.error || `Failed to click at (${targetCoords.x}, ${targetCoords.y})`
                        };
                    }

                    lastClickedPoint = { x: targetCoords.x, y: targetCoords.y };
                    stepHistory.push({
                        step,
                        action: `${clickType}_${button}_click`,
                        target: decision.target,
                        method: coordMethod,
                        x: targetCoords.x,
                        y: targetCoords.y,
                        thought: decision.thought,
                        outcome: `Clicked (${targetCoords.x}, ${targetCoords.y})`
                    });

                    await sleep(600);
                } else if (stepAction === "type") {
                    if (targetCoords) {
                        await nativeBridge.send("mouse_click", {
                            x: targetCoords.x,
                            y: targetCoords.y,
                            button: "left",
                            click_type: "single",
                            smooth: true,
                            duration_ms: 110,
                            settle_ms: 50
                        });
                        await sleep(220);
                    }

                    const textToType = String(decision.text || "");
                    if (!textToType) {
                        return {
                            success: false,
                            action: "desktop_control",
                            failed_stage: `step_${step}_empty_type_text`,
                            steps_executed: stepHistory,
                            error: `Step ${step} requested 'type' action but provided empty text.`
                        };
                    }

                    const typeRes = await nativeBridge.send("type_text", {
                        text: textToType,
                        clear_first: Boolean(decision.clear_first),
                        press_enter: decision.press_enter !== false,
                        delay_ms: 15
                    });

                    if (!typeRes?.success) {
                        return {
                            success: false,
                            action: "desktop_control",
                            failed_stage: `step_${step}_type`,
                            steps_executed: stepHistory,
                            error: typeRes?.error || "Failed to type text."
                        };
                    }

                    lastClickedPoint = null;
                    stepHistory.push({
                        step,
                        action: "type",
                        target: decision.target || "input",
                        text: textToType,
                        pressed_enter: decision.press_enter !== false,
                        thought: decision.thought,
                        outcome: `Typed "${textToType}"`
                    });

                    await sleep(750);
                } else if (stepAction === "scroll") {
                    const dir = (decision.scroll_direction || "down").toLowerCase();
                    const amt = Math.max(1, Math.min(25, Number(decision.scroll_amount || 5)));
                    const sx = targetCoords?.x ?? (windowInfo?.rect ? Math.round(windowInfo.rect.x + windowInfo.rect.width * 0.5) : null);
                    const sy = targetCoords?.y ?? (windowInfo?.rect ? Math.round(windowInfo.rect.y + windowInfo.rect.height * 0.55) : null);

                    await nativeBridge.send("mouse_scroll", {
                        direction: dir,
                        amount: amt,
                        x: sx,
                        y: sy
                    });

                    lastClickedPoint = null;
                    stepHistory.push({
                        step,
                        action: "scroll",
                        target: `${dir} (${amt})`,
                        thought: decision.thought,
                        outcome: `Scrolled ${dir} by ${amt}`
                    });

                    await sleep(500);
                } else if (stepAction === "press_key") {
                    const keyName = String(decision.key || "Enter");
                    const keyRes = await nativeBridge.send("key_press", {
                        key: keyName
                    });

                    if (!keyRes?.success) {
                        return {
                            success: false,
                            action: "desktop_control",
                            failed_stage: `step_${step}_press_key`,
                            steps_executed: stepHistory,
                            error: keyRes?.error || `Failed to press key "${keyName}".`
                        };
                    }

                    lastClickedPoint = null;
                    stepHistory.push({
                        step,
                        action: "press_key",
                        key: keyName,
                        thought: decision.thought,
                        outcome: `Pressed key "${keyName}"`
                    });

                    await sleep(500);
                } else {
                    await sleep(500);
                    stepHistory.push({
                        step,
                        action: "wait",
                        thought: decision.thought,
                        outcome: "Waited 500ms"
                    });
                }
            }

            return {
                success: true,
                action: "desktop_control",
                goal,
                app_name: profile?.id || appName || windowInfo?.process_name || null,
                window_title: windowInfo?.title || null,
                status: "max_steps_reached",
                steps_executed: stepHistory,
                total_steps: stepHistory.length,
                simulated: false
            };
        }
    );
}
