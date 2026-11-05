
export async function openApplication(args) {
    const apps = {
        "visual studio code": "code",
        "vscode": "code",
        "notepad": "notepad",
        "calculator": "calc",
        "paint": "mspaint"
    };

    const key = args.app_name.toLowerCase();

    const executable = apps[key];

    if (!executable) {
        return {
            success: false,
            error: "Application is not in the allowlist"
        };
    }

    // Evaluation mode: do not launch actual Windows applications.
    return {
        success: true,
        action: "open_application",
        application: args.app_name,
        simulated: true
    };
}

export async function closeApplication(args) {
    return {
        success: true,
        action: "close_application",
        application: args.app_name,
        simulated: true
    };
}

export async function listApplications() {
    return {
        applications: [
            "Visual Studio Code",
            "Notepad",
            "Calculator",
            "Paint"
        ]
    };
}
