import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always use backend/sandbox, regardless of where Node is launched.
const ROOT = path.resolve(__dirname, "../../sandbox");

console.log("[STRANGE] Sandbox path:", ROOT);
console.log("[STRANGE] Working directory:", process.cwd());
console.log("[STRANGE] Sandbox path:", ROOT);

await fs.mkdir(ROOT, { recursive: true });

function resolveSafePath(relativePath) {
    const resolved = path.resolve(ROOT, relativePath);

    if (
        resolved !== ROOT &&
        !resolved.startsWith(ROOT + path.sep)
    ) {
        throw new Error("Path is outside the sandbox");
    }

    return resolved;
}

export async function searchFiles(args) {
    const directory = resolveSafePath(args.directory);

    const entries = await fs.readdir(directory, {
        withFileTypes: true
    });

    const matches = entries
        .filter(entry =>
            entry.name.toLowerCase().includes(
                args.query.toLowerCase()
            )
        )
        .map(entry => entry.name);

    return {
        success: true,
        matches
    };
}

export async function readFile(args) {
    const filePath = resolveSafePath(args.path);

    const content = await fs.readFile(filePath, "utf8");

    return {
        success: true,
        path: args.path,
        content
    };
}

export async function writeFile(args) {
    const filePath = resolveSafePath(args.path);

    await fs.mkdir(path.dirname(filePath), {
        recursive: true
    });

    await fs.writeFile(
        filePath,
        args.content,
        "utf8"
    );

    return {
        success: true,
        path: args.path,
        bytes_written: Buffer.byteLength(args.content)
    };
}

export async function createDirectory(args) {
    const directory = resolveSafePath(args.path);

    await fs.mkdir(directory, {
        recursive: true
    });

    return {
        success: true,
        path: args.path
    };
}

export async function listDirectory(args) {
    console.log("[STRANGE] list_directory arguments:", args);

    const directory = resolveSafePath(args.path);

    console.log("[STRANGE] Resolved directory:", directory);

    const entries = await fs.readdir(directory);

    console.log("[STRANGE] Actual filesystem entries:", entries);

    return {
        success: true,
        entries
    };
}
