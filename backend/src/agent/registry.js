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

import {
    desktopClick,
    leftClick,
    rightClick,
    doubleClick,
    moveMouse,
    scrollDesktop,
    typeText,
    pressKey,
    inspectDesktopUI,
    desktopControl
} from "../tools/desktop.js";

const clickSchema = z.object({
    target: z.string().optional(),
    app_name: z.string().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    click_type: z.enum(["single", "double"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    mode: z.enum(["auto", "uia", "vision"]).optional()
});

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
        schema: z.object({
            // no required parameters
        }),
        execute: getSystemStats
    },

    get_running_processes: {
        description: "List currently running processes.",
        schema: z.object({}),
        execute: getRunningProcesses
    },

    take_screenshot: {
        description: "Capture the current desktop or application window screenshot.",
        schema: z.object({
            app_name: z.string().optional()
        }),
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
    },

    desktop_click: {
        description: "Click a UI element, button, playlist, link, or coordinate inside an application window or on the desktop. Supports left click, right click, and double left click.",
        schema: clickSchema,
        execute: desktopClick
    },

    left_click: {
        description: "Left click a UI element or screen coordinate.",
        schema: clickSchema,
        execute: leftClick
    },

    right_click: {
        description: "Right click a UI element or screen coordinate.",
        schema: clickSchema,
        execute: rightClick
    },

    double_click: {
        description: "Double left click a UI element or screen coordinate.",
        schema: clickSchema,
        execute: doubleClick
    },

    move_mouse: {
        description: "Smoothly move the mouse cursor to (x, y) screen coordinates.",
        schema: z.object({
            x: z.number(),
            y: z.number(),
            smooth: z.boolean().optional(),
            duration_ms: z.number().optional()
        }),
        execute: moveMouse
    },

    desktop_scroll: {
        description: "Scroll up, down, left, or right inside an application window or on the desktop.",
        schema: z.object({
            direction: z.enum(["up", "down", "left", "right"]),
            amount: z.number().optional(),
            app_name: z.string().optional(),
            target: z.string().optional(),
            x: z.number().optional(),
            y: z.number().optional()
        }),
        execute: scrollDesktop
    },

    desktop_type: {
        description: "Type text into a search bar, input field, or active application window.",
        schema: z.object({
            text: z.string(),
            target: z.string().optional(),
            app_name: z.string().optional(),
            press_enter: z.boolean().optional(),
            clear_first: z.boolean().optional()
        }),
        execute: typeText
    },

    desktop_press_key: {
        description: "Press a keyboard key or shortcut combination (e.g. 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k').",
        schema: z.object({
            key: z.string(),
            modifiers: z.array(z.string()).optional(),
            app_name: z.string().optional()
        }),
        execute: pressKey
    },

    desktop_inspect: {
        description: "Inspect the visible UI elements and state of an application window or the desktop using Windows UI Automation and Qwen vision.",
        schema: z.object({
            app_name: z.string().optional(),
            question: z.string().optional()
        }),
        execute: inspectDesktopUI
    },

    desktop_control: {
        description: "Autonomously execute a multi-step in-application UI task sequentially using Windows UI Automation and Qwen vision screenshot guidance.",
        schema: z.object({
            goal: z.string(),
            app_name: z.string().optional(),
            max_steps: z.number().optional()
        }),
        execute: desktopControl
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
    },
    {
        type: "function",
        function: {
            name: "desktop_click",
            description: "Click a UI element, button, playlist, video, link, or coordinate inside an application window. Supports left click, right click, and double click. Uses Windows UI Automation first where available and Qwen vision screenshot analysis as fallback.",
            parameters: {
                type: "object",
                properties: {
                    target: {
                        type: "string",
                        description: "Natural language description of the button, playlist, link, or UI element to click (e.g. 'songs playlist', 'Shuffle button', 'Play button', 'Install button', 'Latest video')."
                    },
                    app_name: {
                        type: "string",
                        description: "Application name to focus and click inside (e.g. 'spotify', 'steam', 'chrome', 'notepad')."
                    },
                    button: {
                        type: "string",
                        enum: ["left", "right"],
                        description: "Mouse button: 'left' (default) or 'right'."
                    },
                    click_type: {
                        type: "string",
                        enum: ["single", "double"],
                        description: "'single' (default) or 'double' for double-left-click."
                    },
                    x: {
                        type: "number",
                        description: "Optional explicit X screen coordinate."
                    },
                    y: {
                        type: "number",
                        description: "Optional explicit Y screen coordinate."
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_scroll",
            description: "Scroll up, down, left, or right inside an application window.",
            parameters: {
                type: "object",
                properties: {
                    direction: {
                        type: "string",
                        enum: ["up", "down", "left", "right"],
                        description: "Scroll direction."
                    },
                    amount: {
                        type: "number",
                        description: "Number of scroll wheel notches (default 5)."
                    },
                    app_name: {
                        type: "string",
                        description: "Optional application name to focus before scrolling."
                    },
                    target: {
                        type: "string",
                        description: "Optional UI area to hover over before scrolling."
                    }
                },
                required: ["direction"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_type",
            description: "Type text into a search bar, input field, or active window inside an application.",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "The text to type."
                    },
                    target: {
                        type: "string",
                        description: "Optional input field or search box to click before typing (e.g. 'Search bar', 'Store search')."
                    },
                    app_name: {
                        type: "string",
                        description: "Optional application name (e.g. 'spotify', 'steam', 'chrome')."
                    },
                    press_enter: {
                        type: "boolean",
                        description: "Whether to press Enter after typing (default true for searches)."
                    },
                    clear_first: {
                        type: "boolean",
                        description: "Whether to select all and clear existing text before typing."
                    }
                },
                required: ["text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_press_key",
            description: "Press a keyboard key or shortcut combination inside an application (such as 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k').",
            parameters: {
                type: "object",
                properties: {
                    key: {
                        type: "string",
                        description: "Key name or shortcut combo (e.g. 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k')."
                    },
                    app_name: {
                        type: "string",
                        description: "Optional application to focus first."
                    }
                },
                required: ["key"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_inspect",
            description: "Inspect the current application window using Windows UI Automation and Qwen vision screenshot analysis to see what buttons, playlists, or elements are on screen.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string",
                        description: "Optional application name to focus and inspect."
                    },
                    question: {
                        type: "string",
                        description: "What to look for on the screen."
                    }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_control",
            description: "Perform multi-step in-application UI control sequentially using Windows UI Automation and Qwen vision screenshots (use after opening an app when multiple UI interactions are needed, e.g. selecting a playlist and clicking shuffle and play in Spotify, downloading a game in Steam, or opening the latest video/short on a YouTube channel).",
            parameters: {
                type: "object",
                properties: {
                    goal: {
                        type: "string",
                        description: "Detailed in-application goal to execute step-by-step (e.g. 'go to playlists, select songs, click shuffle, and click play')."
                    },
                    app_name: {
                        type: "string",
                        description: "Target application name (e.g. 'spotify', 'steam', 'chrome')."
                    },
                    max_steps: {
                        type: "number",
                        description: "Maximum sequential steps (default 8)."
                    }
                },
                required: ["goal"]
            }
        }
    }
];
