<div align="center">

# S.T.R.A.N.G.E.
### Smart Task Reasoning and Autonomous Navigation for General Execution

<p>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/C%23-.NET_Framework-239120?style=for-the-badge&logo=csharp&logoColor=white" alt="C# .NET" />
  <img src="https://img.shields.io/badge/Windows_API-Win32_%26_UIA-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows UI Automation" />
  <img src="https://img.shields.io/badge/Ollama-Local_LLM-000000?style=for-the-badge" alt="Ollama" />
  <img src="https://img.shields.io/badge/Qwen_3.5_4B-Tool_Reasoning-4A154B?style=for-the-badge" alt="Qwen 3.5 4B" />
  <img src="https://img.shields.io/badge/Qwen_2.5_VL_3B-Vision_Grounding-1E3A8A?style=for-the-badge" alt="Qwen 2.5 VL 3B" />
  <img src="https://img.shields.io/badge/Zod-Schema_Validation-3E67B1?style=for-the-badge&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/PowerShell-5391FE?style=for-the-badge&logo=powershell&logoColor=white" alt="PowerShell" />
</p>

<table>
  <thead>
    <tr>
      <th>Layer</th>
      <th>Technology</th>
      <th>Role in S.T.R.A.N.G.E.</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Agent Runtime &amp; API</strong></td>
      <td>Node.js (ES Modules), Express 5</td>
      <td>HTTP REST server (<code>/chat</code>), sequential tool executor, and interactive CLI client</td>
    </tr>
    <tr>
      <td><strong>Reasoning Model</strong></td>
      <td>Ollama (<code>qwen3.5:4b</code>)</td>
      <td>Local tool selection, argument generation, and batched action sequence planning</td>
    </tr>
    <tr>
      <td><strong>Vision Grounding Model</strong></td>
      <td>Ollama (<code>qwen2.5vl:3b</code>)</td>
      <td>Pixel-space 2D bounding-box localization for custom canvas and Electron/CEF controls</td>
    </tr>
    <tr>
      <td><strong>Native Desktop Service</strong></td>
      <td>C# (.NET Framework 4.0, Win32 P/Invoke)</td>
      <td>Persistent JSON-over-stdio native bridge for low-latency input injection and window management</td>
    </tr>
    <tr>
      <td><strong>Semantic Accessibility</strong></td>
      <td>Microsoft Windows UI Automation (UIA)</td>
      <td>Direct control enumeration and pattern invocation (<code>Invoke</code>, <code>Value</code>, <code>Toggle</code>, <code>SelectionItem</code>)</td>
    </tr>
    <tr>
      <td><strong>Local Screen OCR</strong></td>
      <td>Windows Runtime OCR (<code>Windows.Media.Ocr</code>)</td>
      <td>Sub-50ms on-device text extraction and coordinate resolution without LLM overhead</td>
    </tr>
    <tr>
      <td><strong>Validation &amp; Telemetry</strong></td>
      <td>Zod, PowerShell CIM / WMI</td>
      <td>Strict tool argument validation, system resource monitoring, and per-stage execution timing</td>
    </tr>
  </tbody>
</table>

</div>

---

## Introduction

**S.T.R.A.N.G.E.** (**Smart Task Reasoning and Autonomous Navigation for General Execution**) is a local-first autonomous desktop assistant and execution engine for Microsoft Windows. It combines local Large Language Models (LLMs) and Vision-Language Models (VLMs) served via Ollama with a native C# Windows automation engine to control applications, manage sandboxed files, inspect system telemetry, and execute complex multi-step UI workflows.

Rather than relying on slow, error-prone vision inference after every individual mouse movement or keystroke, S.T.R.A.N.G.E. separates high-level planning from low-level execution. It prioritizes deterministic Microsoft Windows UI Automation (UIA) and local WinRT Optical Character Recognition (OCR), falling back to single-pass visual grounding only at meaningful state checkpoints.

---

## Key Capabilities and Architecture Implemented

### 1. Batched Desktop Action Execution (`execute_action_sequence`)
- Executes ordered sequences of desktop primitives in a single tool call through the persistent C# native service (`StrangeDesktopNative.exe --server`) without requesting LLM inference between steps.
- Supports smooth cursor movement, left/right/middle clicks, double clicks, drag-and-drop, four-directional mouse wheel scrolling, text input, virtual key presses, keyboard shortcuts, direct UIA control invocation, and configurable waits.
- Automatically coalesces consecutive primitive tool calls emitted by the language model into a single batched native execution sequence.

### 2. Three-Tier UI Grounding Pipeline (UIA First, Local OCR Second, Vision Third)
- **Tier 1 — Windows UI Automation (UIA):** Walks the active window's accessibility tree (up to 360 controls per window) to read control names, roles, automation IDs, enabled states, values, and bounding rectangles. Directly invokes controls via `InvokePattern`, `ValuePattern`, `TogglePattern`, `SelectionItemPattern`, and `ExpandCollapsePattern` (including canonical symbol and digit mapping and direct UIA expression execution for Windows Calculator).
- **Tier 2 — Local Windows Runtime OCR:** Uses `Windows.Media.Ocr.OcrEngine` via reflection to extract visible screen text and word/line bounding boxes locally in ~35ms with zero LLM inference cost.
- **Tier 3 — Batched Vision Grounding (`qwen2.5vl:3b`):** When targeting unlabelled custom icons in Electron/CEF applications that are absent from both UIA and Local OCR, captures a single cropped window screenshot and resolves all unresolved targets in one vision pass with automatic pixel-space and normalized coordinate scaling.

### 3. Checkpoint-Based Verification and Screenshot Optimization
- Captures only the active target window region rather than the entire multi-monitor desktop whenever possible.
- Computes fast 24x24 perceptual luminance grid signatures (`CompareAndRecordSignature`) to measure screen change scores and identify changed screen regions.
- Requests new visual inference only at defined checkpoints: after opening or switching applications, after significant window or page transitions, when a modal dialog appears, when an action fails, or when subsequent actions depend on newly rendered information.
- Returns compact, high-signal execution summaries to the Node.js agent loop (including active window state, focused control values, and Calculator result readbacks) to prevent context window bloat.

### 4. Execution Feedback, Safety, and Input Integrity
- **Structured Verification:** Never reports an action as successful merely because an input event was dispatched. Verifies cursor arrival within drift tolerances, checks window occlusion by foreign processes (`WindowFromPoint`), confirms control enabled state (`IsEnabled`), and measures post-action local visual patch changes or UIA property transitions.
- **Display & DPI Safety:** Enables Per-Monitor V2 DPI Awareness (`DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`) and validates all coordinates against physical multi-monitor bounds (`SystemInformation.VirtualScreen` and `Screen.AllScreens`).
- **Stuck-Input Prevention:** Tracks all depressed mouse button flags and keyboard modifier virtual keys (`Ctrl`, `Shift`, `Alt`, `Win`), releasing them deterministically in `finally` blocks, on process exit, or upon sequence cancellation (`cancel_action_sequence`).
- **Destructive Action Guardrails:** Detects destructive UI targets (such as delete, format, uninstall, empty trash, discard changes, or purchase confirmation controls) and destructive shell strings, halting execution and returning `requires_confirmation: true` until explicitly confirmed by the user.
- **Target Window Integrity:** Halts running sequences immediately if the foreground window unexpectedly switches to a different process or if an unexpected modal dialog appears.

### 5. Fuzzy & Phonetic Application Lifecycle Management
- Resolves natural language application names, aliases, and spoken variants using exact matching, Damerau-Levenshtein edit distance, phonetic key normalization, subsequence detection, and strict token-prefix sibling detection.
- Automatically requests user clarification (`requires_clarification: true`) when multiple applications match within the ambiguity margin (for example, `"Visual Studio"` vs. `"Visual Studio Code"`) or when match confidence is low.
- Resolves executables across standard installation paths, Windows Registry `App Paths`, and UWP/MSIX `shell:AppsFolder` packages, and waits for launched windows to focus before executing subsequent tools.

### 6. Sandboxed Filesystem, System Telemetry, Browser Control, and Evaluation Suite
- **Sandboxed Filesystem (`filesystem.js`):** Enforces strict path traversal protection inside `backend/sandbox` with automatic `sandbox/` prefix normalization in `executor.js`.
- **System Telemetry (`system.js`):** Queries live CPU load, physical memory allocation, running processes, and window screenshots.
- **Browser Automation (`browser.js`):** Launches URLs and search queries with `--force-renderer-accessibility` enabled for deep UIA DOM inspection inside Chromium browsers.
- **Performance Telemetry & Evaluation (`tester.js`):** Records granular per-operation timings (`uia_lookup_ms`, `mouse_keyboard_execution_ms`, `screenshot_capture_ms`, `vision_inference_ms`, `verification_ms`, `ocr_ms`, `tool_call_overhead_ms`, and `total_ms`) and includes a 23-case automated tool selection and argument accuracy benchmark suite.

---

## Project File Structure

```text
S.T.R.A.N.G.E/
|-- README.md                                     # Project documentation
|-- run.bat                                       # One-click Windows launcher for Ollama, Backend, and CLI Terminal
`-- backend/
    |-- .env                                      # Active runtime environment configuration
    |-- .env.example                              # Template environment variables
    |-- package.json                              # Node.js dependencies and npm scripts
    |-- evaluation/
    |   |-- test-cases.json                       # 23 benchmark test cases across filesystem, system, and applications
    |   |-- tester.js                             # Automated tool-calling accuracy evaluator and report generator
    |   `-- reports/                              # Timestamped JSON evaluation reports
    |-- sandbox/                                  # Isolated root directory for all agent filesystem tool operations
    |   `-- screenshots/                          # Cropped window screenshots captured during inspection or vision fallback
    `-- src/
        |-- server.js                             # Express HTTP server exposing GET / and POST /chat
        |-- terminal.js                           # Interactive CLI terminal with per-stage timing and action breakdown
        |-- agent/
        |   |-- ollama.js                         # Agent reasoning loop, prompt rules, tool coalescing, and result compaction
        |   |-- executor.js                       # Tool dispatcher, Zod validation, path normalization, and window readiness
        |   `-- registry.js                       # Tool definitions, Zod schemas, and Ollama JSON function schemas
        `-- tools/
            |-- applications.js                   # Fuzzy/phonetic app resolver, launcher, and process tree terminator
            |-- browser.js                        # Browser URL navigation and web search with renderer accessibility
            |-- desktop.js                        # Batched desktop automation, UIA/OCR/Vision resolution, and telemetry
            |-- filesystem.js                     # Sandboxed file read, write, search, and directory management
            |-- system.js                         # CPU/RAM telemetry, process inspection, and screenshot wrapper
            `-- native/
                |-- StrangeDesktopNative.cs       # Native C# Win32, UI Automation, and WinRT OCR server source
                `-- StrangeDesktopNative.exe      # Compiled native desktop service binary (auto-compiled via csc.exe)
```

---

## Prerequisites and Installation

### 1. System Requirements
- **Operating System:** Windows 10 or Windows 11 (x64)
- **Node.js:** v18.0.0 or higher (tested with Node.js v24)
- **.NET Framework:** .NET Framework 4.0+ (included with Windows at `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`; used to compile `StrangeDesktopNative.cs` automatically on first run)
- **GPU (Recommended):** NVIDIA GPU with 8 GB VRAM (such as Nvidia's RTX 4060) for concurrent local execution of `qwen3.5:4b` and `qwen2.5vl:3b`

### 2. Install and Configure Ollama Models
1. Download and install **Ollama** from [https://ollama.com](https://ollama.com).
2. Verify that the Ollama service is running:
   ```powershell
   ollama --version
   ```
3. Pull the primary reasoning/tool-calling model (`qwen3.5:4b`, ~3.3 GB) and the dedicated GUI vision grounding model (`qwen2.5vl:3b`, ~2.8 GB):
   ```powershell
   ollama pull qwen3.5:4b
   ollama pull qwen2.5vl:3b
   ```
   *(Optional)* If you want higher visual density grounding and have sufficient VRAM, you can also pull `qwen2.5vl:7b`, or configure a cloud-routed model such as `gemma4:31b-cloud`.
4. Verify that the models are installed locally:
   ```powershell
   ollama list
   ```

### 3. Install Node.js Dependencies
Open a terminal in the `backend` directory and install the required packages:
```powershell
cd backend
npm install
```

### 4. Configure Environment Variables
Create or verify `backend/.env` (you can copy from `backend/.env.example`):
```env
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:4b
OLLAMA_VISION_MODEL=qwen2.5vl:3b

PORT=3000

MAX_TOOL_ITERATIONS=12
```

---

## Running S.T.R.A.N.G.E.

### Option A: Quick Start via `run.bat` (Recommended on Windows)
From the repository root, run `run.bat` by double-clicking it in File Explorer or executing it from Command Prompt / PowerShell:
```powershell
.\run.bat
```
`run.bat` automatically launches three separate command windows:
1. **Ollama Models (`ollama list`):** Displays your installed local Ollama models so you can verify `qwen3.5:4b` and `qwen2.5vl:3b` are available.
2. **STRANGE Backend (`node server.js`):** Starts the Express backend API server on `http://localhost:3000`.
3. **STRANGE Terminal (`npm run terminal`):** Launches the interactive S.T.R.A.N.G.E. CLI prompt connected to the backend server, displaying active reasoning/vision models and detailed per-step execution telemetry.

### Option B: Running Manually

#### 1. Start the Backend Server
In your first terminal window:
```powershell
cd backend
npm start
```
For development with automatic reload on file changes:
```powershell
cd backend
npm run dev
```

#### 2. Start the Interactive CLI Terminal
In a second terminal window:
```powershell
cd backend
npm run terminal
```

#### 3. Send Requests Directly via REST API
With the backend server running on port `3000`, you can also send tasks via HTTP `POST /chat`:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/chat" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"message": "Open spotify and search up playlist X by Y and play it on shuffle"}' | ConvertTo-Json -Depth 6
```

#### 4. Run the Automated Tool Evaluation Benchmark
To evaluate tool selection and argument accuracy across the 23 test cases in `backend/evaluation/test-cases.json`:
```powershell
cd backend
npm run test:tools
```
Evaluation reports are saved automatically to `backend/evaluation/reports/`.

---

<div align="center">

Copyright (c) 2026 **MAYANK RANA**.  
GitHub: [Mayankrana11](https://github.com/Mayankrana11)

</div>
