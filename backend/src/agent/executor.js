import { toolRegistry } from "./registry.js";
import { resolveApplication } from "../tools/applications.js";
import { recordActiveApplicationContext } from "../tools/desktop.js";

const DESKTOP_APP_TOOLS = new Set([
    "desktop_click",
    "left_click",
    "right_click",
    "double_click",
    "desktop_scroll",
    "desktop_type",
    "desktop_press_key",
    "desktop_inspect",
    "desktop_control",
    "take_screenshot"
]);

export async function executeTool(toolCall) {
    const name = toolCall.function?.name;
    let args = toolCall.function?.arguments;

    if (typeof args === "string") {
        try {
            args = JSON.parse(args);
        } catch {
            return {
                success: false,
                error: "Arguments were not valid JSON"
            };
        }
    }

    const tool = toolRegistry[name];

    if (!tool) {
        return {
            success: false,
            error: `Unknown tool: ${name}`
        };
    }

    function normalizeFilesystemPath(toolName, args) {
        const filesystemTools = new Set([
            "list_directory",
            "read_file",
            "write_file",
            "create_directory",
        ]);

        if (
            !filesystemTools.has(toolName) ||
            typeof args?.path !== "string"
        ) {
            return args;
        }

        let normalizedPath = args.path.trim().replace(/\\/g, "/");

        // The sandbox is already the root directory.
        if (normalizedPath.toLowerCase() === "sandbox") {
            normalizedPath = ".";
        }

        // Remove redundant sandbox/ prefixes.
        while (normalizedPath.toLowerCase().startsWith("sandbox/")) {
            normalizedPath = normalizedPath.slice("sandbox/".length);
        }

        if (!normalizedPath) {
            normalizedPath = ".";
        }

        return {
            ...args,
            path: normalizedPath,
        };
    }

    // Normalize filesystem paths before schema validation.
    args = normalizeFilesystemPath(name, args);

    let appResolution = null;
    if (
        (name === "open_application" || name === "close_application") &&
        typeof args?.app_name === "string"
    ) {
        appResolution = resolveApplication(args.app_name);
        if (appResolution.status === "resolved") {
            args = {
                ...args,
                app_name: appResolution.canonical_id
            };
        }
    } else if (
        DESKTOP_APP_TOOLS.has(name) &&
        typeof args?.app_name === "string" &&
        args.app_name.trim()
    ) {
        const desktopAppRes = resolveApplication(args.app_name);
        if (desktopAppRes.status === "resolved") {
            args = {
                ...args,
                app_name: desktopAppRes.canonical_id
            };
        }
    }

    console.log(`[STRANGE] Executing tool "${name}" with args:`, args);
    const validation = tool.schema.safeParse(args);

    if (!validation.success) {
        console.error(`[STRANGE] [FAIL:VALIDATION] Tool "${name}" invalid arguments:`, validation.error.issues);
        return {
            success: false,
            error: "Invalid arguments",
            details: validation.error.issues
        };
    }

    if (name === "open_application" || name === "close_application") {
        const resolution =
            appResolution ?? resolveApplication(validation.data.app_name);

        if (resolution.status !== "resolved") {
            return {
                success: false,
                tool: name,
                status: resolution.status,
                requires_clarification: true,
                error: resolution.message,
                message: resolution.message,
                candidates: resolution.candidates,
                confidence: resolution.confidence
            };
        }
    }

    try {
        const result = await tool.execute(validation.data);

        if (name === "open_application" && result?.success && result?.canonical_id) {
            recordActiveApplicationContext(result.canonical_id);
        }

        if (result && result.requires_clarification) {
            return {
                success: false,
                tool: name,
                status: result.status,
                requires_clarification: true,
                error: result.error || result.message,
                message: result.message,
                candidates: result.candidates,
                confidence: result.confidence,
                result
            };
        }

        if (result && result.success === false) {
            console.error(
                `[STRANGE] [FAIL:TOOL] Tool "${name}" failed:`,
                result.error || result.message
            );
            return {
                success: false,
                tool: name,
                error: result.error || result.message,
                result
            };
        }

        return {
            success: true,
            tool: name,
            result
        };
    } catch (error) {
        console.error(`[STRANGE] [FAIL:EXCEPTION] Tool "${name}" threw error:`, error.message);
        return {
            success: false,
            tool: name,
            error: error.message
        };
    }
}
