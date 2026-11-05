
import { z } from "zod";

import {
    openApplication,
    closeApplication,
    listApplications
} from "../tools/applications.js";

import {
    searchFiles,
    readFile,
    writeFile,
    createDirectory,
    listDirectory
} from "../tools/filesystem.js";

import {
    getSystemStats,
    getRunningProcesses,
    takeScreenshot
} from "../tools/system.js";

import {
    browserNavigate,
    browserSearch
} from "../tools/browser.js";

export const toolRegistry = {
    open_application: {
        description: "Open a Windows application by name.",
        schema: z.object({
            app_name: z.string()
        }),
        execute: openApplication
    },

    close_application: {
        description: "Close a Windows application by name.",
        schema: z.object({
            app_name: z.string()
        }),
        execute: closeApplication
    },

    list_applications: {
        description: "List applications available to the assistant.",
        schema: z.object({}),
        execute: listApplications
    },

    search_files: {
        description: "Search for files by name in a directory.",
        schema: z.object({
            directory: z.string(),
            query: z.string()
        }),
        execute: searchFiles
    },

    read_file: {
        description: "Read a file inside the sandbox. IMPORTANT: The sandbox root is already provided automatically. Paths must be relative to that root. Never prefix paths with 'sandbox/'. Example: use 'strange_test.txt', not 'sandbox/strange_test.txt'.",
        schema: z.object({
            path: z.string()
        }),
        execute: readFile
    },

    write_file: {
        description: "Create or overwrite a text file inside the sandbox. IMPORTANT: Paths are relative to the sandbox root. Never prefix paths with 'sandbox/'. Example: use 'hello.txt', not 'sandbox/hello.txt'.",
        schema: z.object({
            path: z.string(),
            content: z.string()
        }),
        execute: writeFile
    },

    create_directory: {
        description: "Create a directory inside the sandbox. IMPORTANT: Paths are relative to the sandbox root. Never prefix paths with 'sandbox/'. Example: use 'evaluation_test', not 'sandbox/evaluation_test'.",
        schema: z.object({
            path: z.string()
        }),
        execute: createDirectory
    },

    list_directory: {
        description: "List files and directories inside the sandbox. IMPORTANT: All paths are relative to the sandbox root. Use '.' for the sandbox root. Never prefix paths with 'sandbox/'. Example: use 'notes.txt', not 'sandbox/notes.txt'.",
        schema: z.object({
            path: z.string()
        }),
        execute: listDirectory
    },

    get_system_stats: {
        description: "Get CPU, memory and GPU usage.",
        schema: z.object({}),
        execute: getSystemStats
    },

    get_running_processes: {
        description: "List currently running processes.",
        schema: z.object({}),
        execute: getRunningProcesses
    },

    take_screenshot: {
        description: "Capture the current desktop screenshot.",
        schema: z.object({}),
        execute: takeScreenshot
    },

    browser_navigate: {
        description: "Navigate the browser to a URL.",
        schema: z.object({
            url: z.string()
        }),
        execute: browserNavigate
    },

    browser_search: {
        description: "Search the web using a browser.",
        schema: z.object({
            query: z.string()
        }),
        execute: browserSearch
    }
};

function zodToJsonSchema(schema) {
    // For this starter registry, we use explicit JSON schemas
    // below. This helper is intentionally not implemented.
    // Keep validation and model-facing schemas separate.
    throw new Error("Use the explicit toolSchemas below");
}

export const toolSchemas = [
    {
        type: "function",
        function: {
            name: "open_application",
            description: "Open a Windows application by name.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string"
                    }
                },
                required: ["app_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "close_application",
            description: "Close a Windows application by name.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string"
                    }
                },
                required: ["app_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_applications",
            description: "List available applications.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_files",
            description: "Search filenames inside a directory.",
            parameters: {
                type: "object",
                properties: {
                    directory: {
                        type: "string"
                    },
                    query: {
                        type: "string"
                    }
                },
                required: ["directory", "query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read a text file.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Create or overwrite a text file.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string"
                    },
                    content: {
                        type: "string"
                    }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_directory",
            description: "Create a directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_directory",
            description: "List directory contents.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string"
                    }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_system_stats",
            description: "Get CPU, RAM and GPU usage.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_running_processes",
            description: "List running processes.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "take_screenshot",
            description: "Capture the current desktop screenshot.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_navigate",
            description: "Navigate to a URL.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string"
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_search",
            description: "Search the web.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string"
                    }
                },
                required: ["query"]
            }
        }
    }
];
