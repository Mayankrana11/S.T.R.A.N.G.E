
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
