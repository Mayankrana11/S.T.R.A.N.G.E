
import { toolRegistry } from "./registry.js";

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

    console.log("[STRANGE] Normalized tool args:", args);
    const validation = tool.schema.safeParse(args);

    if (!validation.success) {
        return {
            success: false,
            error: "Invalid arguments",
            details: validation.error.issues
        };
    }

    try {
        const result = await tool.execute(validation.data);

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
