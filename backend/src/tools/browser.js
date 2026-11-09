import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { recordActiveApplicationContext } from "./desktop.js";

const LOCALAPPDATA = process.env.LOCALAPPDATA || "";
const PROGRAM_FILES = process.env.ProgramFiles || "C:\\Program Files";
const PROGRAM_FILES_X86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

function findChromeExecutable() {
    const candidates = [
        path.join(PROGRAM_FILES, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(PROGRAM_FILES_X86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
    ];

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch {
            // ignore
        }
    }

    return null;
}

function normalizeUrl(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return "https://www.google.com";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function launchUrlInBrowser(url) {
    return new Promise((resolve) => {
        const chromeExe = findChromeExecutable();

        if (chromeExe) {
            const child = spawn(chromeExe, ["--force-renderer-accessibility", url], {
                detached: true,
                stdio: "ignore",
                windowsHide: false
            });

            child.once("spawn", () => {
                child.unref();
                recordActiveApplicationContext("chrome");
                setTimeout(() => {
                    resolve({
                        success: true,
                        browser: "chrome",
                        executable: chromeExe,
                        url,
                        simulated: false
                    });
                }, 1200);
            });

            child.once("error", (err) => {
                resolve({
                    success: false,
                    url,
                    error: err.message,
                    simulated: false
                });
            });
            return;
        }

        // Fallback to Windows shell URL handler
        const child = spawn("cmd.exe", ["/c", "start", "", url], {
            detached: true,
            stdio: "ignore",
            windowsHide: true
        });

        child.once("spawn", () => {
            child.unref();
            recordActiveApplicationContext("chrome");
            setTimeout(() => {
                resolve({
                    success: true,
                    browser: "default",
                    url,
                    simulated: false
                });
            }, 1200);
        });

        child.once("error", (err) => {
            resolve({
                success: false,
                url,
                error: err.message,
                simulated: false
            });
        });
    });
}

export async function browserNavigate(args) {
    const url = normalizeUrl(args?.url);
    const res = await launchUrlInBrowser(url);
    return {
        ...res,
        action: "navigate"
    };
}

export async function browserSearch(args) {
    const query = String(args?.query || "").trim();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const res = await launchUrlInBrowser(searchUrl);
    return {
        ...res,
        action: "search",
        query
    };
}
