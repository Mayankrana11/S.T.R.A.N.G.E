
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runPowerShell(script) {
    const { stdout } = await execFileAsync(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script
        ],
        {
            windowsHide: true,
            timeout: 15000,
            maxBuffer: 1024 * 1024
        }
    );

    return stdout.trim();
}

function parseJsonOutput(output) {
    if (!output) {
        return null;
    }

    return JSON.parse(output);
}

export async function getSystemStats() {
    try {
        const script = `
$cpu = Get-CimInstance Win32_Processor |
    Measure-Object -Property LoadPercentage -Average

$os = Get-CimInstance Win32_OperatingSystem

$totalMemory = [double]$os.TotalVisibleMemorySize
$freeMemory = [double]$os.FreePhysicalMemory

$usedMemory = $totalMemory - $freeMemory

$memoryPercent = if ($totalMemory -gt 0) {
    [math]::Round(($usedMemory / $totalMemory) * 100, 2)
} else {
    $null
}

$result = @{
    cpu_usage_percent = [math]::Round($cpu.Average, 2)
    memory_usage_percent = $memoryPercent
    total_memory_mb = [math]::Round($totalMemory / 1024, 2)
    used_memory_mb = [math]::Round($usedMemory / 1024, 2)
    free_memory_mb = [math]::Round($freeMemory / 1024, 2)
}

$result | ConvertTo-Json -Compress
`;

        const output = await runPowerShell(script);
        const stats = parseJsonOutput(output);

        if (!stats) {
            throw new Error("PowerShell returned empty system statistics");
        }

        return {
            success: true,
            ...stats,
            gpu_usage_percent: null,
            gpu_usage_available: false,
            simulated: false
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to retrieve system statistics: ${error.message}`,
            simulated: false
        };
    }
}

export async function getRunningProcesses() {
    try {
        const script = `
Get-Process |
    Select-Object ProcessName, Id, CPU, WorkingSet64 |
    ConvertTo-Json -Compress
`;

        const output = await runPowerShell(script);
        const parsed = parseJsonOutput(output);

        const processes = parsed === null
            ? []
            : Array.isArray(parsed)
                ? parsed
                : [parsed];

        return {
            success: true,
            processes: processes.map(process => ({
                name: process.ProcessName,
                pid: process.Id,
                cpu_seconds: process.CPU,
                memory_mb: process.WorkingSet64 === null
                    ? null
                    : Math.round(process.WorkingSet64 / 1024 / 1024 * 100) / 100
            })),
            simulated: false
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to retrieve running processes: ${error.message}`,
            simulated: false
        };
    }
}

export async function takeScreenshot() {
    return {
        success: false,
        screenshot_available: false,
        simulated: false,
        message: "Screenshot capture has not been implemented yet."
    };
}
