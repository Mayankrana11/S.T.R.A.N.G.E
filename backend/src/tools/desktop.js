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
const BACKEND_ENV_PATH = path.resolve(__dirname, "../../.env");

dotenv.config({ path: BACKEND_ENV_PATH, override: true });

function normalizeModelTag(rawName) {
    if (!rawName || typeof rawName !== "string") return "";
    const trimmed = rawName.trim();
    if (!trimmed.includes(":") && /-[0-9]+(\.[0-9]+)?b$/i.test(trimmed)) {
        return trimmed.replace(/-([0-9]+(?:\.[0-9]+)?b)$/i, ":$1");
    }
    return trimmed;
}

function getMainModel() {
    dotenv.config({ path: BACKEND_ENV_PATH, override: true });
    return normalizeModelTag(process.env.OLLAMA_MODEL) || "qwen3.5:4b";
}

function getVisionModel() {
    dotenv.config({ path: BACKEND_ENV_PATH, override: true });
    return (
        normalizeModelTag(process.env.OLLAMA_VISION_MODEL) ||
        normalizeModelTag(process.env.OLLAMA_MODEL) ||
        "qwen2.5vl:3b"
    );
}

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
    },
    whatsapp: {
        id: "whatsapp",
        name: "WhatsApp",
        processNames: ["WhatsApp.Root", "WhatsApp", "ApplicationFrameHost"],
        titleKeywords: ["whatsapp"],
        isElectronOrCef: false,
        uiHints:
            "WhatsApp Desktop (Microsoft Store) UI: Left pane has chat list and a search bar at the top ('Search or start a new chat'); far-left sidebar has Chats, Calls, Status, and Settings icons; right pane shows the active conversation with message history and the 'Type a message' input box at the bottom."
    }
};

// Track the most recently opened or interacted application
let lastActiveAppContext = {
    appId: null,
    hwnd: 0,
    pid: 0,
    title: null,
    timestamp: 0
};

export function recordActiveApplicationContext(appNameOrId, windowMeta = null) {
    if (!appNameOrId || typeof appNameOrId !== "string") return;
    const res = resolveApplication(appNameOrId);
    const canonical = res.status === "resolved" ? res.canonical_id : appNameOrId.toLowerCase().trim();
    lastActiveAppContext = {
        appId: canonical,
        hwnd: windowMeta?.hwnd || lastActiveAppContext.hwnd || 0,
        pid: windowMeta?.pid || lastActiveAppContext.pid || 0,
        title: windowMeta?.title || lastActiveAppContext.title || null,
        timestamp: Date.now()
    };
}

// --- Performance Measurement & Telemetry (Requirement 8) ---
// Records separate timings for:
// - screenshot_capture_ms
// - vision_inference_ms
// - tool_call_overhead_ms
// - mouse_keyboard_execution_ms
// - uia_lookup_ms
// - verification_ms
const sessionPerformanceStats = {
    total_operations: 0,
    total_sequences: 0,
    total_actions_executed: 0,
    vision_inferences_count: 0,
    vision_inferences_skipped_by_checkpoint: 0,
    uia_direct_hits: 0,
    local_ocr_hits: 0,
    cumulative_timings_ms: {
        screenshot_capture_ms: 0,
        vision_inference_ms: 0,
        tool_call_overhead_ms: 0,
        mouse_keyboard_execution_ms: 0,
        uia_lookup_ms: 0,
        verification_ms: 0,
        ocr_ms: 0,
        total_ms: 0
    }
};

export function createTimingBucket() {
    return {
        screenshot_capture_ms: 0,
        vision_inference_ms: 0,
        tool_call_overhead_ms: 0,
        mouse_keyboard_execution_ms: 0,
        uia_lookup_ms: 0,
        verification_ms: 0,
        ocr_ms: 0,
        total_ms: 0
    };
}

function mergeNativeTimings(bucket, nativeTimings, bridgeRoundtripMs = 0) {
    if (!bucket) return;
    if (nativeTimings && typeof nativeTimings === "object") {
        bucket.uia_lookup_ms += Number(nativeTimings.uia_lookup_ms || 0);
        bucket.mouse_keyboard_execution_ms += Number(nativeTimings.mouse_keyboard_execution_ms || 0);
        bucket.verification_ms += Number(nativeTimings.verification_ms || 0);
        bucket.screenshot_capture_ms += Number(nativeTimings.screenshot_capture_ms || 0);
        bucket.ocr_ms += Number(nativeTimings.ocr_ms || 0);
        const accounted =
            Number(nativeTimings.uia_lookup_ms || 0) +
            Number(nativeTimings.mouse_keyboard_execution_ms || 0) +
            Number(nativeTimings.verification_ms || 0) +
            Number(nativeTimings.screenshot_capture_ms || 0) +
            Number(nativeTimings.ocr_ms || 0);
        const overhead = Math.max(0, bridgeRoundtripMs - accounted);
        bucket.tool_call_overhead_ms += overhead;
    } else if (bridgeRoundtripMs > 0) {
        bucket.tool_call_overhead_ms += bridgeRoundtripMs;
    }
}

function finalizeTimingBucket(bucket, startedAtMs) {
    bucket.total_ms = Math.max(0, Date.now() - startedAtMs);
    const knownSubcomponents =
        bucket.screenshot_capture_ms +
        bucket.vision_inference_ms +
        bucket.mouse_keyboard_execution_ms +
        bucket.uia_lookup_ms +
        bucket.verification_ms +
        bucket.ocr_ms;
    if (bucket.tool_call_overhead_ms === 0 && bucket.total_ms > knownSubcomponents) {
        bucket.tool_call_overhead_ms = bucket.total_ms - knownSubcomponents;
    }

    sessionPerformanceStats.total_operations += 1;
    for (const key of Object.keys(sessionPerformanceStats.cumulative_timings_ms)) {
        sessionPerformanceStats.cumulative_timings_ms[key] += Number(bucket[key] || 0);
    }
    return bucket;
}

export function getDesktopPerformanceStats() {
    return structuredClone(sessionPerformanceStats);
}

// --- Destructive Action Detection (Requirement 7) ---
const DESTRUCTIVE_TARGET_PATTERN =
    /\b(delete|permanently\s+delete|remove|uninstall|format|erase|wipe|factory\s+reset|empty\s+recycle\s+bin|empty\s+trash|discard\s+changes|don'?t\s+save|close\s+without\s+saving|clear\s+all|reset\s+all|terminate|kill\s+process|buy\s+now|place\s+order|complete\s+purchase|confirm\s+payment|send\s+money)\b/i;

const DESTRUCTIVE_TEXT_PATTERN =
    /(\brm\s+-rf\b|\bdel\s+\/[fsq]|\bformat\s+[a-z]:|\bremove-item\b.*-recurse|\bdrop\s+table\b|\btruncate\s+table\b|\bshutdown\s+\/[sr])/i;

export function detectDestructiveAction(step) {
    if (!step || typeof step !== "object") return null;
    const target = String(step.target || step.label || "").trim();
    const text = String(step.text || "").trim();
    const key = String(step.key || "").trim().toLowerCase();

    if (target && DESTRUCTIVE_TARGET_PATTERN.test(target)) {
        return {
            is_destructive: true,
            reason: `Target "${target}" is a destructive UI action requiring explicit confirmation.`
        };
    }

    if (text && DESTRUCTIVE_TEXT_PATTERN.test(text)) {
        return {
            is_destructive: true,
            reason: `Text input "${text}" contains a destructive command requiring explicit confirmation.`
        };
    }

    if (key === "shift+delete" || key === "shift+del") {
        return {
            is_destructive: true,
            reason: `Shortcut "${key}" permanently deletes items and requires explicit confirmation.`
        };
    }

    return null;
}

// Structured terminal logger
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
        const args = [
            "/nologo",
            "/optimize+",
            "/target:exe",
            `/out:${NATIVE_EXE_PATH}`,
            `/r:${path.join(fwDir, "System.Drawing.dll")}`,
            `/r:${path.join(fwDir, "System.Windows.Forms.dll")}`,
            `/r:${path.join(fwDir, "System.Web.Extensions.dll")}`,
            `/r:${path.join(fwDir, "WPF", "UIAutomationClient.dll")}`,
            `/r:${path.join(fwDir, "WPF", "UIAutomationTypes.dll")}`,
            `/r:${path.join(fwDir, "WPF", "WindowsBase.dll")}`
        ];

        const winRtDll = path.join(fwDir, "System.Runtime.WindowsRuntime.dll");
        if (fs.existsSync(winRtDll)) {
            args.push(`/r:${winRtDll}`);
        }

        args.push(NATIVE_CS_PATH);

        execFileSync(cscPath, args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 20000
        });

        logDesktop("NATIVE", "StrangeDesktopNative.exe compiled successfully.");
        return fs.existsSync(NATIVE_EXE_PATH);
    } catch (error) {
        const stderr = error.stderr ? error.stderr.toString() : "";
        const stdout = error.stdout ? error.stdout.toString() : "";
        logDesktop("FAIL:NATIVE", `Failed to compile StrangeDesktopNative.exe: ${error.message} ${stdout} ${stderr}`);
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
            } catch {
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

    async send(command, payload = {}, timeoutMs = 25000) {
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
let actionQueuePromise = Promise.resolve();
let actionSequenceCounter = 0;
let activeSequenceAbortRequested = false;

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
                    stage: result.failed_stage || "execution",
                    timings_ms: result.timings_ms
                });
            } else {
                logDesktop("DONE", `Action #${seqId} ${actionName} succeeded in ${elapsed}ms`, result?.timings_ms || null);
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
    actionQueuePromise = nextPromise.catch(() => {});
    return nextPromise;
}

export async function cancelDesktopSequence(args = {}) {
    const reason = typeof args.reason === "string" ? args.reason : "Cancelled by user or agent";
    activeSequenceAbortRequested = true;
    logDesktop("CANCEL", `Cancelling active desktop action sequence: ${reason}`);
    try {
        const res = await nativeBridge.send("cancel_sequence", { reason }, 3000);
        return {
            success: true,
            action: "cancel_sequence",
            reason,
            native_response: res
        };
    } catch (error) {
        return {
            success: false,
            action: "cancel_sequence",
            error: error.message
        };
    }
}

// --- Application Profile & Window Focusing Helpers ---

export function resolveDesktopAppProfile(appName) {
    const raw = typeof appName === "string" ? appName.trim() : "";

    if (!raw) {
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

    if (cls.includes("sdl_app") || cls.includes("vguipopupwindow")) {
        return true;
    }

    return false;
}

export async function ensureTargetWindow(appName, options = {}) {
    const {
        waitTimeoutMs = 7000,
        settleAfterFocusMs = 180,
        timings = null
    } = options;

    const profile = resolveDesktopAppProfile(appName);

    if (!profile && !appName) {
        const t0 = Date.now();
        const active = await nativeBridge.send("get_active_window");
        if (timings) timings.tool_call_overhead_ms += Date.now() - t0;
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
        const t0 = Date.now();
        const focusRes = await nativeBridge.send("focus_window", {
            process_names: profile.processNames,
            title_query: profile.titleKeywords?.[0] || profile.name
        });
        if (timings) timings.tool_call_overhead_ms += Date.now() - t0;

        if (focusRes?.success && focusRes.rect?.width >= 80 && focusRes.rect?.height >= 60) {
            const switched = lastActiveAppContext.hwnd !== focusRes.hwnd;
            recordActiveApplicationContext(profile.id, focusRes);

            const extraWait = attempts > 1 ? 650 : settleAfterFocusMs;
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
                app_switched: switched,
                is_electron: isElectronOrCefWindow(focusRes, profile)
            };
        }

        lastError = focusRes?.error || `Window for "${profile.name}" not found yet`;
        await sleep(300);
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

// --- Windows UI Automation (UIA) First + Local Windows OCR + Qwen Vision Fallback ---

export async function tryResolveWithUIA(target, windowInfo, profile, timings = null) {
    const isElectron = isElectronOrCefWindow(windowInfo, profile);
    const t0 = Date.now();
    const uiaRes = await nativeBridge.send("uia_inspect", {
        hwnd: windowInfo?.hwnd || 0,
        query: target,
        max_elements: 180,
        timeout_ms: isElectron ? 550 : 1200
    });
    const elapsed = Date.now() - t0;
    if (timings) timings.uia_lookup_ms += elapsed;

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
        best
            ? {
                  best_name: best.name,
                  best_role: best.role || best.control_type,
                  is_enabled: best.is_enabled,
                  score: best.score,
                  x: best.x,
                  y: best.y
              }
            : { best_match: null }
    );

    if (best && best.score >= 0.72) {
        if (best.is_enabled === false) {
            return {
                found: false,
                target_disabled: true,
                element: best,
                reason: `Target UI control "${best.name || target}" (${best.role || best.control_type}) is disabled (IsEnabled=false).`
            };
        }

        sessionPerformanceStats.uia_direct_hits += 1;
        return {
            found: true,
            method: "uia_direct",
            uia_id: best.index,
            x: best.x,
            y: best.y,
            rect: best.rect,
            label: best.name || best.text || best.automation_id || best.help_text || target,
            role: best.role || best.control_type,
            control_type: best.control_type,
            is_enabled: best.is_enabled !== false,
            patterns: best.patterns || [],
            text: best.text || "",
            confidence: best.score,
            elapsed_ms: elapsed
        };
    }

    return {
        found: false,
        element_count: count,
        elements: uiaRes.elements || [],
        reason: count === 0 ? "No UIA elements exposed by window" : `Target "${target}" not matched among ${count} UIA elements`
    };
}

export async function tryResolveWithLocalOcr(target, windowInfo, timings = null) {
    if (!target || typeof target !== "string") {
        return { found: false, reason: "Empty target for OCR" };
    }

    const t0 = Date.now();
    const ocrRes = await nativeBridge.send("ocr", {
        hwnd: windowInfo?.hwnd || 0,
        crop_rect: windowInfo?.rect,
        query: target
    });
    const elapsed = Date.now() - t0;
    if (timings) timings.ocr_ms += elapsed;

    if (!ocrRes?.success) {
        return {
            found: false,
            reason: ocrRes?.error || "Local OCR unavailable"
        };
    }

    const best = ocrRes.best_match;
    logDesktop(
        "OCR",
        `Extracted ${ocrRes.line_count || 0} text lines in ${ocrRes.elapsed_ms}ms`,
        best ? { matched_text: best.text, score: best.score, x: best.x, y: best.y } : { best_match: null }
    );

    if (best && best.score >= 0.72) {
        sessionPerformanceStats.local_ocr_hits += 1;
        return {
            found: true,
            method: "local_ocr",
            x: best.x,
            y: best.y,
            rect: best.rect,
            label: best.text,
            confidence: best.score,
            elapsed_ms: elapsed
        };
    }

    return {
        found: false,
        ocr_lines: ocrRes.lines || [],
        reason: `Target "${target}" not matched in local OCR text`
    };
}

function isPixelCoordinateVisionModel(modelName) {
    const m = String(modelName || "").toLowerCase();
    return m.includes("qwen2.5vl") || m.includes("qwen2.5-vl") || m.includes("qwen2-vl") || m.includes("qwen2vl") || m.includes("ui-tars");
}

function parseVisionCoordinates(parsed, captureRect, imageSize, visionModel = getVisionModel()) {
    if (!parsed || !parsed.found) return null;

    let normX = null;
    let normY = null;
    const bbox = parsed.bbox_2d || parsed.bbox || parsed.box;
    const usePixelSpace =
        isPixelCoordinateVisionModel(visionModel) &&
        imageSize?.width > 0 &&
        imageSize?.height > 0;

    if (Array.isArray(bbox) && bbox.length === 4) {
        const [x1, y1, x2, y2] = bbox.map(Number);
        if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;

            if (x2 <= 1.0 && y2 <= 1.0 && x2 > 0 && y2 > 0) {
                normX = cx * 1000;
                normY = cy * 1000;
            } else if (
                usePixelSpace ||
                (imageSize?.width > 1000 && (x2 > 1005 || y2 > 1005))
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
        } else if (usePixelSpace) {
            normX = (px / imageSize.width) * 1000;
            normY = (py / imageSize.height) * 1000;
        } else {
            normX = px;
            normY = py;
        }
    }

    if (normX === null || normY === null) return null;

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

export async function tryResolveWithVision(target, windowInfo, profile, extraContext = "", timings = null) {
    const t0 = Date.now();
    await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
    const latestScreenshotPath = path.join(SCREENSHOT_DIR, "latest_vision.jpg");

    const cropRect =
        windowInfo?.rect?.width >= 100 && windowInfo?.rect?.height >= 80
            ? windowInfo.rect
            : undefined;

    const shotStart = Date.now();
    const shotRes = await nativeBridge.send("screenshot", {
        hwnd: windowInfo?.hwnd || 0,
        crop_rect: cropRect,
        max_width: 1280,
        format: "jpeg",
        quality: 82,
        save_path: latestScreenshotPath
    });
    const shotMs = Date.now() - shotStart;
    if (timings) timings.screenshot_capture_ms += shotMs;

    if (!shotRes?.success || !shotRes.base64) {
        logDesktop("FAIL:SCREENSHOT", `Screenshot capture failed: ${shotRes?.error || "No image data"}`);
        return {
            found: false,
            reason: `Screenshot failed: ${shotRes?.error || "No image data"}`
        };
    }

    const captureRect = shotRes.capture_rect;
    const imageSize = shotRes.image_size;

    logDesktop("VISION:SHOT", `Captured ${captureRect.width}x${captureRect.height} (resized ${imageSize.width}x${imageSize.height}, ${Math.round(shotRes.byte_length / 1024)}KB, change_score=${shotRes.change_score})`, {
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
        const visionModel = getVisionModel();
        logDesktop(
            "VISION:MODEL",
            `[MODEL: ${visionModel}] Running vision grounding inference for target="${target}"`
        );
        const llmStart = Date.now();
        const response = await ollama.chat({
            model: visionModel,
            think: false,
            format: "json",
            options: { temperature: 0 },
            messages: [
                {
                    role: "user",
                    content: prompt,
                    images: [shotRes.base64]
                }
            ]
        });

        const usedVisionModel = response?.model || visionModel;
        const llmMs = Date.now() - llmStart;
        if (timings) timings.vision_inference_ms += llmMs;
        sessionPerformanceStats.vision_inferences_count += 1;

        const rawContent = response.message?.content || "{}";
        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            logDesktop("FAIL:VISION:JSON", `[MODEL: ${usedVisionModel}] Vision model returned non-JSON: ${rawContent.slice(0, 200)}`);
            return {
                found: false,
                method: "vision",
                model: usedVisionModel,
                vision_model: usedVisionModel,
                reason: "Vision model output was not valid JSON",
                raw_output: rawContent
            };
        }

        const coords = parseVisionCoordinates(parsed, captureRect, imageSize, usedVisionModel);
        if (parsed.found && coords) {
            logDesktop(
                "VISION:MATCH",
                `[MODEL: ${usedVisionModel}] Located "${parsed.label || target}" at screen (${coords.x}, ${coords.y}) [norm: ${coords.norm_x},${coords.norm_y}] in ${llmMs}ms`,
                {
                    bbox_2d: coords.bbox_2d,
                    confidence: parsed.confidence,
                    reason: parsed.reason
                }
            );

            return {
                found: true,
                method: "vision",
                model: usedVisionModel,
                vision_model: usedVisionModel,
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

        logDesktop("VISION:MISS", `[MODEL: ${usedVisionModel}] Target "${target}" not found in current view (${llmMs}ms)`, {
            reason: parsed.reason,
            needs_scroll: parsed.needs_scroll,
            visible_summary: parsed.visible_summary
        });

        return {
            found: false,
            method: "vision",
            model: usedVisionModel,
            vision_model: usedVisionModel,
            needs_scroll: parsed.needs_scroll || "none",
            visible_summary: parsed.visible_summary || null,
            reason: parsed.reason || `Target "${target}" was not found in the screenshot`,
            screenshot_path: latestScreenshotPath,
            elapsed_ms: Date.now() - t0
        };
    } catch (error) {
        const visionModel = getVisionModel();
        logDesktop("FAIL:VISION", `[MODEL: ${visionModel}] Vision inference error: ${error.message}`);
        return {
            found: false,
            method: "vision",
            model: visionModel,
            vision_model: visionModel,
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
    maxScrollRetries = 2,
    timings = null
}) {
    // 1. Always try Windows UI Automation first (Requirement 3: Prefer semantic UIA interactions)
    if (mode !== "vision") {
        logDesktop("RESOLVE", `Attempting Windows UI Automation (UIA) first for target="${target}" in "${windowInfo?.title || appName || "Desktop"}"`);
        const uiaResult = await tryResolveWithUIA(target, windowInfo, profile, timings);
        if (uiaResult.target_disabled) {
            return {
                found: false,
                target_disabled: true,
                failed_stage: "uia_control_disabled",
                error: uiaResult.reason
            };
        }
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
    }

    // 2. Try fast Local Windows OCR (~35ms, 0 LLM calls) for text targets before invoking Qwen Vision
    if (mode === "auto" || mode === "ocr") {
        const ocrResult = await tryResolveWithLocalOcr(target, windowInfo, timings);
        if (ocrResult.found) {
            logDesktop("RESOLVE:OCR", `Matched "${target}" via local Windows OCR at (${ocrResult.x}, ${ocrResult.y}) with 0ms LLM inference`);
            return ocrResult;
        }
    }

    // 3. Fallback to Qwen Vision Screenshot Inference (with optional scroll retry)
    logDesktop("FALLBACK", `UIA and Local OCR did not match "${target}". Invoking Qwen Vision inference...`);
    let visionResult = await tryResolveWithVision(target, windowInfo, profile, "", timings);
    if (visionResult.found) {
        return visionResult;
    }

    if (allowScrollRetry && maxScrollRetries > 0 && windowInfo?.rect) {
        const scrollDir = visionResult.needs_scroll === "up" ? "up" : "down";
        const scrollX = Math.round(windowInfo.rect.x + windowInfo.rect.width * 0.5);
        const scrollY = Math.round(windowInfo.rect.y + windowInfo.rect.height * 0.55);

        for (let retry = 1; retry <= maxScrollRetries; retry++) {
            logDesktop(
                "SCROLL_RETRY",
                `Target "${target}" not visible; scrolling ${scrollDir} at (${scrollX}, ${scrollY}) [attempt ${retry}/${maxScrollRetries}]`
            );

            const scStart = Date.now();
            await nativeBridge.send("mouse_scroll", {
                direction: scrollDir,
                amount: 5,
                x: scrollX,
                y: scrollY
            });
            if (timings) timings.mouse_keyboard_execution_ms += Date.now() - scStart;

            await sleep(360);

            // Check Local OCR first after scrolling before invoking Vision LLM again!
            const ocrRetry = await tryResolveWithLocalOcr(target, windowInfo, timings);
            if (ocrRetry.found) {
                return ocrRetry;
            }

            visionResult = await tryResolveWithVision(
                target,
                windowInfo,
                profile,
                `Scrolled ${scrollDir} (attempt ${retry}) to look for "${target}".`,
                timings
            );

            if (visionResult.found) {
                return visionResult;
            }
        }
    }

    return {
        found: false,
        failed_stage: "vision_lookup",
        model: visionResult.model || visionResult.vision_model || getVisionModel(),
        vision_model: visionResult.vision_model || visionResult.model || getVisionModel(),
        visible_summary: visionResult.visible_summary,
        screenshot_path: visionResult.screenshot_path,
        error: visionResult.reason || `Could not locate target "${target}" via UIA, Local OCR, or Vision.`
    };
}

// --- Compact Screen State & Checkpoint-Based Verification Evaluator (Requirements 4 & 5) ---

export async function getCompactScreenState(windowInfo, options = {}) {
    const {
        query = "",
        includeOcr = true,
        maxElements = 65,
        timings = null
    } = options;

    const t0 = Date.now();
    const stateRes = await nativeBridge.send("get_screen_state", {
        hwnd: windowInfo?.hwnd || 0,
        query,
        include_ocr: includeOcr,
        max_elements: maxElements
    });
    const bridgeMs = Date.now() - t0;

    if (timings && stateRes?.timings_ms) {
        mergeNativeTimings(timings, stateRes.timings_ms, bridgeMs);
    }

    if (!stateRes?.success) {
        return {
            success: false,
            error: stateRes?.error || "Failed to retrieve compact screen state"
        };
    }

    const compactUia = (stateRes.uia_elements || [])
        .filter((e) => e.name || e.text || e.role === "Edit" || e.role === "Button")
        .slice(0, 45)
        .map((e) => ({
            id: e.index,
            name: e.name || e.text || e.automation_id,
            role: e.role || e.control_type,
            text: e.text && e.text !== e.name ? e.text : undefined,
            enabled: e.is_enabled !== false,
            focused: Boolean(e.has_focus),
            state: e.toggle_state || (e.is_selected ? "Selected" : undefined) || e.expand_state || undefined,
            patterns: e.patterns,
            x: e.x,
            y: e.y,
            rect: e.rect
        }));

    return {
        success: true,
        active_window: stateRes.active_window,
        screen_changed: Boolean(stateRes.screen_changed),
        change_score: Number(stateRes.change_score ?? 0),
        screen_hash: stateRes.screen_hash || "",
        changed_region: stateRes.changed_region || null,
        uia_element_count: stateRes.uia_element_count || 0,
        uia_elements: compactUia,
        ocr_lines: (stateRes.ocr_lines || []).slice(0, 40),
        timings_ms: stateRes.timings_ms
    };
}

export function evaluateVerificationCheckpoint({
    appOpenedOrSwitched = false,
    windowTitleChanged = false,
    changeScore = 0,
    dialogAppeared = false,
    actionFailed = false,
    dependsOnNewInfo = false
}) {
    const reasons = [];
    if (appOpenedOrSwitched) reasons.push("app_opened_or_switched");
    if (windowTitleChanged || changeScore >= 0.18) reasons.push("significant_transition");
    if (dialogAppeared) reasons.push("dialog_appeared");
    if (actionFailed) reasons.push("action_failed");
    if (dependsOnNewInfo) reasons.push("depends_on_new_info");

    return {
        should_request_visual_inference: reasons.length > 0,
        primary_reason: reasons[0] || "none",
        reasons,
        metrics: {
            app_opened_or_switched: appOpenedOrSwitched,
            window_title_changed: windowTitleChanged,
            change_score: changeScore,
            dialog_appeared: dialogAppeared,
            action_failed: actionFailed,
            depends_on_new_info: dependsOnNewInfo
        }
    };
}

export async function resolveMultipleTargetsWithVision(targets, windowInfo, profile, timings = null) {
    const uniqueTargets = Array.from(new Set((targets || []).map((t) => String(t || "").trim()).filter(Boolean)));
    if (uniqueTargets.length === 0) return new Map();

    await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
    const latestScreenshotPath = path.join(SCREENSHOT_DIR, "latest_vision.jpg");

    const cropRect =
        windowInfo?.rect?.width >= 100 && windowInfo?.rect?.height >= 80
            ? windowInfo.rect
            : undefined;

    const shotStart = Date.now();
    const shotRes = await nativeBridge.send("screenshot", {
        hwnd: windowInfo?.hwnd || 0,
        crop_rect: cropRect,
        max_width: 1280,
        format: "jpeg",
        quality: 82,
        save_path: latestScreenshotPath
    });
    const shotMs = Date.now() - shotStart;
    if (timings) timings.screenshot_capture_ms += shotMs;

    const resolvedMap = new Map();
    if (!shotRes?.success || !shotRes.base64) {
        return resolvedMap;
    }

    const captureRect = shotRes.capture_rect;
    const imageSize = shotRes.image_size;
    const appHint = profile?.uiHints ? `\nApplication UI Hints: ${profile.uiHints}` : "";
    const winTitle = windowInfo?.title ? `Window Title: "${windowInfo.title}" (${windowInfo.process_name})` : "Full Desktop Screen";

    const prompt = `You are a precision desktop vision grounding model analyzing ONE screenshot of ${winTitle}.${appHint}

Locate ALL of the following UI elements in a single pass:
${uniqueTargets.map((t, i) => `${i + 1}. "${t}"`).join("\n")}

Return coordinates using 0-1000 normalized bounding box format [x1, y1, x2, y2] where (0,0) is top-left and (1000,1000) is bottom-right of the image.
Respond ONLY with valid JSON in this exact format:
{
  "matches": [
    {
      "target": "exact target string requested",
      "found": true,
      "label": "matched element description",
      "bbox_2d": [x1, y1, x2, y2],
      "confidence": 0.92
    }
  ]
}`;

    try {
        const visionModel = getVisionModel();
        logDesktop(
            "VISION:MODEL",
            `[MODEL: ${visionModel}] Running batched vision grounding for ${uniqueTargets.length} target(s): ${uniqueTargets.join(", ")}`
        );
        const llmStart = Date.now();
        const response = await ollama.chat({
            model: visionModel,
            think: false,
            format: "json",
            options: { temperature: 0 },
            messages: [
                {
                    role: "user",
                    content: prompt,
                    images: [shotRes.base64]
                }
            ]
        });
        const usedVisionModel = response?.model || visionModel;
        resolvedMap.vision_model = usedVisionModel;
        const llmMs = Date.now() - llmStart;
        if (timings) timings.vision_inference_ms += llmMs;
        sessionPerformanceStats.vision_inferences_count += 1;

        const parsed = JSON.parse(response.message?.content || "{}");
        const list = Array.isArray(parsed.matches) ? parsed.matches : [];
        for (const item of list) {
            if (!item || !item.found) continue;
            const coords = parseVisionCoordinates(item, captureRect, imageSize, usedVisionModel);
            if (coords && item.target) {
                resolvedMap.set(String(item.target).trim().toLowerCase(), {
                    found: true,
                    method: "vision_batched",
                    model: usedVisionModel,
                    vision_model: usedVisionModel,
                    x: coords.x,
                    y: coords.y,
                    label: item.label || item.target,
                    confidence: item.confidence ?? 0.85
                });
            }
        }
        logDesktop(
            "VISION:BATCH_DONE",
            `[MODEL: ${usedVisionModel}] Grounded ${resolvedMap.size}/${uniqueTargets.length} target(s) in ${llmMs}ms`
        );
    } catch (err) {
        const visionModel = getVisionModel();
        resolvedMap.vision_model = visionModel;
        logDesktop("WARN:VISION:BATCH", `[MODEL: ${visionModel}] Batched vision resolution failed: ${err.message}`);
    }

    return resolvedMap;
}

// --- Batched Action Sequence Execution Tool (`execute_action_sequence`) (Requirements 1, 2, 5, 6, 7, 8) ---

export async function executeActionSequence(args = {}) {
    const rawActions = Array.isArray(args.actions) ? args.actions : [];
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const stopOnError = args.stop_on_error !== false;
    const stopOnWindowChange = args.stop_on_window_change !== false;
    const stopOnDialog = args.stop_on_dialog !== false;
    const confirmDestructive = Boolean(args.confirm_destructive || args.confirmed_destructive);
    const dependsOnNewInfo = Boolean(args.depends_on_new_info || args.verify_checkpoint);
    const interActionDelayMs = Number(args.inter_action_delay_ms ?? 55);

    return enqueueDesktopAction(
        "execute_action_sequence",
        { app_name: appName || null, action_count: rawActions.length },
        async () => {
            const opStart = Date.now();
            const timings = createTimingBucket();
            activeSequenceAbortRequested = false;

            if (rawActions.length === 0) {
                return {
                    success: false,
                    action: "execute_action_sequence",
                    failed_stage: "validation",
                    error: "execute_action_sequence requires a non-empty 'actions' array.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            // Safety Check: Destructive actions require confirmation before execution
            if (!confirmDestructive) {
                for (let i = 0; i < rawActions.length; i++) {
                    const destructive = detectDestructiveAction(rawActions[i]);
                    if (destructive) {
                        return {
                            success: false,
                            action: "execute_action_sequence",
                            requires_confirmation: true,
                            destructive_action_detected: true,
                            blocked_step_index: i,
                            blocked_action: rawActions[i],
                            error: destructive.reason,
                            message: `${destructive.reason} Please confirm if you want STRANGE to proceed.`,
                            timings_ms: finalizeTimingBucket(timings, opStart)
                        };
                    }
                }
            }

            // Ensure target window is focused
            let windowInfo = null;
            let profile = null;
            let appSwitched = false;

            const winRes = await ensureTargetWindow(appName, { timings });
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "execute_action_sequence",
                    failed_stage: winRes.failed_stage || "window_focus",
                    app_name: appName,
                    error: winRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }
            windowInfo = winRes.window || null;
            profile = winRes.profile || null;
            appSwitched = Boolean(winRes.app_switched);

            const preparedActions = rawActions.map((s) => ({ ...s }));
            let visionModelUsed = null;

            // Resolve drag from_target / to_target via UIA/OCR first if present
            for (let i = 0; i < preparedActions.length; i++) {
                const step = preparedActions[i];
                const actType = String(step.action || step.type || "").toLowerCase().trim();
                const hasDragCoords =
                    step.from_x !== undefined &&
                    step.from_y !== undefined &&
                    step.to_x !== undefined &&
                    step.to_y !== undefined;

                if ((actType === "drag" || actType === "drag_and_drop" || actType === "mouse_drag") && !hasDragCoords) {
                    if (step.from_target && (step.from_x === undefined || step.from_y === undefined)) {
                        const fromRes = await resolveTargetCoordinates({
                            target: step.from_target,
                            appName,
                            windowInfo,
                            profile,
                            allowScrollRetry: false,
                            timings
                        });
                        if (fromRes.vision_model) visionModelUsed = fromRes.vision_model;
                        if (fromRes.found) {
                            step.from_x = fromRes.x;
                            step.from_y = fromRes.y;
                        }
                    }
                    if (step.to_target && (step.to_x === undefined || step.to_y === undefined)) {
                        const toRes = await resolveTargetCoordinates({
                            target: step.to_target,
                            appName,
                            windowInfo,
                            profile,
                            allowScrollRetry: false,
                            timings
                        });
                        if (toRes.vision_model) visionModelUsed = toRes.vision_model;
                        if (toRes.found) {
                            step.to_x = toRes.x;
                            step.to_y = toRes.y;
                        }
                    }
                }
            }

            // 1. Execute the entire batch sequentially in C# using fast native UIA + Local OCR (0 LLM calls, 0 vision photos!)
            const seqStart = Date.now();
            let seqRes = await nativeBridge.send("execute_action_sequence", {
                actions: preparedActions,
                expected_hwnd: windowInfo?.hwnd || 0,
                expected_pid: windowInfo?.pid || 0,
                stop_on_error: stopOnError,
                stop_on_window_change: stopOnWindowChange,
                stop_on_dialog: stopOnDialog,
                confirm_destructive: confirmDestructive,
                depends_on_new_info: dependsOnNewInfo,
                inter_action_delay_ms: interActionDelayMs,
                capture_state_after: true
            });
            const seqBridgeMs = Date.now() - seqStart;
            mergeNativeTimings(timings, seqRes?.timings_ms, seqBridgeMs);

            // 2. Checkpoint-based Vision Fallback: ONLY if a step failed because its semantic target was not found in UIA or Local OCR,
            // capture AT MOST ONE screenshot to ground all remaining unresolved visual targets in a single vision call, then resume from the failed step!
            const failedIdx = seqRes?.failed_step_index;
            const failedStepRes = Array.isArray(seqRes?.results) && failedIdx !== null && failedIdx !== undefined
                ? seqRes.results[failedIdx]
                : null;
            const failedDueToMissingTarget =
                !seqRes?.success &&
                failedIdx !== null &&
                failedIdx !== undefined &&
                failedIdx >= 0 &&
                failedIdx < preparedActions.length &&
                (failedStepRes?.target_not_found || failedStepRes?.uia_found === false) &&
                !failedStepRes?.target_disabled;

            if (failedDueToMissingTarget) {
                const remainingActions = preparedActions.slice(failedIdx);
                const targetsToGround = remainingActions
                    .map((s) => (typeof s.target === "string" ? s.target.trim() : ""))
                    .filter(Boolean);

                if (targetsToGround.length > 0) {
                    const activeVisionModel = getVisionModel();
                    logDesktop(
                        "VISION:CHECKPOINT_FALLBACK",
                        `[MODEL: ${activeVisionModel}] Step ${failedIdx + 1} target not found in UIA/OCR. Grounding ${targetsToGround.length} remaining target(s) in a SINGLE vision pass...`
                    );
                    let visionMap = await resolveMultipleTargetsWithVision(
                        targetsToGround,
                        seqRes?.target_window || windowInfo,
                        profile,
                        timings
                    );
                    visionModelUsed = visionMap.vision_model || activeVisionModel;

                    // If multi-target vision missed the immediate failed target, try single-target vision once on that target
                    const immediateTarget = String(remainingActions[0].target || "").trim();
                    if (immediateTarget && !visionMap.has(immediateTarget.toLowerCase())) {
                        const singleVis = await tryResolveWithVision(
                            immediateTarget,
                            seqRes?.target_window || windowInfo,
                            profile,
                            "",
                            timings
                        );
                        if (singleVis.vision_model) {
                            visionModelUsed = singleVis.vision_model;
                        }
                        if (singleVis.found) {
                            visionMap.set(immediateTarget.toLowerCase(), singleVis);
                        }
                    }

                    let anyResolved = false;
                    for (const remStep of remainingActions) {
                        const tKey = String(remStep.target || "").trim().toLowerCase();
                        if (tKey && visionMap.has(tKey)) {
                            const vMatch = visionMap.get(tKey);
                            remStep.x = vMatch.x;
                            remStep.y = vMatch.y;
                            remStep.prefer_uia = false;
                            remStep.resolved_by = "vision";
                            remStep.vision_model = vMatch.vision_model || visionModelUsed;
                            remStep.matched_label = vMatch.label;
                            anyResolved = true;
                        }
                    }

                    if (anyResolved) {
                        const retryStart = Date.now();
                        const retryRes = await nativeBridge.send("execute_action_sequence", {
                            actions: remainingActions,
                            expected_hwnd: windowInfo?.hwnd || 0,
                            expected_pid: windowInfo?.pid || 0,
                            stop_on_error: stopOnError,
                            stop_on_window_change: stopOnWindowChange,
                            stop_on_dialog: stopOnDialog,
                            confirm_destructive: confirmDestructive,
                            depends_on_new_info: dependsOnNewInfo,
                            inter_action_delay_ms: interActionDelayMs,
                            capture_state_after: true
                        });
                        const retryBridgeMs = Date.now() - retryStart;
                        mergeNativeTimings(timings, retryRes?.timings_ms, retryBridgeMs);

                        const priorSuccessResults = (seqRes.results || []).slice(0, failedIdx);
                        const combinedResults = [
                            ...priorSuccessResults,
                            ...(retryRes?.results || []).map((r, idx) => ({
                                ...r,
                                step_index: failedIdx + idx,
                                vision_model: remainingActions[idx]?.vision_model || null
                            }))
                        ];

                        seqRes = {
                            ...retryRes,
                            total_requested: preparedActions.length,
                            total_executed: combinedResults.length,
                            results: combinedResults,
                            failed_step_index:
                                retryRes?.failed_step_index !== null && retryRes?.failed_step_index !== undefined
                                    ? failedIdx + Number(retryRes.failed_step_index)
                                    : null
                        };
                    }
                }
            }

            sessionPerformanceStats.total_sequences += 1;
            sessionPerformanceStats.total_actions_executed += Number(seqRes?.total_executed || 0);

            const nativeCheckpoint = seqRes?.checkpoint || {};
            const checkpoint = evaluateVerificationCheckpoint({
                appOpenedOrSwitched: appSwitched || Boolean(nativeCheckpoint.app_switched),
                windowTitleChanged: Boolean(nativeCheckpoint.window_title_changed),
                changeScore: Number(nativeCheckpoint.change_score ?? seqRes?.screen_change?.change_score ?? 0),
                dialogAppeared: Boolean(seqRes?.dialog_appeared || nativeCheckpoint.dialog_appeared),
                actionFailed: seqRes?.success === false,
                dependsOnNewInfo
            });

            if (!checkpoint.should_request_visual_inference) {
                sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
            }

            // Avoid taking a redundant 3rd screenshot + WinRT OCR after every sequence!
            // Only query compact UIA screen state (without slow OCR unless Electron) if dependsOnNewInfo is true.
            let compactState = null;
            if (dependsOnNewInfo) {
                const isElec = isElectronOrCefWindow(seqRes?.target_window || windowInfo, profile);
                const stateAttempt = await getCompactScreenState(seqRes?.target_window || windowInfo, {
                    includeOcr: isElec,
                    maxElements: 40,
                    timings
                });
                if (stateAttempt.success) compactState = stateAttempt;
            }

            const finalTimings = finalizeTimingBucket(timings, opStart);

            if (!seqRes?.success) {
                return {
                    success: false,
                    action: "execute_action_sequence",
                    model: visionModelUsed || null,
                    vision_model: visionModelUsed || null,
                    requires_confirmation: Boolean(seqRes?.requires_confirmation),
                    cancelled: Boolean(seqRes?.cancelled),
                    aborted_reason: seqRes?.aborted_reason || "sequence_failed",
                    failed_step_index: seqRes?.failed_step_index ?? null,
                    unexpected_window_change: Boolean(seqRes?.unexpected_window_change),
                    dialog_appeared: Boolean(seqRes?.dialog_appeared),
                    target_window: seqRes?.target_window || windowInfo,
                    calculator_display: seqRes?.calculator_display || null,
                    focused_value: seqRes?.focused_value || null,
                    total_requested: rawActions.length,
                    total_executed: seqRes?.total_executed || 0,
                    results: seqRes?.results || [],
                    checkpoint,
                    screen_state: compactState,
                    timings_ms: finalTimings,
                    error:
                        seqRes?.error ||
                        seqRes?.results?.find((r) => !r.success)?.error ||
                        `Action sequence stopped (${seqRes?.aborted_reason || "failed"}).`,
                    simulated: false
                };
            }

            return {
                success: true,
                action: "execute_action_sequence",
                model: visionModelUsed || null,
                vision_model: visionModelUsed || null,
                app_name: profile?.id || appName || seqRes?.target_window?.process_name || null,
                target_window: seqRes?.target_window || windowInfo,
                calculator_display: seqRes?.calculator_display || null,
                focused_value: seqRes?.focused_value || null,
                total_requested: rawActions.length,
                total_executed: seqRes.total_executed,
                results: seqRes.results || [],
                screen_change: seqRes.screen_change || null,
                checkpoint,
                screen_state: compactState,
                timings_ms: finalTimings,
                simulated: false
            };
        }
    );
}

// --- Exported Desktop Primitives & Tools ---

export async function moveMouse(args = {}) {
    const x = Number(args.x);
    const y = Number(args.y);
    const smooth = args.smooth !== false;
    const durationMs = Number(args.duration_ms ?? 85);

    return enqueueDesktopAction("move_mouse", { x, y, smooth }, async () => {
        const opStart = Date.now();
        const timings = createTimingBucket();

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return {
                success: false,
                action: "move_mouse",
                failed_stage: "validation",
                error: "Both x and y coordinates must be valid numbers.",
                timings_ms: finalizeTimingBucket(timings, opStart)
            };
        }

        const t0 = Date.now();
        const res = await nativeBridge.send("move_mouse", {
            x: Math.round(x),
            y: Math.round(y),
            smooth,
            duration_ms: durationMs
        });
        timings.mouse_keyboard_execution_ms += Number(res?.duration_ms || (Date.now() - t0));

        return {
            ...res,
            action: "move_mouse",
            timings_ms: finalizeTimingBucket(timings, opStart),
            simulated: false
        };
    });
}

export async function dragAndDrop(args = {}) {
    return enqueueDesktopAction("desktop_drag", args, async () => {
        const opStart = Date.now();
        const timings = createTimingBucket();
        const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";

        let windowInfo = null;
        let profile = null;
        if (appName || args.from_target || args.to_target) {
            const winRes = await ensureTargetWindow(appName, { timings });
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "desktop_drag",
                    failed_stage: "window_focus",
                    error: winRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }
            windowInfo = winRes.window || null;
            profile = winRes.profile || null;
        }

        let fromX = Number.isFinite(Number(args.from_x)) ? Math.round(Number(args.from_x)) : null;
        let fromY = Number.isFinite(Number(args.from_y)) ? Math.round(Number(args.from_y)) : null;
        let toX = Number.isFinite(Number(args.to_x)) ? Math.round(Number(args.to_x)) : null;
        let toY = Number.isFinite(Number(args.to_y)) ? Math.round(Number(args.to_y)) : null;

        let visionModelUsed = null;
        if ((fromX === null || fromY === null) && args.from_target) {
            const fromRes = await resolveTargetCoordinates({
                target: args.from_target,
                appName,
                windowInfo,
                profile,
                allowScrollRetry: false,
                timings
            });
            if (fromRes.vision_model) visionModelUsed = fromRes.vision_model;
            if (!fromRes.found) {
                return {
                    success: false,
                    action: "desktop_drag",
                    model: visionModelUsed,
                    vision_model: visionModelUsed,
                    failed_stage: "from_target_resolution",
                    error: fromRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }
            fromX = fromRes.x;
            fromY = fromRes.y;
        }

        if ((toX === null || toY === null) && args.to_target) {
            const toRes = await resolveTargetCoordinates({
                target: args.to_target,
                appName,
                windowInfo,
                profile,
                allowScrollRetry: false,
                timings
            });
            if (toRes.vision_model) visionModelUsed = toRes.vision_model;
            if (!toRes.found) {
                return {
                    success: false,
                    action: "desktop_drag",
                    model: visionModelUsed,
                    vision_model: visionModelUsed,
                    failed_stage: "to_target_resolution",
                    error: toRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }
            toX = toRes.x;
            toY = toRes.y;
        }

        const t0 = Date.now();
        const dragRes = await nativeBridge.send("mouse_drag", {
            from_x: fromX,
            from_y: fromY,
            to_x: toX,
            to_y: toY,
            button: (args.button || "left").toLowerCase(),
            duration_ms: Number(args.duration_ms ?? 200)
        });
        timings.mouse_keyboard_execution_ms += Number(dragRes?.duration_ms || (Date.now() - t0));

        return {
            ...dragRes,
            action: "desktop_drag",
            model: visionModelUsed,
            vision_model: visionModelUsed,
            timings_ms: finalizeTimingBucket(timings, opStart),
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
    const confirmDestructive = Boolean(args.confirm_destructive || args.confirmed_destructive);
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
            const opStart = Date.now();
            const timings = createTimingBucket();

            if (!target && !hasExplicitCoords) {
                return {
                    success: false,
                    action: "desktop_click",
                    failed_stage: "validation",
                    error: "desktop_click requires either a 'target' UI element description or explicit 'x' and 'y' coordinates.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            if (!confirmDestructive && target) {
                const destructive = detectDestructiveAction({ action: "click", target });
                if (destructive) {
                    return {
                        success: false,
                        action: "desktop_click",
                        requires_confirmation: true,
                        destructive_action_detected: true,
                        target,
                        error: destructive.reason,
                        message: `${destructive.reason} Please confirm if you want STRANGE to proceed.`,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
            }

            let windowInfo = null;
            let profile = null;

            if (appName || !hasExplicitCoords) {
                const winRes = await ensureTargetWindow(appName, { timings });
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_click",
                        failed_stage: winRes.failed_stage || "window_focus",
                        app_name: appName,
                        error: winRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            // 1. Prefer direct semantic UI Automation invocation for single left-clicks whenever possible (Requirement 3)
            if (!hasExplicitCoords && target && button === "left" && clickType === "single" && mode !== "vision") {
                const uiaStart = Date.now();
                const uiaInvokeRes = await nativeBridge.send("uia_action", {
                    hwnd: windowInfo?.hwnd || 0,
                    action: "invoke",
                    target,
                    role: args.role || ""
                });
                timings.uia_lookup_ms += Date.now() - uiaStart;

                if (uiaInvokeRes?.target_disabled) {
                    return {
                        success: false,
                        action: "desktop_click",
                        failed_stage: "uia_control_disabled",
                        target,
                        target_disabled: true,
                        target_window: uiaInvokeRes.target_window || windowInfo,
                        error: uiaInvokeRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                if (uiaInvokeRes?.success) {
                    sessionPerformanceStats.uia_direct_hits += 1;
                    logDesktop(
                        "UIA:INVOKE",
                        `Directly invoked "${uiaInvokeRes.matched_label || target}" (${uiaInvokeRes.role}) via ${uiaInvokeRes.detection_method}`
                    );
                    await sleep(160);
                    return {
                        success: true,
                        action: "desktop_click",
                        button,
                        click_type: clickType,
                        target,
                        matched_label: uiaInvokeRes.matched_label || target,
                        role: uiaInvokeRes.role,
                        detection_method: uiaInvokeRes.detection_method || "uia_pattern_invoke",
                        uia_pattern: uiaInvokeRes.uia_pattern || null,
                        confidence: 1,
                        x: uiaInvokeRes.x,
                        y: uiaInvokeRes.y,
                        target_window: uiaInvokeRes.target_window || windowInfo,
                        window_title: uiaInvokeRes.target_window?.title || windowInfo?.title || null,
                        app_name: profile?.id || appName || windowInfo?.process_name || null,
                        duration_ms: uiaInvokeRes.duration_ms,
                        verification: uiaInvokeRes.verification,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }
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
                    allowScrollRetry: args.scroll_if_needed !== false,
                    timings
                });

                if (!resolved.found) {
                    return {
                        success: false,
                        action: "desktop_click",
                        model: resolved.vision_model || resolved.model || null,
                        vision_model: resolved.vision_model || null,
                        failed_stage: resolved.failed_stage || "target_resolution",
                        target,
                        target_disabled: Boolean(resolved.target_disabled),
                        app_name: appName || windowInfo?.process_name || null,
                        window_title: windowInfo?.title || null,
                        target_window: windowInfo,
                        visible_summary: resolved.visible_summary || null,
                        screenshot_path: resolved.screenshot_path || null,
                        error: resolved.error || `Could not find target "${target}" on screen.`,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                clickX = resolved.x;
                clickY = resolved.y;
                resolutionInfo = resolved;
            }

            logDesktop(
                "INPUT:CLICK",
                `Performing ${clickType} ${button}-click at (${clickX}, ${clickY}) [target="${resolutionInfo.label}", method=${resolutionInfo.method}${resolutionInfo.vision_model ? `, model=${resolutionInfo.vision_model}` : ""}]`
            );

            const clickStart = Date.now();
            const clickRes = await nativeBridge.send("mouse_click", {
                x: clickX,
                y: clickY,
                button,
                click_type: clickType,
                prefer_uia: false,
                expected_hwnd: windowInfo?.hwnd || 0,
                expected_pid: windowInfo?.pid || 0,
                smooth: true,
                duration_ms: 85,
                settle_ms: 35
            });
            timings.mouse_keyboard_execution_ms += Number(clickRes?.duration_ms || (Date.now() - clickStart));

            if (!clickRes?.success) {
                return {
                    success: false,
                    action: "desktop_click",
                    model: resolutionInfo.vision_model || resolutionInfo.model || null,
                    vision_model: resolutionInfo.vision_model || null,
                    failed_stage: "mouse_click",
                    target: target || null,
                    requested_x: clickX,
                    requested_y: clickY,
                    target_window: clickRes?.target_window || windowInfo,
                    verification: clickRes?.verification || null,
                    error: clickRes?.error || "Native mouse click failed.",
                    timings_ms: finalizeTimingBucket(timings, opStart),
                    simulated: false
                };
            }

            await sleep(180);

            return {
                success: true,
                action: "desktop_click",
                model: resolutionInfo.vision_model || resolutionInfo.model || null,
                vision_model: resolutionInfo.vision_model || null,
                button,
                click_type: clickType,
                target: target || null,
                matched_label: resolutionInfo.label,
                detection_method: resolutionInfo.method,
                confidence: resolutionInfo.confidence,
                x: clickRes.x,
                y: clickRes.y,
                target_window: clickRes.target_window || windowInfo,
                window_title: clickRes.target_window?.title || windowInfo?.title || null,
                app_name: profile?.id || appName || windowInfo?.process_name || null,
                duration_ms: clickRes.duration_ms,
                verification: clickRes.verification,
                timings_ms: finalizeTimingBucket(timings, opStart),
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
            const opStart = Date.now();
            const timings = createTimingBucket();

            if (!["up", "down", "left", "right"].includes(direction)) {
                return {
                    success: false,
                    action: "desktop_scroll",
                    failed_stage: "validation",
                    error: `Invalid scroll direction "${direction}". Must be one of: up, down, left, right.`,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            let windowInfo = null;
            let profile = null;
            if (appName || target) {
                const winRes = await ensureTargetWindow(appName, { timings });
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_scroll",
                        failed_stage: "window_focus",
                        error: winRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            let scrollX = Number.isFinite(Number(args.x)) ? Math.round(Number(args.x)) : null;
            let scrollY = Number.isFinite(Number(args.y)) ? Math.round(Number(args.y)) : null;
            let visionModelUsed = null;

            if (scrollX === null && scrollY === null && target) {
                const resolved = await resolveTargetCoordinates({
                    target,
                    appName,
                    windowInfo,
                    profile,
                    allowScrollRetry: false,
                    timings
                });
                if (resolved.vision_model) visionModelUsed = resolved.vision_model;
                if (resolved.found) {
                    scrollX = resolved.x;
                    scrollY = resolved.y;
                }
            }

            if (scrollX === null && scrollY === null && windowInfo?.rect) {
                scrollX = Math.round(windowInfo.rect.x + windowInfo.rect.width * 0.5);
                scrollY = Math.round(windowInfo.rect.y + windowInfo.rect.height * 0.55);
            }

            const scStart = Date.now();
            const scrollRes = await nativeBridge.send("mouse_scroll", {
                direction,
                amount,
                x: scrollX,
                y: scrollY
            });
            timings.mouse_keyboard_execution_ms += Number(scrollRes?.duration_ms || (Date.now() - scStart));

            if (!scrollRes?.success) {
                return {
                    success: false,
                    action: "desktop_scroll",
                    model: visionModelUsed,
                    vision_model: visionModelUsed,
                    failed_stage: "mouse_scroll",
                    target_window: scrollRes?.target_window || windowInfo,
                    error: scrollRes?.error || "Mouse scroll failed.",
                    timings_ms: finalizeTimingBucket(timings, opStart),
                    simulated: false
                };
            }

            await sleep(160);

            return {
                success: true,
                action: "desktop_scroll",
                model: visionModelUsed,
                vision_model: visionModelUsed,
                direction,
                amount,
                x: scrollRes.x,
                y: scrollRes.y,
                target_window: scrollRes.target_window || windowInfo,
                window_title: scrollRes.target_window?.title || windowInfo?.title || null,
                duration_ms: scrollRes.duration_ms,
                verification: scrollRes.verification,
                timings_ms: finalizeTimingBucket(timings, opStart),
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
    const confirmDestructive = Boolean(args.confirm_destructive || args.confirmed_destructive);

    return enqueueDesktopAction(
        "desktop_type",
        { text, target: target || null, app_name: appName || null, press_enter: pressEnter, clear_first: clearFirst },
        async () => {
            const opStart = Date.now();
            const timings = createTimingBucket();

            if (!text) {
                return {
                    success: false,
                    action: "desktop_type",
                    failed_stage: "validation",
                    error: "Text to type must not be empty.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            if (!confirmDestructive) {
                const destructive = detectDestructiveAction({ action: "type", text, target });
                if (destructive) {
                    return {
                        success: false,
                        action: "desktop_type",
                        requires_confirmation: true,
                        destructive_action_detected: true,
                        error: destructive.reason,
                        message: `${destructive.reason} Please confirm if you want STRANGE to proceed.`,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
            }

            let windowInfo = null;
            let profile = null;
            if (appName || target) {
                const winRes = await ensureTargetWindow(appName, { timings });
                if (!winRes.success && appName) {
                    return {
                        success: false,
                        action: "desktop_type",
                        failed_stage: "window_focus",
                        error: winRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
                windowInfo = winRes.window || null;
                profile = winRes.profile || null;
            }

            // Try direct UIA ValuePattern or UIA-focused typing first when target is specified
            let clickedInput = null;
            let visionModelUsed = null;
            if (target) {
                const uiaStart = Date.now();
                const uiaTypeRes = await nativeBridge.send("uia_action", {
                    hwnd: windowInfo?.hwnd || 0,
                    action: "set_value",
                    target,
                    text,
                    clear_first: clearFirst,
                    press_enter: pressEnter
                });
                timings.uia_lookup_ms += Date.now() - uiaStart;

                if (uiaTypeRes?.target_disabled) {
                    return {
                        success: false,
                        action: "desktop_type",
                        failed_stage: "uia_control_disabled",
                        target,
                        error: uiaTypeRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                if (uiaTypeRes?.success) {
                    sessionPerformanceStats.uia_direct_hits += 1;
                    await sleep(pressEnter ? 260 : 120);
                    return {
                        success: true,
                        action: "desktop_type",
                        text,
                        target,
                        detection_method: uiaTypeRes.detection_method || "uia_direct",
                        cleared_first: clearFirst,
                        pressed_enter: pressEnter,
                        target_window: uiaTypeRes.target_window || windowInfo,
                        window_title: uiaTypeRes.target_window?.title || windowInfo?.title || null,
                        duration_ms: uiaTypeRes.duration_ms,
                        verification: uiaTypeRes.verification,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                const resolved = await resolveTargetCoordinates({
                    target,
                    appName,
                    windowInfo,
                    profile,
                    allowScrollRetry: false,
                    timings
                });
                if (resolved.vision_model) visionModelUsed = resolved.vision_model;

                if (!resolved.found) {
                    return {
                        success: false,
                        action: "desktop_type",
                        model: visionModelUsed,
                        vision_model: visionModelUsed,
                        failed_stage: "input_target_lookup",
                        target,
                        error: resolved.error || `Could not locate input field "${target}" before typing.`,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                logDesktop("INPUT:FOCUS_FIELD", `Clicking input field "${target}" at (${resolved.x}, ${resolved.y}) before typing`);
                const clickStart = Date.now();
                const clickRes = await nativeBridge.send("mouse_click", {
                    x: resolved.x,
                    y: resolved.y,
                    button: "left",
                    click_type: "single",
                    prefer_uia: false,
                    smooth: true,
                    duration_ms: 80,
                    settle_ms: 35
                });
                timings.mouse_keyboard_execution_ms += Number(clickRes?.duration_ms || (Date.now() - clickStart));

                if (!clickRes?.success) {
                    return {
                        success: false,
                        action: "desktop_type",
                        model: visionModelUsed,
                        vision_model: visionModelUsed,
                        failed_stage: "input_field_click",
                        error: clickRes?.error || `Failed to click input field "${target}"`,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                clickedInput = {
                    x: resolved.x,
                    y: resolved.y,
                    method: resolved.method,
                    label: resolved.label,
                    vision_model: visionModelUsed
                };

                await sleep(120);
            }

            logDesktop("INPUT:TYPE", `Typing "${text}" (clear_first=${clearFirst}, press_enter=${pressEnter})`);
            const typeStart = Date.now();
            const typeRes = await nativeBridge.send("type_text", {
                text,
                clear_first: clearFirst,
                press_enter: pressEnter,
                delay_ms: 8
            });
            timings.mouse_keyboard_execution_ms += Number(typeRes?.duration_ms || (Date.now() - typeStart));

            if (!typeRes?.success) {
                return {
                    success: false,
                    action: "desktop_type",
                    model: visionModelUsed,
                    vision_model: visionModelUsed,
                    failed_stage: "type_text",
                    target_window: typeRes?.target_window || windowInfo,
                    error: typeRes?.error || "Failed to type text.",
                    timings_ms: finalizeTimingBucket(timings, opStart),
                    simulated: false
                };
            }

            await sleep(pressEnter ? 280 : 120);

            return {
                success: true,
                action: "desktop_type",
                model: visionModelUsed,
                vision_model: visionModelUsed,
                text,
                target: target || null,
                clicked_input: clickedInput,
                cleared_first: clearFirst,
                pressed_enter: pressEnter,
                target_window: typeRes.target_window || windowInfo,
                window_title: typeRes.target_window?.title || windowInfo?.title || null,
                duration_ms: typeRes.duration_ms,
                verification: typeRes.verification,
                timings_ms: finalizeTimingBucket(timings, opStart),
                simulated: false
            };
        }
    );
}

export async function pressKey(args = {}) {
    const key = typeof args.key === "string" ? args.key.trim() : "";
    const modifiers = Array.isArray(args.modifiers) ? args.modifiers : [];
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const confirmDestructive = Boolean(args.confirm_destructive || args.confirmed_destructive);

    return enqueueDesktopAction(
        "desktop_press_key",
        { key, modifiers, app_name: appName || null },
        async () => {
            const opStart = Date.now();
            const timings = createTimingBucket();

            if (!key) {
                return {
                    success: false,
                    action: "desktop_press_key",
                    failed_stage: "validation",
                    error: "Key name is required (e.g. 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k').",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            if (!confirmDestructive) {
                const destructive = detectDestructiveAction({ action: "key_press", key });
                if (destructive) {
                    return {
                        success: false,
                        action: "desktop_press_key",
                        requires_confirmation: true,
                        destructive_action_detected: true,
                        error: destructive.reason,
                        message: `${destructive.reason} Please confirm if you want STRANGE to proceed.`,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
            }

            let windowInfo = null;
            if (appName) {
                const winRes = await ensureTargetWindow(appName, { timings });
                if (!winRes.success) {
                    return {
                        success: false,
                        action: "desktop_press_key",
                        failed_stage: "window_focus",
                        error: winRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }
                windowInfo = winRes.window;
            }

            logDesktop("INPUT:KEY", `Pressing key "${key}"`, { modifiers });
            const keyStart = Date.now();
            const keyRes = await nativeBridge.send("key_press", {
                key,
                modifiers
            });
            timings.mouse_keyboard_execution_ms += Number(keyRes?.duration_ms || (Date.now() - keyStart));

            if (!keyRes?.success) {
                return {
                    success: false,
                    action: "desktop_press_key",
                    failed_stage: "key_press",
                    target_window: keyRes?.target_window || windowInfo,
                    error: keyRes?.error || `Failed to press key "${key}".`,
                    timings_ms: finalizeTimingBucket(timings, opStart),
                    simulated: false
                };
            }

            await sleep(150);

            return {
                success: true,
                action: "desktop_press_key",
                key,
                modifiers,
                target_window: keyRes.target_window || windowInfo,
                window_title: keyRes.target_window?.title || windowInfo?.title || null,
                duration_ms: keyRes.duration_ms,
                verification: keyRes.verification,
                timings_ms: finalizeTimingBucket(timings, opStart),
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
            const opStart = Date.now();
            const timings = createTimingBucket();

            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
            const fileName = `screenshot-${Date.now()}.jpg`;
            const savePath = path.join(SCREENSHOT_DIR, fileName);

            let cropRect;
            let windowTitle = null;
            let targetHwnd = 0;
            if (appName) {
                const winRes = await ensureTargetWindow(appName, { timings });
                if (winRes.success && winRes.window?.rect) {
                    cropRect = winRes.window.rect;
                    windowTitle = winRes.window.title;
                    targetHwnd = winRes.window.hwnd || 0;
                }
            }

            const shotStart = Date.now();
            const shotRes = await nativeBridge.send("screenshot", {
                hwnd: targetHwnd,
                crop_rect: cropRect,
                max_width: 1366,
                format: "jpeg",
                quality: 84,
                include_ocr: Boolean(args.include_ocr),
                save_path: savePath
            });
            timings.screenshot_capture_ms += Date.now() - shotStart;

            if (!shotRes?.success) {
                return {
                    success: false,
                    screenshot_available: false,
                    simulated: false,
                    error: shotRes?.error || "Screenshot capture failed.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
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
                byte_length: shotRes.byte_length,
                screen_changed: shotRes.screen_changed,
                change_score: shotRes.change_score,
                hash: shotRes.hash,
                ocr: shotRes.ocr || null,
                timings_ms: finalizeTimingBucket(timings, opStart)
            };
        }
    );
}

export async function inspectDesktopUI(args = {}) {
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const question = typeof args.question === "string" ? args.question.trim() : "";
    const useVision = args.use_vision !== false;

    return enqueueDesktopAction(
        "desktop_inspect",
        { app_name: appName || null, question: question || "visual_screen_inspection", use_vision: useVision },
        async () => {
            const opStart = Date.now();
            const timings = createTimingBucket();

            const winRes = await ensureTargetWindow(appName, { timings });
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "desktop_inspect",
                    failed_stage: "window_focus",
                    error: winRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            const windowInfo = winRes.window || null;
            const profile = winRes.profile || null;
            const isElectron = isElectronOrCefWindow(windowInfo, profile);

            // Retrieve fast compact screen state via Windows UIA (skip redundant WinRT OCR screenshot when using Vision LLM)
            const compactState = await getCompactScreenState(windowInfo, {
                query: question,
                includeOcr: !useVision,
                maxElements: 65,
                timings
            });

            const hasRichLocalState =
                (compactState.uia_elements?.length || 0) >= 3 ||
                (compactState.ocr_lines?.length || 0) >= 2;

            if (!useVision && hasRichLocalState) {
                sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
                return {
                    success: true,
                    action: "desktop_inspect",
                    window_title: compactState.active_window?.title || windowInfo?.title || null,
                    process_name: compactState.active_window?.process_name || windowInfo?.process_name || null,
                    active_window: compactState.active_window || windowInfo,
                    is_electron: isElectron,
                    screen_changed: compactState.screen_changed,
                    change_score: compactState.change_score,
                    uia_elements_sample: compactState.uia_elements,
                    ocr_lines: compactState.ocr_lines,
                    vision_analysis: null,
                    timings_ms: finalizeTimingBucket(timings, opStart),
                    simulated: false
                };
            }

            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });
            const savePath = path.join(SCREENSHOT_DIR, "latest_inspect.jpg");
            const cropRect =
                windowInfo?.rect?.width >= 100 && windowInfo?.rect?.height >= 80
                    ? windowInfo.rect
                    : undefined;
            const shotStart = Date.now();
            let shotRes = await nativeBridge.send("screenshot", {
                hwnd: cropRect ? (windowInfo?.hwnd || 0) : 0,
                crop_rect: cropRect,
                max_width: 1280,
                format: "jpeg",
                quality: 82,
                save_path: savePath
            });
            if ((!shotRes?.success || !shotRes.base64) && cropRect) {
                shotRes = await nativeBridge.send("screenshot", {
                    hwnd: 0,
                    max_width: 1280,
                    format: "jpeg",
                    quality: 82,
                    save_path: savePath
                });
            }
            timings.screenshot_capture_ms += Date.now() - shotStart;

            if (!shotRes?.success || !shotRes.base64) {
                if (compactState.success) {
                    return {
                        success: true,
                        action: "desktop_inspect",
                        window_title: compactState.active_window?.title || windowInfo?.title || "Desktop",
                        process_name: compactState.active_window?.process_name || windowInfo?.process_name || null,
                        active_window: compactState.active_window || windowInfo,
                        is_electron: isElectron,
                        screen_changed: compactState.screen_changed,
                        change_score: compactState.change_score,
                        uia_elements_sample: compactState.uia_elements || [],
                        ocr_lines: compactState.ocr_lines || [],
                        vision_analysis: null,
                        capture_warning: shotRes?.error || "Screenshot unavailable; returned UIA state.",
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }
                return {
                    success: false,
                    action: "desktop_inspect",
                    failed_stage: "screenshot",
                    error: shotRes?.error || "Failed to capture screenshot for UI inspection.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            const uiaNames = (compactState.uia_elements || [])
                .map((e) => e.name)
                .filter(Boolean)
                .slice(0, 20);
            const uiaHint = uiaNames.length > 0 ? `\nAccessible UI controls: ${JSON.stringify(uiaNames)}` : "";

            const prompt = `Inspect this screenshot of "${windowInfo?.title || "Desktop"}".
Question / Focus: ${question || "Describe the visible interactive UI elements, buttons, playlists, or items."}${uiaHint}
Return JSON with:
{
  "summary": "concise description of current screen state",
  "visible_elements": ["list of key visible buttons, playlists, tabs, inputs, or items"],
  "answer": "direct answer to the question"
}`;

            const visionModel = getVisionModel();
            logDesktop(
                "VISION:MODEL",
                `[MODEL: ${visionModel}] Running desktop_inspect visual analysis on "${windowInfo?.title || "Desktop"}"`
            );
            const llmStart = Date.now();
            const response = await ollama.chat({
                model: visionModel,
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
            const usedVisionModel = response?.model || visionModel;
            const llmMs = Date.now() - llmStart;
            timings.vision_inference_ms += llmMs;
            sessionPerformanceStats.vision_inferences_count += 1;

            logDesktop(
                "VISION:INSPECT_DONE",
                `[MODEL: ${usedVisionModel}] Completed visual inspection in ${llmMs}ms`
            );

            let parsed = {};
            try {
                parsed = JSON.parse(response.message?.content || "{}");
            } catch {
                parsed = { summary: response.message?.content || "" };
            }

            return {
                success: true,
                action: "desktop_inspect",
                model: usedVisionModel,
                vision_model: usedVisionModel,
                window_title: windowInfo?.title || null,
                process_name: windowInfo?.process_name || null,
                active_window: compactState.active_window || windowInfo,
                is_electron: isElectron,
                screen_changed: shotRes.screen_changed,
                change_score: shotRes.change_score,
                uia_elements_sample: compactState.uia_elements || [],
                ocr_lines: compactState.ocr_lines || [],
                vision_analysis: parsed,
                screenshot_path: savePath,
                timings_ms: finalizeTimingBucket(timings, opStart),
                simulated: false
            };
        }
    );
}

function tryExtractCalculatorExpression(goalText) {
    if (!goalText || typeof goalText !== "string") return null;
    const normalized = goalText
        .toLowerCase()
        .replace(/\bplus\b/g, "+")
        .replace(/\badd\b/g, "+")
        .replace(/\bminus\b/g, "-")
        .replace(/\bsubtract\b/g, "-")
        .replace(/\btimes\b/g, "*")
        .replace(/\bmultiplied\s+by\b/g, "*")
        .replace(/\bmultiply\s+by\b/g, "*")
        .replace(/\bmultiply\b/g, "*")
        .replace(/\bdivided\s+by\b/g, "/")
        .replace(/\bdivide\s+by\b/g, "/")
        .replace(/\bdivide\b/g, "/")
        .replace(/\bequals\b/g, "=")
        .replace(/\bequal\b/g, "=")
        .replace(/[×x](?=\s*\d)/g, "*")
        .replace(/÷/g, "/");

    const match = normalized.match(/(\d+(?:\.\d+)?(?:\s*[\+\-\*\/\%]\s*\d+(?:\.\d+)?)+)\s*=*/);
    if (!match) return null;
    return match[1].replace(/\s+/g, "") + "=";
}

// --- Autonomous Multi-Step In-Application Desktop Controller (Batched Planning + Checkpoint Verification) ---
// Plans a short sequence of actions per checkpoint and executes them in batch via C# execute_action_sequence
// without requesting a new Qwen vision inference after every mouse movement, click, or keystroke.
export async function desktopControl(args = {}) {
    const goal = typeof args.goal === "string" ? args.goal.trim() : "";
    const appName = typeof args.app_name === "string" ? args.app_name.trim() : "";
    const maxCheckpoints = Math.max(1, Math.min(8, Number(args.max_steps ?? 5)));
    const confirmDestructive = Boolean(args.confirm_destructive || args.confirmed_destructive);

    return enqueueDesktopAction(
        "desktop_control",
        { goal, app_name: appName || null, max_checkpoints: maxCheckpoints },
        async () => {
            const opStart = Date.now();
            const timings = createTimingBucket();
            activeSequenceAbortRequested = false;

            if (!goal) {
                return {
                    success: false,
                    action: "desktop_control",
                    failed_stage: "validation",
                    error: "A 'goal' string is required for desktop_control.",
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            const winRes = await ensureTargetWindow(appName, {
                waitTimeoutMs: 7500,
                settleAfterFocusMs: 200,
                timings
            });
            if (!winRes.success && appName) {
                return {
                    success: false,
                    action: "desktop_control",
                    failed_stage: "window_focus",
                    app_name: appName,
                    error: winRes.error,
                    timings_ms: finalizeTimingBucket(timings, opStart)
                };
            }

            let windowInfo = winRes.window || null;
            const profile = winRes.profile || null;
            const isCalc =
                profile?.id === "calculator" ||
                /calculator|calc/i.test(windowInfo?.process_name || "") ||
                /calculator/i.test(windowInfo?.title || "");

            // Fast Path 1: Deterministic Calculator UIA execution (0 screenshots, 0 vision calls, 100% accuracy!)
            if (isCalc) {
                const calcExpr = tryExtractCalculatorExpression(goal);
                if (calcExpr) {
                    logDesktop("CONTROL:CALC_UIA", `Executing Calculator expression "${calcExpr}" directly via Windows UI Automation (0 vision calls)`);
                    const batchStart = Date.now();
                    const calcBatchRes = await nativeBridge.send("execute_action_sequence", {
                        actions: [
                            {
                                action: "type_text",
                                text: calcExpr,
                                clear_first: true,
                                press_enter: false
                            }
                        ],
                        expected_hwnd: windowInfo?.hwnd || 0,
                        expected_pid: windowInfo?.pid || 0,
                        stop_on_error: true,
                        stop_on_window_change: true,
                        stop_on_dialog: true,
                        confirm_destructive: confirmDestructive,
                        inter_action_delay_ms: 35,
                        capture_state_after: false
                    });
                    const batchBridgeMs = Date.now() - batchStart;
                    mergeNativeTimings(timings, calcBatchRes?.timings_ms, batchBridgeMs);

                    if (calcBatchRes?.success) {
                        sessionPerformanceStats.total_sequences += 1;
                        sessionPerformanceStats.total_actions_executed += 1;
                        sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
                        sessionPerformanceStats.uia_direct_hits += 1;

                        const disp = calcBatchRes.calculator_display || calcBatchRes.results?.[0]?.calculator_display || null;
                        return {
                            success: true,
                            action: "desktop_control",
                            goal,
                            app_name: "calculator",
                            window_title: windowInfo?.title || "Calculator",
                            target_window: calcBatchRes.target_window || windowInfo,
                            calculator_display: disp,
                            status: "completed",
                            final_thought: `Executed "${calcExpr}" directly via Windows UI Automation${disp ? ` (${disp})` : ""}.`,
                            steps_executed: [
                                {
                                    step: 1,
                                    checkpoint_cycle: 1,
                                    action: "uia_calculator_sequence",
                                    target: calcExpr,
                                    method: "uia_direct",
                                    success: true,
                                    duration_ms: calcBatchRes.results?.[0]?.duration_ms || batchBridgeMs,
                                    calculator_display: disp,
                                    outcome: `Calculated ${calcExpr}${disp ? ` -> ${disp}` : ""}`
                                }
                            ],
                            total_steps: 1,
                            checkpoints: [],
                            timings_ms: finalizeTimingBucket(timings, opStart),
                            simulated: false
                        };
                    }
                }
            }

            await fs.promises.mkdir(SCREENSHOT_DIR, { recursive: true });

            const stepHistory = [];
            const checkpointLogs = [];
            let nextCheckpointReason = "app_opened_or_switched";
            let visionModelUsed = null;
            let lastControlModelUsed = null;

            for (let cycle = 1; cycle <= maxCheckpoints; cycle++) {
                if (activeSequenceAbortRequested) {
                    return {
                        success: false,
                        action: "desktop_control",
                        model: visionModelUsed || lastControlModelUsed || null,
                        vision_model: visionModelUsed || null,
                        cancelled: true,
                        status: "cancelled",
                        steps_executed: stepHistory,
                        checkpoints: checkpointLogs,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        error: "desktop_control cancelled by request."
                    };
                }

                const isElectron = isElectronOrCefWindow(windowInfo, profile);

                // 1. Gather fast compact screen state (Windows UIA + Local Windows OCR)
                const compactState = await getCompactScreenState(windowInfo, {
                    includeOcr: isElectron || cycle > 1,
                    maxElements: 75,
                    timings
                });
                if (compactState.active_window) {
                    windowInfo = compactState.active_window;
                }

                const uiaElements = compactState.uia_elements || [];
                const ocrLines = compactState.ocr_lines || [];

                // Only capture and attach a screenshot image when UIA does not expose enough semantic controls
                // (e.g. Electron/CEF apps) OR when recovering from an action failure / visual verification checkpoint!
                const needsVisualImage =
                    isElectron ||
                    uiaElements.length < 6 ||
                    nextCheckpointReason === "action_failed" ||
                    nextCheckpointReason === "depends_on_new_info" ||
                    nextCheckpointReason === "significant_transition";

                let shotRes = null;
                let captureRect = windowInfo?.rect || { x: 0, y: 0, width: 1280, height: 720 };
                let imageSize = { width: captureRect.width, height: captureRect.height };

                if (needsVisualImage) {
                    const stepShotPath = path.join(SCREENSHOT_DIR, "latest_vision.jpg");
                    const cropRect =
                        windowInfo?.rect?.width >= 100 && windowInfo?.rect?.height >= 80
                            ? windowInfo.rect
                            : undefined;

                    const shotStart = Date.now();
                    shotRes = await nativeBridge.send("screenshot", {
                        hwnd: windowInfo?.hwnd || 0,
                        crop_rect: cropRect,
                        max_width: 1280,
                        format: "jpeg",
                        quality: 82,
                        save_path: stepShotPath
                    });
                    timings.screenshot_capture_ms += Date.now() - shotStart;

                    if (shotRes?.success && shotRes.capture_rect) {
                        captureRect = shotRes.capture_rect;
                        imageSize = shotRes.image_size || imageSize;
                    }
                } else {
                    sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
                }

                const uiaContext =
                    uiaElements.length > 0
                        ? `\nWindows UI Automation (UIA) accessible controls (ALWAYS prefer setting "uia_id" and "target" from this list): ${JSON.stringify(
                              uiaElements.slice(0, 45).map((e) => ({
                                  uia_id: e.id,
                                  role: e.role,
                                  name: e.name,
                                  enabled: e.enabled,
                                  state: e.state
                              }))
                          )}`
                        : "";

                const ocrContext =
                    ocrLines.length > 0
                        ? `\nLocal OCR visible text & screen coordinates: ${JSON.stringify(
                              ocrLines.slice(0, 30).map((l) => ({
                                  text: l.text,
                                  pos: [l.x, l.y]
                              }))
                          )}`
                        : "";

                const historyText =
                    stepHistory.length > 0
                        ? `\nActions already executed (DO NOT repeat completed actions):\n${stepHistory
                              .map((s, idx) => `${idx + 1}. ${s.action} on "${s.target || s.text || s.key || ""}" -> ${s.outcome}`)
                              .join("\n")}`
                        : "\nNo actions executed yet.";

                const appHint = profile?.uiHints ? `\nApplication UI Hints: ${profile.uiHints}` : "";

                // Requirement 2 & 5: Separate planning from execution — ask Qwen to generate a batched sequence
                // of actions up to the next checkpoint in a single inference call!
                const plannerPrompt = `You are S.T.R.A.N.G.E., an autonomous desktop automation planner controlling "${windowInfo?.title || appName || "Desktop"}".${appHint}${uiaContext}${ocrContext}${historyText}

User Goal: "${goal}"
Checkpoint Cycle: ${cycle} of ${maxCheckpoints} (Trigger: ${nextCheckpointReason})

Instructions:
1. If the User Goal is ALREADY completely achieved based on the current screen state and executed actions, return "status": "done", "completes_goal": true, "depends_on_new_info": false, and "actions": [].
2. Otherwise, plan the COMPLETE sequence of 1 to 6 sequential desktop actions ("actions": [...]) needed to accomplish the goal right now in a single batch without taking extra screenshots between steps.
   - Example batch 1 (Calculator): [{"action": "left_click", "target": "Clear"}, {"action": "left_click", "target": "Five"}, {"action": "left_click", "target": "Plus"}, {"action": "left_click", "target": "Five"}, {"action": "left_click", "target": "Equals"}]
   - Example batch 2 (Searching): [{"action": "key_press", "key": "ctrl+k"}, {"action": "wait", "duration_ms": 150}, {"action": "type_text", "text": "songs", "press_enter": true}]
3. If your planned sequence finishes the User Goal, you MUST set "completes_goal": true and "depends_on_new_info": false so execution stops immediately after the batch without taking another photo! Only set "depends_on_new_info": true if a new page/dialog must load before you can see what to click next.
4. ALWAYS set "target" (and "uia_id" when matching a UIA control above). Only provide "bbox_2d" if the element is a visual icon missing from both UIA and Local OCR.

Return ONLY valid JSON with this structure:
{
  "thought": "1-sentence observation and plan for this action batch",
  "status": "continue",
  "completes_goal": true,
  "depends_on_new_info": false,
  "actions": [
    {
      "action": "left_click" | "double_click" | "right_click" | "middle_click" | "move_mouse" | "drag_and_drop" | "type_text" | "scroll" | "key_press" | "wait",
      "target": "exact name of UIA/OCR element",
      "uia_id": null,
      "bbox_2d": null,
      "text": "",
      "press_enter": true,
      "clear_first": false,
      "key": "",
      "direction": "down",
      "amount": 5,
      "duration_ms": 120
    }
  ]
}`;

                const llmStart = Date.now();
                const userMsg = {
                    role: "user",
                    content: plannerPrompt
                };
                if (shotRes?.success && shotRes.base64) {
                    userMsg.images = [shotRes.base64];
                }

                const hasVisionImage = Boolean(userMsg.images);
                const selectedCycleModel = hasVisionImage ? getVisionModel() : getMainModel();

                logDesktop(
                    "CONTROL:MODEL",
                    `[MODEL: ${selectedCycleModel}] Running checkpoint ${cycle}/${maxCheckpoints} prompt (vision_image=${hasVisionImage})`
                );

                const response = await ollama.chat({
                    model: selectedCycleModel,
                    think: false,
                    format: "json",
                    options: { temperature: 0 },
                    messages: [userMsg]
                });
                const usedCycleModel = response?.model || selectedCycleModel;
                lastControlModelUsed = usedCycleModel;
                const llmMs = Date.now() - llmStart;
                if (hasVisionImage) {
                    visionModelUsed = usedCycleModel;
                    timings.vision_inference_ms += llmMs;
                    sessionPerformanceStats.vision_inferences_count += 1;
                }

                let plan;
                try {
                    plan = JSON.parse(response.message?.content || "{}");
                } catch {
                    logDesktop("FAIL:CONTROL:JSON", `[MODEL: ${usedCycleModel}] Invalid JSON at checkpoint ${cycle}: ${response.message?.content}`);
                    return {
                        success: false,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        failed_stage: `checkpoint_${cycle}_json_parse`,
                        steps_executed: stepHistory,
                        error: "Planner returned invalid JSON.",
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }

                // Support both batched `actions: [...]` and legacy single `action` format from model
                const planStatus = String(plan.status || plan.action || "continue").toLowerCase();
                let plannedSteps = Array.isArray(plan.actions) ? plan.actions : [];
                if (plannedSteps.length === 0 && plan.action && !["done", "completed", "fail", "failed", "continue"].includes(planStatus)) {
                    plannedSteps = [plan];
                }

                logDesktop(
                    `CONTROL:CHECKPOINT ${cycle}/${maxCheckpoints}`,
                    `[MODEL: ${usedCycleModel}] Status="${planStatus}" | Planned ${plannedSteps.length} action(s) in ${llmMs}ms [reason=${nextCheckpointReason}, with_image=${hasVisionImage}]`,
                    { thought: plan.thought, completes_goal: plan.completes_goal }
                );

                if (planStatus === "done" || planStatus === "completed" || (plannedSteps.length === 0 && plan.completes_goal)) {
                    return {
                        success: true,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        goal,
                        app_name: profile?.id || appName || windowInfo?.process_name || null,
                        window_title: windowInfo?.title || null,
                        target_window: windowInfo,
                        status: "completed",
                        final_thought: plan.thought,
                        steps_executed: stepHistory,
                        total_steps: stepHistory.length,
                        checkpoints: checkpointLogs,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                if (planStatus === "fail" || planStatus === "failed") {
                    return {
                        success: false,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        failed_stage: `checkpoint_${cycle}_model_abort`,
                        goal,
                        steps_executed: stepHistory,
                        checkpoints: checkpointLogs,
                        error: plan.thought || "Planner reported that the goal cannot be completed from current screen.",
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }

                // Convert planned steps into C# execute_action_sequence format.
                // CRITICAL: Always prefer semantic UIA (uia_id / target) and Local OCR over vision bbox_2d!
                const nativeBatch = [];
                for (const rawStep of plannedSteps) {
                    const act = String(rawStep.action || rawStep.type || "").toLowerCase();
                    if (!act || act === "done" || act === "fail") continue;

                    if (!confirmDestructive) {
                        const destructive = detectDestructiveAction(rawStep);
                        if (destructive) {
                            return {
                                success: false,
                                action: "desktop_control",
                                model: visionModelUsed || usedCycleModel,
                                vision_model: visionModelUsed,
                                requires_confirmation: true,
                                destructive_action_detected: true,
                                blocked_action: rawStep,
                                steps_executed: stepHistory,
                                error: destructive.reason,
                                message: `${destructive.reason} Please confirm if you want STRANGE to proceed.`,
                                timings_ms: finalizeTimingBucket(timings, opStart)
                            };
                        }
                    }

                    const nativeStep = {
                        action: act,
                        target: rawStep.target || "",
                        prefer_uia: true,
                        text: rawStep.text || "",
                        press_enter: rawStep.press_enter !== false,
                        clear_first: Boolean(rawStep.clear_first),
                        key: rawStep.key || "",
                        direction: rawStep.direction || rawStep.scroll_direction || "down",
                        amount: Number(rawStep.amount || rawStep.scroll_amount || 5),
                        duration_ms: Number(rawStep.duration_ms || 120)
                    };

                    if (rawStep.uia_id !== null && rawStep.uia_id !== undefined) {
                        const matchedUia = uiaElements.find((u) => u.id === Number(rawStep.uia_id));
                        if (matchedUia) {
                            nativeStep.uia_id = matchedUia.id;
                            if (!nativeStep.target && matchedUia.name) {
                                nativeStep.target = matchedUia.name;
                            }
                        }
                    }

                    // Only attach vision bbox_2d coordinates if no UIA element matched OR as a fallback while keeping prefer_uia = true
                    if (Array.isArray(rawStep.bbox_2d) && rawStep.bbox_2d.length === 4) {
                        const coords = parseVisionCoordinates(
                            { found: true, bbox_2d: rawStep.bbox_2d },
                            captureRect,
                            imageSize,
                            usedCycleModel
                        );
                        if (coords) {
                            nativeStep.x = coords.x;
                            nativeStep.y = coords.y;
                        }
                    }

                    nativeBatch.push(nativeStep);
                }

                if (nativeBatch.length === 0) {
                    break;
                }

                // 3. Execute the entire planned sequence in C# without calling Qwen between actions!
                const batchStart = Date.now();
                const batchRes = await nativeBridge.send("execute_action_sequence", {
                    actions: nativeBatch,
                    expected_hwnd: windowInfo?.hwnd || 0,
                    expected_pid: windowInfo?.pid || 0,
                    stop_on_error: true,
                    stop_on_window_change: true,
                    stop_on_dialog: true,
                    confirm_destructive: confirmDestructive,
                    depends_on_new_info: Boolean(plan.depends_on_new_info),
                    inter_action_delay_ms: 80,
                    capture_state_after: true
                });
                const batchBridgeMs = Date.now() - batchStart;
                mergeNativeTimings(timings, batchRes?.timings_ms, batchBridgeMs);

                sessionPerformanceStats.total_sequences += 1;
                sessionPerformanceStats.total_actions_executed += Number(batchRes?.total_executed || 0);

                for (const r of batchRes?.results || []) {
                    stepHistory.push({
                        step: stepHistory.length + 1,
                        checkpoint_cycle: cycle,
                        model: usedCycleModel,
                        vision_model: hasVisionImage ? usedCycleModel : null,
                        action: r.action,
                        target: r.matched_label || r.target || r.text || r.key || null,
                        method: r.detection_method || (r.uia_pattern ? "uia_pattern" : "native_sequence"),
                        x: r.x ?? null,
                        y: r.y ?? null,
                        success: Boolean(r.success),
                        duration_ms: r.duration_ms,
                        target_window: r.target_window?.title || windowInfo?.title || null,
                        thought: plan.thought,
                        outcome: r.success
                            ? `${r.action} succeeded (${r.duration_ms}ms)`
                            : `${r.action} failed: ${r.error}`
                    });
                }

                const cp = batchRes?.checkpoint || {};
                const evaluatedCp = evaluateVerificationCheckpoint({
                    appOpenedOrSwitched: Boolean(cp.app_switched),
                    windowTitleChanged: Boolean(cp.window_title_changed),
                    changeScore: Number(cp.change_score ?? batchRes?.screen_change?.change_score ?? 0),
                    dialogAppeared: Boolean(batchRes?.dialog_appeared || cp.dialog_appeared),
                    actionFailed: batchRes?.success === false,
                    dependsOnNewInfo: Boolean(plan.depends_on_new_info)
                });

                checkpointLogs.push({
                    cycle,
                    model: usedCycleModel,
                    vision_model: hasVisionImage ? usedCycleModel : null,
                    actions_executed: batchRes?.total_executed || 0,
                    batch_success: Boolean(batchRes?.success),
                    checkpoint: evaluatedCp
                });

                if (batchRes?.requires_confirmation) {
                    return {
                        success: false,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        requires_confirmation: true,
                        destructive_action_detected: true,
                        blocked_action: batchRes.blocked_action,
                        steps_executed: stepHistory,
                        checkpoints: checkpointLogs,
                        error: batchRes.error,
                        message: batchRes.message || batchRes.error,
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }

                if (batchRes?.unexpected_window_change) {
                    return {
                        success: false,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        failed_stage: "unexpected_window_change",
                        unexpected_window_change: true,
                        steps_executed: stepHistory,
                        checkpoints: checkpointLogs,
                        target_window: batchRes.target_window,
                        error: "Stopped execution because the target window unexpectedly changed.",
                        timings_ms: finalizeTimingBucket(timings, opStart)
                    };
                }

                // Requirement 5: If the batch succeeded, completed the goal, and no dialog or failure occurred,
                // skip any redundant post-execution vision inference!
                if (batchRes?.success && plan.completes_goal && !batchRes.dialog_appeared && !plan.depends_on_new_info) {
                    sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
                    return {
                        success: true,
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        goal,
                        app_name: profile?.id || appName || windowInfo?.process_name || null,
                        window_title: batchRes.target_window?.title || windowInfo?.title || null,
                        target_window: batchRes.target_window || windowInfo,
                        status: "completed",
                        final_thought: plan.thought,
                        steps_executed: stepHistory,
                        total_steps: stepHistory.length,
                        checkpoints: checkpointLogs,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                if (!evaluatedCp.should_request_visual_inference) {
                    sessionPerformanceStats.vision_inferences_skipped_by_checkpoint += 1;
                    return {
                        success: Boolean(batchRes?.success),
                        action: "desktop_control",
                        model: visionModelUsed || usedCycleModel,
                        vision_model: visionModelUsed,
                        goal,
                        app_name: profile?.id || appName || windowInfo?.process_name || null,
                        window_title: batchRes.target_window?.title || windowInfo?.title || null,
                        target_window: batchRes.target_window || windowInfo,
                        status: "completed_without_extra_vision_checkpoint",
                        final_thought: plan.thought,
                        steps_executed: stepHistory,
                        total_steps: stepHistory.length,
                        checkpoints: checkpointLogs,
                        timings_ms: finalizeTimingBucket(timings, opStart),
                        simulated: false
                    };
                }

                nextCheckpointReason = evaluatedCp.primary_reason;
                await sleep(250);
            }

            return {
                success: true,
                action: "desktop_control",
                model: visionModelUsed || lastControlModelUsed || null,
                vision_model: visionModelUsed || null,
                goal,
                app_name: profile?.id || appName || windowInfo?.process_name || null,
                window_title: windowInfo?.title || null,
                target_window: windowInfo,
                status: "max_steps_reached",
                steps_executed: stepHistory,
                total_steps: stepHistory.length,
                checkpoints: checkpointLogs,
                timings_ms: finalizeTimingBucket(timings, opStart),
                simulated: false
            };
        }
    );
}
