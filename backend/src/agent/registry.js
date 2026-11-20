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
    dragAndDrop,
    scrollDesktop,
    typeText,
    pressKey,
    inspectDesktopUI,
    desktopControl,
    executeActionSequence,
    cancelDesktopSequence
} from "../tools/desktop.js";

const clickSchema = z.object({
    target: z.string().optional(),
    app_name: z.string().optional(),
    role: z.string().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    click_type: z.enum(["single", "double"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    mode: z.enum(["auto", "uia", "ocr", "vision"]).optional(),
    confirm_destructive: z.boolean().optional()
});

const actionStepSchema = z.object({
    action: z.enum([
        "move_mouse",
        "move",
        "click",
        "mouse_click",
        "left_click",
        "right_click",
        "middle_click",
        "double_click",
        "drag_and_drop",
        "drag",
        "mouse_drag",
        "scroll",
        "mouse_scroll",
        "type_text",
        "type",
        "text_input",
        "key_press",
        "press_key",
        "shortcut",
        "wait",
        "sleep",
        "uia_invoke",
        "uia_action",
        "focus_window"
    ]),
    target: z.string().optional(),
    role: z.string().optional(),
    uia_id: z.number().optional(),
    automation_id: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    from_x: z.number().optional(),
    from_y: z.number().optional(),
    to_x: z.number().optional(),
    to_y: z.number().optional(),
    from_target: z.string().optional(),
    to_target: z.string().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    click_type: z.enum(["single", "double"]).optional(),
    direction: z.enum(["up", "down", "left", "right"]).optional(),
    amount: z.number().optional(),
    text: z.string().optional(),
    clear_first: z.boolean().optional(),
    press_enter: z.boolean().optional(),
    key: z.string().optional(),
    modifiers: z.array(z.string()).optional(),
    duration_ms: z.number().optional(),
    wait_after_ms: z.number().optional(),
    smooth: z.boolean().optional()
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
        schema: z.object({}),
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
            app_name: z.string().optional(),
            include_ocr: z.boolean().optional()
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

    execute_action_sequence: {
        description: "Execute a batched sequence of desktop actions (mouse movement, left/right/middle clicks, double clicks, drag and drop, scrolling, text input, key presses/shortcuts, and configurable waits) sequentially in the C# desktop service without requesting LLM inference between actions.",
        schema: z.object({
            app_name: z.string().optional(),
            actions: z.array(actionStepSchema).min(1),
            stop_on_error: z.boolean().optional(),
            stop_on_window_change: z.boolean().optional(),
            stop_on_dialog: z.boolean().optional(),
            confirm_destructive: z.boolean().optional(),
            depends_on_new_info: z.boolean().optional(),
            inter_action_delay_ms: z.number().optional()
        }),
        execute: executeActionSequence
    },

    cancel_action_sequence: {
        description: "Cancel a currently running desktop action sequence and release all mouse buttons and keyboard modifiers.",
        schema: z.object({
            reason: z.string().optional()
        }),
        execute: cancelDesktopSequence
    },

    desktop_click: {
        description: "Click a UI element, button, playlist, link, or coordinate inside an application window or on the desktop. Supports left, right, middle, and double click. Prefers semantic Windows UI Automation first.",
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

    desktop_drag: {
        description: "Drag and drop from start coordinates/target to end coordinates/target.",
        schema: z.object({
            from_x: z.number().optional(),
            from_y: z.number().optional(),
            to_x: z.number().optional(),
            to_y: z.number().optional(),
            from_target: z.string().optional(),
            to_target: z.string().optional(),
            app_name: z.string().optional(),
            button: z.enum(["left", "right", "middle"]).optional(),
            duration_ms: z.number().optional()
        }),
        execute: dragAndDrop
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
            clear_first: z.boolean().optional(),
            confirm_destructive: z.boolean().optional()
        }),
        execute: typeText
    },

    desktop_press_key: {
        description: "Press a keyboard key or shortcut combination (e.g. 'Enter', 'Space', 'Escape', 'ctrl+l', 'ctrl+k').",
        schema: z.object({
            key: z.string(),
            modifiers: z.array(z.string()).optional(),
            app_name: z.string().optional(),
            confirm_destructive: z.boolean().optional()
        }),
        execute: pressKey
    },

    desktop_inspect: {
        description: "Inspect the visible UI elements and compact screen state of an application window using Windows UI Automation, local OCR, and optional Qwen vision.",
        schema: z.object({
            app_name: z.string().optional(),
            question: z.string().optional(),
            use_vision: z.boolean().optional()
        }),
        execute: inspectDesktopUI
    },

    desktop_control: {
        description: "Autonomously execute a multi-step in-application UI task using batched action planning, Windows UI Automation, local OCR, and checkpoint-based Qwen vision verification.",
        schema: z.object({
            goal: z.string(),
            app_name: z.string().optional(),
            max_steps: z.number().optional(),
            confirm_destructive: z.boolean().optional()
        }),
        execute: desktopControl
    }
};

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
            name: "execute_action_sequence",
            description: "Execute a batched sequence of desktop actions (mouse movement, left/right/middle clicks, double clicks, drag and drop, scrolling, text input, key presses/shortcuts, and configurable waits) sequentially in a single tool call without waiting for LLM inference between actions.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string",
                        description: "Optional application name to focus and lock onto (e.g. 'spotify', 'steam', 'chrome', 'notepad', 'calculator')."
                    },
                    actions: {
                        type: "array",
                        description: "Ordered list of desktop actions to execute sequentially.",
                        items: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: [
                                        "move_mouse",
                                        "left_click",
                                        "right_click",
                                        "middle_click",
                                        "double_click",
                                        "drag_and_drop",
                                        "scroll",
                                        "type_text",
                                        "key_press",
                                        "wait",
                                        "uia_invoke"
                                    ],
                                    description: "Action type to perform."
                                },
                                target: {
                                    type: "string",
                                    description: "Semantic UI element name/label for UIA or OCR lookup (e.g. 'Play', 'Shuffle', 'Search', 'songs')."
                                },
                                x: {
                                    type: "number",
                                    description: "Optional X screen coordinate."
                                },
                                y: {
                                    type: "number",
                                    description: "Optional Y screen coordinate."
                                },
                                from_x: {
                                    type: "number",
                                    description: "Start X coordinate for drag_and_drop."
                                },
                                from_y: {
                                    type: "number",
                                    description: "Start Y coordinate for drag_and_drop."
                                },
                                to_x: {
                                    type: "number",
                                    description: "End X coordinate for drag_and_drop."
                                },
                                to_y: {
                                    type: "number",
                                    description: "End Y coordinate for drag_and_drop."
                                },
                                button: {
                                    type: "string",
                                    enum: ["left", "right", "middle"]
                                },
                                direction: {
                                    type: "string",
                                    enum: ["up", "down", "left", "right"]
                                },
                                amount: {
                                    type: "number",
                                    description: "Scroll wheel notches."
                                },
                                text: {
                                    type: "string",
                                    description: "Text to type for type_text."
                                },
                                press_enter: {
                                    type: "boolean",
                                    description: "Whether to press Enter after typing."
                                },
                                clear_first: {
                                    type: "boolean",
                                    description: "Whether to clear existing text before typing."
                                },
                                key: {
                                    type: "string",
                                    description: "Key name or shortcut combo for key_press (e.g. 'Enter', 'Space', 'ctrl+k', 'ctrl+l')."
                                },
                                duration_ms: {
                                    type: "number",
                                    description: "Wait duration in milliseconds for 'wait' or movement duration."
                                }
                            },
                            required: ["action"]
                        }
                    },
                    stop_on_window_change: {
                        type: "boolean",
                        description: "Stop execution if the target window unexpectedly changes (default true)."
                    },
                    confirm_destructive: {
                        type: "boolean",
                        description: "Set true only after the user has explicitly confirmed a destructive action."
                    },
                    depends_on_new_info: {
                        type: "boolean",
                        description: "Set true if a checkpoint verification is needed after this sequence completes."
                    }
                },
                required: ["actions"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_click",
            description: "Click a UI element, button, playlist, video, link, or coordinate inside an application window. Supports left click, right click, middle click, and double click. Uses Windows UI Automation first, then local OCR, and Qwen vision as fallback.",
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
                        enum: ["left", "right", "middle"],
                        description: "Mouse button: 'left' (default), 'right', or 'middle'."
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
                        description: "Optional input field or search box to focus/click before typing (e.g. 'Search bar', 'Store search')."
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
            description: "Visually inspect an application window or the desktop screen using Qwen vision ONLY when the user explicitly asks to inspect the screen or asks what is visible on screen. NEVER call this tool for greetings, general conversation, or before other desktop actions.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string",
                        description: "Optional application name to focus and inspect."
                    },
                    question: {
                        type: "string",
                        description: "The visual question about what is currently visible on the screen."
                    }
                },
                required: ["question"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "desktop_control",
            description: "Perform multi-step in-application UI control using batched action execution, Windows UI Automation, local OCR, and checkpoint-based Qwen vision verification.",
            parameters: {
                type: "object",
                properties: {
                    goal: {
                        type: "string",
                        description: "Detailed in-application goal to execute (e.g. 'go to playlists, select songs, click shuffle, and click play')."
                    },
                    app_name: {
                        type: "string",
                        description: "Target application name (e.g. 'spotify', 'steam', 'chrome')."
                    },
                    max_steps: {
                        type: "number",
                        description: "Maximum verification checkpoints (default 5)."
                    }
                },
                required: ["goal"]
            }
        }
    }
];
