
import { toolRegistry } from "./registry.js";
import { resolveApplication } from "../tools/applications.js";

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
        name === "open_application" &&
        typeof args?.app_name === "string"
    ) {
        appResolution = resolveApplication(args.app_name);
        if (appResolution.status === "resolved") {
            args = {
                ...args,
                app_name: appResolution.canonical_id
            };
        }
    }

    console.log("[STRANGE] Normalized tool args:", args);
    const validation = tool.schema.safeParse(args);

    if (!validation.success) {
        return {
            success: false,
            error: "Invalid arguments",
            details: validation.error.issues
        };
    }

    if (name === "open_application") {
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

        return {
            success: true,
            tool: name,
            result
        };
    } catch (error) {
        return {
            success: false,
            tool: name,
            error: error.message
        };
    }
}
