using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using System.Windows.Forms;

namespace StrangeDesktopNative
{
    class Program
    {
        // --- Win32 P/Invoke Declarations ---
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("shcore.dll")]
        private static extern int SetProcessDpiAwareness(int value);

        [DllImport("user32.dll")]
        private static extern IntPtr SetProcessDpiAwarenessContext(IntPtr dpiContext);

        [DllImport("user32.dll")]
        private static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

        [DllImport("shcore.dll")]
        private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsZoomed(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindowEnabled(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr WindowFromPoint(POINT Point);

        [DllImport("user32.dll")]
        private static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint Msg,
            IntPtr wParam,
            IntPtr lParam,
            uint fuFlags,
            uint uTimeout,
            out IntPtr lpdwResult
        );

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private const uint INPUT_MOUSE = 0;
        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_HWHEEL = 0x01000;
        private const int WHEEL_DELTA = 120;

        private const int SW_RESTORE = 9;
        private const uint GA_ROOT = 2;
        private const uint GW_OWNER = 4;
        private const int GWL_STYLE = -16;
        private const int GWL_EXSTYLE = -20;
        private const uint WS_POPUP = 0x80000000;
        private const uint WS_DLGFRAME = 0x00400000;
        private const uint WS_EX_DLGMODALFRAME = 0x00000001;

        private const uint WM_GETOBJECT = 0x003D;
        private const uint SMTO_ABORTIFHUNG = 0x0002;
        private const uint MONITOR_DEFAULTTONEAREST = 2;

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private static readonly object StdoutLock = new object();
        private static readonly object InputStateLock = new object();

        // Track held inputs to guarantee no stuck mouse buttons or modifier keys
        private static readonly HashSet<uint> HeldMouseUpFlags = new HashSet<uint>();
        private static readonly HashSet<byte> HeldModifierVks = new HashSet<byte>();

        // Cancellation state for running action sequences
        private static volatile bool _cancelRequested = false;
        private static volatile string _cancelReason = null;
        private static volatile bool _sequenceRunning = false;

        // Screenshot comparison state (per window hwnd and global last signature)
        private static byte[] _lastGlobalSignature = null;
        private static string _lastGlobalHash = null;
        private static readonly Dictionary<long, byte[]> _windowSignatures = new Dictionary<long, byte[]>();

        // Cached WinRT OCR engine via reflection
        private static object _cachedOcrEngine = null;
        private static bool _ocrInitAttempted = false;
        private static string _ocrInitError = null;

        // Short-lived UIA tree cache to avoid re-walking the same window DOM multiple times within a single batched sequence
        private static readonly HashSet<long> _wokenBrowserHwnds = new HashSet<long>();
        private static long _cachedUiaHwnd = 0;
        private static long _cachedUiaTickMs = 0;
        private static List<UiaScannedNode> _cachedUiaNodes = null;
        private static readonly object _uiaCacheLock = new object();

        private static readonly Regex DestructiveTargetRegex = new Regex(
            @"\b(delete|permanently\s+delete|remove|uninstall|format|erase|wipe|factory\s+reset|empty\s+recycle\s+bin|empty\s+trash|discard\s+changes|don'?t\s+save|close\s+without\s+saving|clear\s+all|reset\s+all|terminate|kill\s+process|buy\s+now|place\s+order|complete\s+purchase|confirm\s+payment|send\s+money)\b",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        private static readonly Regex DestructiveCommandRegex = new Regex(
            @"(\brm\s+-rf\b|\bdel\s+/[fsq]|\bformat\s+[a-z]:|\bremove-item\b.*-recurse|\bdrop\s+table\b|\btruncate\s+table\b|\bshutdown\s+/[sr])",
            RegexOptions.IgnoreCase | RegexOptions.Compiled
        );

        static void Main(string[] args)
        {
            try
            {
                // Enable Per-Monitor V2 DPI Awareness so physical bounds, UIA rects, and cursor coordinates match 1:1 across multi-DPI monitors
                EnablePerMonitorDpiAwareness();

                Console.InputEncoding = Encoding.UTF8;
                Console.OutputEncoding = Encoding.UTF8;

                AppDomain.CurrentDomain.ProcessExit += (s, e) =>
                {
                    try { ReleaseAllInputs(); } catch { }
                };

                if (args.Length > 0 && args[0] == "--server")
                {
                    var workQueue = new Queue<Dictionary<string, object>>();
                    var queueLock = new object();
                    var workSignal = new AutoResetEvent(false);

                    // Dedicated persistent worker thread so all UIA AutomationElements live in the same thread apartment
                    // while the main thread stays free to read cancel_sequence commands from stdin immediately.
                    Thread workerThread = new Thread(() =>
                    {
                        while (true)
                        {
                            Dictionary<string, object> nextReq = null;
                            lock (queueLock)
                            {
                                if (workQueue.Count > 0)
                                {
                                    nextReq = workQueue.Dequeue();
                                }
                            }

                            if (nextReq == null)
                            {
                                workSignal.WaitOne();
                                continue;
                            }

                            string resp = HandleParsedRequest(nextReq);
                            WriteJsonLine(resp);
                        }
                    });
                    workerThread.IsBackground = true;
                    workerThread.Start();

                    string line;
                    while ((line = Console.ReadLine()) != null)
                    {
                        line = line.Trim();
                        if (string.IsNullOrEmpty(line)) continue;

                        Dictionary<string, object> req = null;
                        try
                        {
                            req = Json.Deserialize<Dictionary<string, object>>(line);
                        }
                        catch (Exception parseEx)
                        {
                            WriteJsonLine(Json.Serialize(new Dictionary<string, object>
                            {
                                { "success", false },
                                { "error", "Invalid JSON: " + parseEx.Message }
                            }));
                            continue;
                        }

                        if (req == null)
                        {
                            WriteJsonLine(Json.Serialize(new Dictionary<string, object>
                            {
                                { "success", false },
                                { "error", "Empty request JSON" }
                            }));
                            continue;
                        }

                        string cmd = GetString(req, "command", "").ToLowerInvariant();
                        if (cmd == "cancel_sequence" || cmd == "emergency_stop" || cmd == "release_all_inputs")
                        {
                            // Handle cancellation immediately on the reader thread to interrupt any running sequence
                            string responseJson = HandleParsedRequest(req);
                            WriteJsonLine(responseJson);
                        }
                        else
                        {
                            lock (queueLock)
                            {
                                workQueue.Enqueue(req);
                            }
                            workSignal.Set();
                        }
                    }
                }
                else if (args.Length > 0)
                {
                    string responseJson = HandleRequestLine(args[0]);
                    WriteJsonLine(responseJson);
                }
                else
                {
                    WriteJsonLine(Json.Serialize(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "status", "ready" }
                    }));
                }
            }
            catch (Exception ex)
            {
                try { ReleaseAllInputs(); } catch { }
                WriteJsonLine(Json.Serialize(new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", ex.Message }
                }));
            }
        }

        private static void EnablePerMonitorDpiAwareness()
        {
            try
            {
                // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
                IntPtr res = SetProcessDpiAwarenessContext(new IntPtr(-4));
                if (res != IntPtr.Zero) return;
            }
            catch { }

            try
            {
                // PROCESS_PER_MONITOR_DPI_AWARE = 2
                if (SetProcessDpiAwareness(2) == 0) return;
            }
            catch { }

            try
            {
                SetProcessDPIAware();
            }
            catch { }
        }

        private static void WriteJsonLine(string json)
        {
            lock (StdoutLock)
            {
                Console.WriteLine(json);
                Console.Out.Flush();
            }
        }

        private static string HandleRequestLine(string line)
        {
            try
            {
                var req = Json.Deserialize<Dictionary<string, object>>(line);
                return HandleParsedRequest(req);
            }
            catch (Exception ex)
            {
                return Json.Serialize(new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", ex.Message }
                });
            }
        }

        private static string HandleParsedRequest(Dictionary<string, object> req)
        {
            object reqId = null;
            try
            {
                if (req == null)
                {
                    return Json.Serialize(new Dictionary<string, object>
                    {
                        { "success", false },
                        { "error", "Empty request JSON" }
                    });
                }

                if (req.ContainsKey("id")) reqId = req["id"];
                string command = GetString(req, "command", "").ToLowerInvariant();

                Dictionary<string, object> result;
                switch (command)
                {
                    case "ping":
                        result = CmdPing();
                        break;
                    case "get_cursor":
                        result = CmdGetCursor();
                        break;
                    case "move_mouse":
                        result = CmdMoveMouse(req);
                        break;
                    case "mouse_click":
                        result = CmdMouseClick(req);
                        break;
                    case "mouse_scroll":
                        result = CmdMouseScroll(req);
                        break;
                    case "mouse_drag":
                    case "drag_and_drop":
                        result = CmdMouseDrag(req);
                        break;
                    case "type_text":
                        result = CmdTypeText(req);
                        break;
                    case "key_press":
                        result = CmdKeyPress(req);
                        break;
                    case "wait":
                        result = CmdWait(req);
                        break;
                    case "list_windows":
                        result = CmdListWindows(req);
                        break;
                    case "get_active_window":
                        result = CmdGetActiveWindow();
                        break;
                    case "focus_window":
                        result = CmdFocusWindow(req);
                        break;
                    case "screenshot":
                        result = CmdScreenshot(req);
                        break;
                    case "compare_screenshots":
                        result = CmdCompareScreenshots(req);
                        break;
                    case "ocr":
                    case "extract_text_ocr":
                        result = CmdOcr(req);
                        break;
                    case "get_screen_state":
                        result = CmdGetScreenState(req);
                        break;
                    case "uia_inspect":
                        result = CmdUiaInspect(req);
                        break;
                    case "uia_action":
                    case "uia_invoke":
                        result = CmdUiaAction(req);
                        break;
                    case "execute_action_sequence":
                        result = CmdExecuteActionSequence(req);
                        break;
                    case "cancel_sequence":
                    case "emergency_stop":
                        result = CmdCancelSequence(req);
                        break;
                    case "release_all_inputs":
                        result = CmdReleaseAllInputs();
                        break;
                    case "test_uia_scoring":
                        result = CmdTestUiaScoring();
                        break;
                    default:
                        result = new Dictionary<string, object>
                        {
                            { "success", false },
                            { "error", "Unknown command: " + command }
                        };
                        break;
                }

                if (reqId != null) result["id"] = reqId;
                return Json.Serialize(result);
            }
            catch (Exception ex)
            {
                try { ReleaseAllInputs(); } catch { }
                var err = new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", ex.Message },
                    { "stack", ex.StackTrace }
                };
                if (reqId != null) err["id"] = reqId;
                return Json.Serialize(err);
            }
        }

        // --- Display, Multi-Monitor, DPI & Coordinate Validation ---

        private static List<Dictionary<string, object>> GetMonitorsInfo()
        {
            var monitors = new List<Dictionary<string, object>>();
            Screen[] screens = Screen.AllScreens;
            for (int i = 0; i < screens.Length; i++)
            {
                Screen s = screens[i];
                Rectangle b = s.Bounds;
                Rectangle w = s.WorkingArea;
                uint dpiX = 96;
                uint dpiY = 96;
                try
                {
                    POINT centerPt = new POINT { X = b.Left + b.Width / 2, Y = b.Top + b.Height / 2 };
                    IntPtr hMon = MonitorFromPoint(centerPt, MONITOR_DEFAULTTONEAREST);
                    if (hMon != IntPtr.Zero)
                    {
                        uint dx, dy;
                        if (GetDpiForMonitor(hMon, 0, out dx, out dy) == 0 && dx > 0)
                        {
                            dpiX = dx;
                            dpiY = dy;
                        }
                    }
                }
                catch { }

                int scalePercent = (int)Math.Round((dpiX * 100.0) / 96.0);
                monitors.Add(new Dictionary<string, object>
                {
                    { "index", i },
                    { "device_name", s.DeviceName },
                    { "primary", s.Primary },
                    { "dpi_x", (int)dpiX },
                    { "dpi_y", (int)dpiY },
                    { "scale_percent", scalePercent },
                    { "bounds", new Dictionary<string, object>
                        {
                            { "x", b.Left },
                            { "y", b.Top },
                            { "width", b.Width },
                            { "height", b.Height }
                        }
                    },
                    { "working_area", new Dictionary<string, object>
                        {
                            { "x", w.Left },
                            { "y", w.Top },
                            { "width", w.Width },
                            { "height", w.Height }
                        }
                    }
                });
            }
            return monitors;
        }

        private static bool ValidateScreenCoordinates(int x, int y, out string error, out Dictionary<string, object> matchedMonitor)
        {
            error = null;
            matchedMonitor = null;
            Rectangle vBounds = SystemInformation.VirtualScreen;

            if (!vBounds.Contains(x, y))
            {
                error = string.Format(
                    "Coordinates ({0}, {1}) are outside actual display dimensions (VirtualScreen: x={2}..{3}, y={4}..{5}).",
                    x, y, vBounds.Left, vBounds.Right - 1, vBounds.Top, vBounds.Bottom - 1
                );
                return false;
            }

            List<Dictionary<string, object>> monitors = GetMonitorsInfo();
            Screen[] screens = Screen.AllScreens;
            for (int i = 0; i < screens.Length; i++)
            {
                if (screens[i].Bounds.Contains(x, y))
                {
                    if (i < monitors.Count) matchedMonitor = monitors[i];
                    return true;
                }
            }

            error = string.Format(
                "Coordinates ({0}, {1}) fall into an unmapped dead-zone between multi-monitor displays.",
                x, y
            );
            return false;
        }

        // --- Input Safety: Prevent Stuck Mouse Buttons and Keyboard Modifiers ---

        private static uint SendMouseInputFlags(uint flags, uint mouseData)
        {
            lock (InputStateLock)
            {
                if ((flags & MOUSEEVENTF_LEFTDOWN) != 0) HeldMouseUpFlags.Add(MOUSEEVENTF_LEFTUP);
                if ((flags & MOUSEEVENTF_LEFTUP) != 0) HeldMouseUpFlags.Remove(MOUSEEVENTF_LEFTUP);
                if ((flags & MOUSEEVENTF_RIGHTDOWN) != 0) HeldMouseUpFlags.Add(MOUSEEVENTF_RIGHTUP);
                if ((flags & MOUSEEVENTF_RIGHTUP) != 0) HeldMouseUpFlags.Remove(MOUSEEVENTF_RIGHTUP);
                if ((flags & MOUSEEVENTF_MIDDLEDOWN) != 0) HeldMouseUpFlags.Add(MOUSEEVENTF_MIDDLEUP);
                if ((flags & MOUSEEVENTF_MIDDLEUP) != 0) HeldMouseUpFlags.Remove(MOUSEEVENTF_MIDDLEUP);
            }

            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_MOUSE;
            inputs[0].u.mi.dx = 0;
            inputs[0].u.mi.dy = 0;
            inputs[0].u.mi.mouseData = mouseData;
            inputs[0].u.mi.dwFlags = flags;
            inputs[0].u.mi.time = 0;
            inputs[0].u.mi.dwExtraInfo = IntPtr.Zero;

            return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static uint SendKeyVkInput(byte vk, bool keyUp)
        {
            lock (InputStateLock)
            {
                if (IsModifierVk(vk))
                {
                    if (keyUp) HeldModifierVks.Remove(vk);
                    else HeldModifierVks.Add(vk);
                }
            }

            INPUT[] inputs = new INPUT[1];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].u.ki.wVk = vk;
            inputs[0].u.ki.wScan = 0;
            inputs[0].u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            inputs[0].u.ki.time = 0;
            inputs[0].u.ki.dwExtraInfo = IntPtr.Zero;

            return SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static bool IsModifierVk(byte vk)
        {
            return vk == 0x10 || vk == 0x11 || vk == 0x12 ||
                   vk == 0x5B || vk == 0x5C ||
                   vk == 0xA0 || vk == 0xA1 ||
                   vk == 0xA2 || vk == 0xA3 ||
                   vk == 0xA4 || vk == 0xA5;
        }

        private static void ReleaseAllInputs()
        {
            List<uint> mouseUpsToRelease;
            List<byte> modsToRelease;

            lock (InputStateLock)
            {
                mouseUpsToRelease = new List<uint>(HeldMouseUpFlags);
                HeldMouseUpFlags.Clear();

                modsToRelease = new List<byte>(HeldModifierVks);
                HeldModifierVks.Clear();
            }

            foreach (uint upFlag in mouseUpsToRelease)
            {
                try
                {
                    INPUT[] mi = new INPUT[1];
                    mi[0].type = INPUT_MOUSE;
                    mi[0].u.mi.dwFlags = upFlag;
                    SendInput(1, mi, Marshal.SizeOf(typeof(INPUT)));
                }
                catch { }
            }

            byte[] allModifiers = new byte[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 };
            foreach (byte modVk in allModifiers)
            {
                bool wasTracked = modsToRelease.Contains(modVk);
                bool physicallyDown = false;
                try { physicallyDown = (GetAsyncKeyState(modVk) & 0x8000) != 0; } catch { }

                if (wasTracked || physicallyDown)
                {
                    try
                    {
                        INPUT[] ki = new INPUT[1];
                        ki[0].type = INPUT_KEYBOARD;
                        ki[0].u.ki.wVk = modVk;
                        ki[0].u.ki.dwFlags = KEYEVENTF_KEYUP;
                        SendInput(1, ki, Marshal.SizeOf(typeof(INPUT)));
                    }
                    catch { }
                }
            }
        }

        private static Dictionary<string, object> CmdReleaseAllInputs()
        {
            ReleaseAllInputs();
            return new Dictionary<string, object>
            {
                { "success", true },
                { "action", "release_all_inputs" }
            };
        }

        private static Dictionary<string, object> CmdCancelSequence(Dictionary<string, object> req)
        {
            string reason = GetString(req, "reason", "Cancelled by request");
            _cancelRequested = true;
            _cancelReason = reason;
            ReleaseAllInputs();

            return new Dictionary<string, object>
            {
                { "success", true },
                { "action", "cancel_sequence" },
                { "sequence_was_running", _sequenceRunning },
                { "reason", reason }
            };
        }

        private static bool InterruptibleSleep(int totalMs)
        {
            if (totalMs <= 0) return !_cancelRequested;
            Stopwatch sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < totalMs)
            {
                if (_cancelRequested) return false;
                int remaining = totalMs - (int)sw.ElapsedMilliseconds;
                if (remaining <= 0) break;
                Thread.Sleep(Math.Min(25, remaining));
            }
            return !_cancelRequested;
        }

        // --- Structured Action Result Builder ---

        private static IntPtr GetEffectiveTargetWindowHandle(long requestedHwnd)
        {
            if (requestedHwnd != 0 && IsWindow(new IntPtr(requestedHwnd)))
            {
                return new IntPtr(requestedHwnd);
            }

            IntPtr fg = GetForegroundWindow();
            if (fg != IntPtr.Zero && IsWindow(fg))
            {
                return fg;
            }

            try
            {
                var wins = EnumerateVisibleWindows();
                foreach (var w in wins)
                {
                    if (!w.IsMinimized && w.Hwnd != 0)
                    {
                        return new IntPtr(w.Hwnd);
                    }
                }
                if (wins.Count > 0 && wins[0].Hwnd != 0)
                {
                    return new IntPtr(wins[0].Hwnd);
                }
            }
            catch { }

            return IntPtr.Zero;
        }

        private static Dictionary<string, object> GetCurrentTargetWindowSnapshot()
        {
            IntPtr hWnd = GetEffectiveTargetWindowHandle(0);
            if (hWnd == IntPtr.Zero) return null;
            return GetWindowInfoByHandle(hWnd);
        }

        private static Dictionary<string, object> GetWindowInfoByHandle(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return null;

            RECT r;
            GetWindowRect(hWnd, out r);
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            string procName = "";
            try { procName = Process.GetProcessById((int)pid).ProcessName; } catch { }

            StringBuilder sbTitle = new StringBuilder(512);
            GetWindowText(hWnd, sbTitle, sbTitle.Capacity);

            StringBuilder sbClass = new StringBuilder(256);
            GetClassName(hWnd, sbClass, sbClass.Capacity);

            IntPtr fg = GetForegroundWindow();
            int width = Math.Max(0, r.Right - r.Left);
            int height = Math.Max(0, r.Bottom - r.Top);

            return new Dictionary<string, object>
            {
                { "hwnd", hWnd.ToInt64() },
                { "pid", (int)pid },
                { "process_name", procName },
                { "title", sbTitle.ToString().Trim() },
                { "class_name", sbClass.ToString().Trim() },
                { "is_minimized", IsIconic(hWnd) },
                { "is_maximized", IsZoomed(hWnd) },
                { "is_foreground", hWnd == fg },
                { "rect", new Dictionary<string, object>
                    {
                        { "x", r.Left },
                        { "y", r.Top },
                        { "width", width },
                        { "height", height }
                    }
                }
            };
        }

        private static Dictionary<string, object> BuildActionResult(
            bool success,
            string action,
            Dictionary<string, object> targetWindow,
            string error,
            long durationMs,
            Dictionary<string, object> verification,
            Dictionary<string, object> extra
        )
        {
            if (targetWindow == null)
            {
                targetWindow = GetCurrentTargetWindowSnapshot();
            }

            var res = new Dictionary<string, object>
            {
                { "success", success },
                { "action", action },
                { "target_window", targetWindow },
                { "error", error },
                { "duration_ms", durationMs },
                { "execution_duration_ms", durationMs },
                { "verification", verification ?? new Dictionary<string, object>() }
            };

            if (extra != null)
            {
                foreach (var kv in extra)
                {
                    res[kv.Key] = kv.Value;
                }
            }

            return res;
        }

        // --- Ping & Cursor Commands ---

        private static Dictionary<string, object> CmdPing()
        {
            Rectangle bounds = Screen.PrimaryScreen.Bounds;
            Rectangle vBounds = SystemInformation.VirtualScreen;
            POINT pt;
            GetCursorPos(out pt);

            return new Dictionary<string, object>
            {
                { "success", true },
                { "screen", new Dictionary<string, object>
                    {
                        { "width", bounds.Width },
                        { "height", bounds.Height },
                        { "virtual_x", vBounds.X },
                        { "virtual_y", vBounds.Y },
                        { "virtual_width", vBounds.Width },
                        { "virtual_height", vBounds.Height }
                    }
                },
                { "monitors", GetMonitorsInfo() },
                { "cursor", new Dictionary<string, object> { { "x", pt.X }, { "y", pt.Y } } },
                { "sequence_running", _sequenceRunning }
            };
        }

        private static Dictionary<string, object> CmdGetCursor()
        {
            POINT pt;
            GetCursorPos(out pt);
            return new Dictionary<string, object>
            {
                { "success", true },
                { "x", pt.X },
                { "y", pt.Y }
            };
        }

        private static POINT SmoothMoveCursorTo(int targetX, int targetY, bool smooth, int durationMs, int steps, out bool setOk)
        {
            POINT startPt;
            GetCursorPos(out startPt);

            if (smooth && durationMs > 0 && steps > 1)
            {
                int dx = targetX - startPt.X;
                int dy = targetY - startPt.Y;
                double dist = Math.Sqrt(dx * dx + dy * dy);

                if (dist > 3)
                {
                    int actualSteps = Math.Max(3, Math.Min(25, steps));
                    int stepSleep = Math.Max(2, durationMs / actualSteps);

                    for (int i = 1; i <= actualSteps; i++)
                    {
                        if (_cancelRequested) break;
                        double t = (double)i / actualSteps;
                        double ease = 1.0 - Math.Pow(1.0 - t, 3);
                        int curX = startPt.X + (int)Math.Round(dx * ease);
                        int curY = startPt.Y + (int)Math.Round(dy * ease);
                        SetCursorPos(curX, curY);
                        Thread.Sleep(stepSleep);
                    }
                }
            }

            setOk = SetCursorPos(targetX, targetY);
            Thread.Sleep(10);

            POINT endPt;
            GetCursorPos(out endPt);
            return endPt;
        }

        private static Dictionary<string, object> CmdMoveMouse(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            int x = GetInt(req, "x", int.MinValue);
            int y = GetInt(req, "y", int.MinValue);
            bool smooth = GetBool(req, "smooth", true);
            int durationMs = GetInt(req, "duration_ms", 80);
            int steps = GetInt(req, "steps", 8);

            if (x == int.MinValue || y == int.MinValue)
            {
                sw.Stop();
                return BuildActionResult(false, "move_mouse", null, "Missing x or y coordinates for move_mouse.", sw.ElapsedMilliseconds, null, null);
            }

            string coordErr;
            Dictionary<string, object> monInfo;
            if (!ValidateScreenCoordinates(x, y, out coordErr, out monInfo))
            {
                sw.Stop();
                return BuildActionResult(false, "move_mouse", null, coordErr, sw.ElapsedMilliseconds, new Dictionary<string, object>
                {
                    { "coordinates_valid", false }
                }, new Dictionary<string, object>
                {
                    { "requested_x", x },
                    { "requested_y", y }
                });
            }

            bool setOk;
            POINT actual = SmoothMoveCursorTo(x, y, smooth, durationMs, steps, out setOk);
            int drift = Math.Abs(actual.X - x) + Math.Abs(actual.Y - y);
            bool ok = setOk && drift <= 12;
            sw.Stop();

            return BuildActionResult(
                ok,
                "move_mouse",
                GetCurrentTargetWindowSnapshot(),
                ok ? null : string.Format("Cursor verification failed: requested ({0},{1}) but cursor is at ({2},{3}).", x, y, actual.X, actual.Y),
                sw.ElapsedMilliseconds,
                new Dictionary<string, object>
                {
                    { "coordinates_valid", true },
                    { "set_cursor_ok", setOk },
                    { "cursor_position_verified", ok },
                    { "drift_px", drift },
                    { "monitor", monInfo }
                },
                new Dictionary<string, object>
                {
                    { "set_cursor_ok", setOk },
                    { "requested_x", x },
                    { "requested_y", y },
                    { "actual_x", actual.X },
                    { "actual_y", actual.Y },
                    { "x", actual.X },
                    { "y", actual.Y }
                }
            );
        }

        // Capture a tiny fast patch signature around (cx, cy) to verify visual reaction after click/scroll/type
        private static byte[] CaptureLocalPatchSignature(int cx, int cy, int radius)
        {
            try
            {
                Rectangle vScreen = SystemInformation.VirtualScreen;
                int left = Math.Max(vScreen.Left, cx - radius);
                int top = Math.Max(vScreen.Top, cy - radius);
                int right = Math.Min(vScreen.Right, cx + radius);
                int bottom = Math.Min(vScreen.Bottom, cy + radius);
                int w = right - left;
                int h = bottom - top;
                if (w < 16 || h < 16) return null;

                using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        g.CopyFromScreen(left, top, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
                    }
                    return ComputeBitmapSignature(bmp, 12, 12);
                }
            }
            catch
            {
                return null;
            }
        }

        private static Dictionary<string, object> InspectUiaElementAtPoint(int x, int y)
        {
            try
            {
                AutomationElement el = AutomationElement.FromPoint(new System.Windows.Point(x, y));
                if (el == null) return null;

                var cur = el.Current;
                string name = (cur.Name ?? "").Trim();
                string ctrlType = cur.ControlType != null ? cur.ControlType.ProgrammaticName.Replace("ControlType.", "") : "Unknown";
                string autoId = (cur.AutomationId ?? "").Trim();
                bool isEnabled = cur.IsEnabled;

                string valText = null;
                object valPatternObj;
                if (el.TryGetCurrentPattern(ValuePattern.Pattern, out valPatternObj) && valPatternObj != null)
                {
                    try { valText = ((ValuePattern)valPatternObj).Current.Value; } catch { }
                }

                string toggleState = null;
                object togPatternObj;
                if (el.TryGetCurrentPattern(TogglePattern.Pattern, out togPatternObj) && togPatternObj != null)
                {
                    try { toggleState = ((TogglePattern)togPatternObj).Current.ToggleState.ToString(); } catch { }
                }

                return new Dictionary<string, object>
                {
                    { "name", name },
                    { "role", ctrlType },
                    { "control_type", ctrlType },
                    { "automation_id", autoId },
                    { "is_enabled", isEnabled },
                    { "value", valText },
                    { "toggle_state", toggleState }
                };
            }
            catch
            {
                return null;
            }
        }

        private static Dictionary<string, object> CmdMouseClick(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                // If semantic target or uia_id is supplied, attempt direct UIA invocation first (even if fallback vision x/y coords were also provided)!
                bool hasCoords = req.ContainsKey("x") && req.ContainsKey("y") && req["x"] != null && req["y"] != null;
                string semanticTarget = GetString(req, "target", "").Trim();
                int uiaId = GetInt(req, "uia_id", -1);
                string autoId = GetString(req, "automation_id", "").Trim();
                string button = GetString(req, "button", "left").ToLowerInvariant();
                string clickType = GetString(req, "click_type", "single").ToLowerInvariant();
                bool preferUia = GetBool(req, "prefer_uia", true);

                if (preferUia && button == "left" && clickType == "single" &&
                    (!string.IsNullOrEmpty(semanticTarget) || uiaId >= 0 || !string.IsNullOrEmpty(autoId)))
                {
                    var uiaReq = new Dictionary<string, object>(req);
                    uiaReq["action"] = "invoke";
                    var uiaRes = CmdUiaAction(uiaReq);
                    if (GetBool(uiaRes, "success", false) || GetBool(uiaRes, "target_disabled", false))
                    {
                        InvalidateUiaCache();
                        return uiaRes;
                    }
                }

                long expectedHwnd = GetLong(req, "expected_hwnd", GetLong(req, "hwnd", 0));
                int expectedPid = GetInt(req, "expected_pid", 0);
                string resolvedByMethod = null;
                string matchedTargetLabel = null;

                // If semantic target / uia_id / automation_id was supplied and direct single-left-click UIA invoke didn't handle it,
                // resolve coordinates via UIA first, then Local Windows OCR. NEVER click random GetCursorPos() if target is not found!
                if (!hasCoords && (!string.IsNullOrEmpty(semanticTarget) || uiaId >= 0 || !string.IsNullOrEmpty(autoId)))
                {
                    IntPtr targetHwnd = GetEffectiveTargetWindowHandle(expectedHwnd);
                    int visited;
                    List<UiaScannedNode> nodes = GetOrScanUiaTree(targetHwnd, semanticTarget, GetString(req, "role", ""), 360, 1100, true, out visited);
                    UiaScannedNode matchedNode = null;

                    if (uiaId >= 0 && uiaId < nodes.Count) matchedNode = nodes[uiaId];
                    else if (!string.IsNullOrEmpty(autoId))
                    {
                        foreach (var n in nodes)
                        {
                            if (string.Equals(GetString(n.Data, "automation_id", ""), autoId, StringComparison.OrdinalIgnoreCase))
                            {
                                matchedNode = n;
                                break;
                            }
                        }
                    }

                    if (matchedNode == null && !string.IsNullOrEmpty(semanticTarget))
                    {
                        double topScore = 0;
                        foreach (var n in nodes)
                        {
                            if (n.Score > topScore)
                            {
                                topScore = n.Score;
                                matchedNode = n;
                            }
                        }
                        if (topScore < 0.72) matchedNode = null;
                    }

                    if (matchedNode != null)
                    {
                        req["x"] = matchedNode.Data["x"];
                        req["y"] = matchedNode.Data["y"];
                        hasCoords = true;
                        resolvedByMethod = "uia_bounding_rect";
                        matchedTargetLabel = GetString(matchedNode.Data, "name", semanticTarget);
                    }
                    else if (!string.IsNullOrEmpty(semanticTarget))
                    {
                        try
                        {
                            Rectangle capRect;
                            using (Bitmap bmp = CaptureScreenRegionBitmap(targetHwnd != IntPtr.Zero ? targetHwnd.ToInt64() : 0, null, out capRect))
                            {
                                var ocrRes = ExtractTextWithLocalOcr(bmp, capRect, semanticTarget);
                                if (GetBool(ocrRes, "success", false) && ocrRes.ContainsKey("best_match") && ocrRes["best_match"] is Dictionary<string, object>)
                                {
                                    var bm = (Dictionary<string, object>)ocrRes["best_match"];
                                    req["x"] = bm["x"];
                                    req["y"] = bm["y"];
                                    hasCoords = true;
                                    resolvedByMethod = "local_ocr";
                                    matchedTargetLabel = GetString(bm, "text", semanticTarget);
                                }
                            }
                        }
                        catch { }
                    }

                    if (!hasCoords)
                    {
                        sw.Stop();
                        return BuildActionResult(
                            false,
                            "mouse_click",
                            GetWindowInfoByHandle(targetHwnd),
                            string.Format("Target '{0}' was not found in Windows UI Automation or Local OCR.", !string.IsNullOrEmpty(semanticTarget) ? semanticTarget : autoId),
                            sw.ElapsedMilliseconds,
                            new Dictionary<string, object>
                            {
                                { "uia_found", false },
                                { "ocr_found", false }
                            },
                            new Dictionary<string, object>
                            {
                                { "target", semanticTarget },
                                { "target_not_found", true }
                            }
                        );
                    }
                }

                bool smooth = GetBool(req, "smooth", true);
                int durationMs = GetInt(req, "duration_ms", 85);
                int settleMs = GetInt(req, "settle_ms", 35);

                POINT currentPt;
                bool setOk = true;
                Dictionary<string, object> monInfo = null;

                if (hasCoords)
                {
                    int x = GetInt(req, "x", 0);
                    int y = GetInt(req, "y", 0);
                    string coordErr;
                    if (!ValidateScreenCoordinates(x, y, out coordErr, out monInfo))
                    {
                        sw.Stop();
                        return BuildActionResult(false, "mouse_click", GetCurrentTargetWindowSnapshot(), coordErr, sw.ElapsedMilliseconds, new Dictionary<string, object>
                        {
                            { "coordinates_valid", false }
                        }, new Dictionary<string, object>
                        {
                            { "requested_x", x },
                            { "requested_y", y }
                        });
                    }

                    currentPt = SmoothMoveCursorTo(x, y, smooth, durationMs, 9, out setOk);
                    int drift = Math.Abs(currentPt.X - x) + Math.Abs(currentPt.Y - y);
                    if (drift > 15)
                    {
                        sw.Stop();
                        return BuildActionResult(
                            false,
                            "mouse_click",
                            GetCurrentTargetWindowSnapshot(),
                            string.Format("Fail-check: Cursor could not reach ({0},{1}), stuck at ({2},{3}). Ensure desktop is unlocked and active window is not elevated (Admin).", x, y, currentPt.X, currentPt.Y),
                            sw.ElapsedMilliseconds,
                            new Dictionary<string, object>
                            {
                                { "coordinates_valid", true },
                                { "cursor_position_verified", false },
                                { "drift_px", drift }
                            },
                            new Dictionary<string, object>
                            {
                                { "set_cursor_ok", setOk },
                                { "requested_x", x },
                                { "requested_y", y },
                                { "actual_x", currentPt.X },
                                { "actual_y", currentPt.Y }
                            }
                        );
                    }
                }
                else
                {
                    GetCursorPos(out currentPt);
                    string coordErr;
                    if (!ValidateScreenCoordinates(currentPt.X, currentPt.Y, out coordErr, out monInfo))
                    {
                        sw.Stop();
                        return BuildActionResult(false, "mouse_click", GetCurrentTargetWindowSnapshot(), coordErr, sw.ElapsedMilliseconds, null, null);
                    }
                }

                // Verify window at click point is not occluded by an unexpected process window
                IntPtr hwndAtPt = WindowFromPoint(currentPt);
                IntPtr rootAtPt = hwndAtPt != IntPtr.Zero ? GetAncestor(hwndAtPt, GA_ROOT) : IntPtr.Zero;
                if (rootAtPt == IntPtr.Zero) rootAtPt = hwndAtPt;

                if (expectedPid > 0 && rootAtPt != IntPtr.Zero)
                {
                    uint ptPid;
                    GetWindowThreadProcessId(rootAtPt, out ptPid);
                    if (ptPid != 0 && (int)ptPid != expectedPid)
                    {
                        var occludingWin = GetWindowInfoByHandle(rootAtPt);
                        string occludingTitle = occludingWin != null ? GetString(occludingWin, "title", "Unknown") : "Unknown";
                        string occludingProc = occludingWin != null ? GetString(occludingWin, "process_name", "Unknown") : "Unknown";
                        sw.Stop();
                        return BuildActionResult(
                            false,
                            "mouse_click",
                            occludingWin,
                            string.Format("Target click point ({0},{1}) is occluded by another application window '{2}' ({3}, PID {4}).", currentPt.X, currentPt.Y, occludingTitle, occludingProc, ptPid),
                            sw.ElapsedMilliseconds,
                            new Dictionary<string, object>
                            {
                                { "window_occlusion_check", "failed" },
                                { "expected_pid", expectedPid },
                                { "actual_pid_at_point", (int)ptPid }
                            },
                            new Dictionary<string, object>
                            {
                                { "x", currentPt.X },
                                { "y", currentPt.Y }
                            }
                        );
                    }
                }

                // Inspect UIA element at click point to detect disabled controls and pre-click state
                Dictionary<string, object> preHitElement = InspectUiaElementAtPoint(currentPt.X, currentPt.Y);
                if (preHitElement != null && !GetBool(preHitElement, "is_enabled", true))
                {
                    string hitName = GetString(preHitElement, "name", "Unnamed control");
                    string hitRole = GetString(preHitElement, "role", "Control");
                    sw.Stop();
                    return BuildActionResult(
                        false,
                        "mouse_click",
                        GetCurrentTargetWindowSnapshot(),
                        string.Format("Target UI control '{0}' ({1}) at ({2},{3}) is disabled (IsEnabled=false).", hitName, hitRole, currentPt.X, currentPt.Y),
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object>
                        {
                            { "hit_element", preHitElement },
                            { "control_enabled", false }
                        },
                        new Dictionary<string, object>
                        {
                            { "x", currentPt.X },
                            { "y", currentPt.Y },
                            { "target_disabled", true }
                        }
                    );
                }

                byte[] prePatchSig = CaptureLocalPatchSignature(currentPt.X, currentPt.Y, 48);
                var preWin = GetCurrentTargetWindowSnapshot();

                if (settleMs > 0) Thread.Sleep(settleMs);

                uint downFlag = MOUSEEVENTF_LEFTDOWN;
                uint upFlag = MOUSEEVENTF_LEFTUP;
                if (button == "right")
                {
                    downFlag = MOUSEEVENTF_RIGHTDOWN;
                    upFlag = MOUSEEVENTF_RIGHTUP;
                }
                else if (button == "middle")
                {
                    downFlag = MOUSEEVENTF_MIDDLEDOWN;
                    upFlag = MOUSEEVENTF_MIDDLEUP;
                }

                int clicks = (clickType == "double" || button == "double") ? 2 : 1;
                uint totalEventsSent = 0;

                for (int c = 0; c < clicks; c++)
                {
                    totalEventsSent += SendMouseInputFlags(downFlag, 0);
                    Thread.Sleep(28);
                    totalEventsSent += SendMouseInputFlags(upFlag, 0);
                    if (c + 1 < clicks)
                    {
                        Thread.Sleep(55);
                    }
                }

                uint expectedEvents = (uint)(clicks * 2);
                if (totalEventsSent < expectedEvents)
                {
                    sw.Stop();
                    return BuildActionResult(
                        false,
                        clicks == 2 ? "double_click" : "mouse_click",
                        GetCurrentTargetWindowSnapshot(),
                        string.Format("Win32 SendInput failed to inject click events ({0}/{1} injected). Target window may be elevated (Administrator).", totalEventsSent, expectedEvents),
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object>
                        {
                            { "input_injected", false },
                            { "events_sent", (int)totalEventsSent },
                            { "events_expected", (int)expectedEvents }
                        },
                        new Dictionary<string, object>
                        {
                            { "x", currentPt.X },
                            { "y", currentPt.Y }
                        }
                    );
                }

                Thread.Sleep(35);
                byte[] postPatchSig = CaptureLocalPatchSignature(currentPt.X, currentPt.Y, 48);
                double patchChange = CompareSignaturesScore(prePatchSig, postPatchSig, 8);
                var postWin = GetCurrentTargetWindowSnapshot();
                Dictionary<string, object> postHitElement = InspectUiaElementAtPoint(currentPt.X, currentPt.Y);

                bool windowChanged = preWin != null && postWin != null &&
                    (GetLong(preWin, "hwnd", 0) != GetLong(postWin, "hwnd", 0) ||
                     GetString(preWin, "title", "") != GetString(postWin, "title", ""));

                bool uiaStateChanged = false;
                if (preHitElement != null && postHitElement != null)
                {
                    uiaStateChanged =
                        GetString(preHitElement, "toggle_state", "") != GetString(postHitElement, "toggle_state", "") ||
                        GetString(preHitElement, "value", "") != GetString(postHitElement, "value", "") ||
                        GetString(preHitElement, "name", "") != GetString(postHitElement, "name", "");
                }

                InvalidateUiaCache();
                sw.Stop();
                var clickExtra = new Dictionary<string, object>
                {
                    { "x", currentPt.X },
                    { "y", currentPt.Y },
                    { "button", button },
                    { "click_type", clicks == 2 ? "double" : "single" },
                    { "hit_element", preHitElement }
                };
                if (!string.IsNullOrEmpty(resolvedByMethod)) clickExtra["detection_method"] = resolvedByMethod;
                if (!string.IsNullOrEmpty(matchedTargetLabel)) clickExtra["matched_label"] = matchedTargetLabel;

                return BuildActionResult(
                    true,
                    clicks == 2 ? "double_click" : "mouse_click",
                    postWin,
                    null,
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object>
                    {
                        { "input_injected", true },
                        { "events_sent", (int)totalEventsSent },
                        { "cursor_position_verified", true },
                        { "control_enabled", true },
                        { "hit_element", preHitElement },
                        { "local_visual_change_score", Math.Round(patchChange, 3) },
                        { "uia_state_changed", uiaStateChanged },
                        { "window_changed", windowChanged }
                    },
                    clickExtra
                );
            }
            finally
            {
                ReleaseAllInputs();
            }
        }

        private static Dictionary<string, object> CmdMouseScroll(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            string direction = GetString(req, "direction", "down").ToLowerInvariant();
            int amount = Math.Max(1, Math.Min(50, GetInt(req, "amount", 5)));
            bool hasCoords = req.ContainsKey("x") && req.ContainsKey("y") && req["x"] != null && req["y"] != null;

            POINT pt;
            Dictionary<string, object> monInfo = null;
            if (hasCoords)
            {
                int x = GetInt(req, "x", 0);
                int y = GetInt(req, "y", 0);
                string coordErr;
                if (!ValidateScreenCoordinates(x, y, out coordErr, out monInfo))
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_scroll", GetCurrentTargetWindowSnapshot(), coordErr, sw.ElapsedMilliseconds, null, null);
                }
                bool setOk;
                pt = SmoothMoveCursorTo(x, y, true, 65, 6, out setOk);
                Thread.Sleep(25);
            }
            else
            {
                GetCursorPos(out pt);
                string coordErr;
                if (!ValidateScreenCoordinates(pt.X, pt.Y, out coordErr, out monInfo))
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_scroll", GetCurrentTargetWindowSnapshot(), coordErr, sw.ElapsedMilliseconds, null, null);
                }
            }

            byte[] preScrollSig = CaptureLocalPatchSignature(pt.X, pt.Y, 90);

            uint flag = (direction == "left" || direction == "right") ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
            int deltaPerNotch = WHEEL_DELTA;
            if (direction == "down" || direction == "left")
            {
                deltaPerNotch = -WHEEL_DELTA;
            }

            uint sentCount = 0;
            for (int i = 0; i < amount; i++)
            {
                if (_cancelRequested) break;
                sentCount += SendMouseInputFlags(flag, unchecked((uint)deltaPerNotch));
                if (i + 1 < amount) Thread.Sleep(18);
            }

            if (sentCount == 0)
            {
                sw.Stop();
                return BuildActionResult(
                    false,
                    "mouse_scroll",
                    GetCurrentTargetWindowSnapshot(),
                    "Win32 SendInput failed to inject scroll wheel events (0 events dispatched).",
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object> { { "input_injected", false } },
                    null
                );
            }

            Thread.Sleep(45);
            byte[] postScrollSig = CaptureLocalPatchSignature(pt.X, pt.Y, 90);
            double scrollChange = CompareSignaturesScore(preScrollSig, postScrollSig, 8);
            sw.Stop();

            return BuildActionResult(
                true,
                "mouse_scroll",
                GetCurrentTargetWindowSnapshot(),
                null,
                sw.ElapsedMilliseconds,
                new Dictionary<string, object>
                {
                    { "input_injected", true },
                    { "events_sent", (int)sentCount },
                    { "visual_change_score", Math.Round(scrollChange, 3) },
                    { "content_changed", scrollChange >= 0.03 }
                },
                new Dictionary<string, object>
                {
                    { "direction", direction },
                    { "amount", amount },
                    { "x", pt.X },
                    { "y", pt.Y }
                }
            );
        }

        private static Dictionary<string, object> CmdMouseDrag(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                int fromX = GetInt(req, "from_x", int.MinValue);
                int fromY = GetInt(req, "from_y", int.MinValue);
                int toX = GetInt(req, "to_x", int.MinValue);
                int toY = GetInt(req, "to_y", int.MinValue);
                int durationMs = GetInt(req, "duration_ms", 200);
                string button = GetString(req, "button", "left").ToLowerInvariant();

                if (fromX == int.MinValue || fromY == int.MinValue || toX == int.MinValue || toY == int.MinValue)
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_drag", GetCurrentTargetWindowSnapshot(), "mouse_drag requires from_x, from_y, to_x, and to_y coordinates.", sw.ElapsedMilliseconds, null, null);
                }

                string errFrom, errTo;
                Dictionary<string, object> monFrom, monTo;
                if (!ValidateScreenCoordinates(fromX, fromY, out errFrom, out monFrom))
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_drag", GetCurrentTargetWindowSnapshot(), "Invalid drag start: " + errFrom, sw.ElapsedMilliseconds, null, null);
                }
                if (!ValidateScreenCoordinates(toX, toY, out errTo, out monTo))
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_drag", GetCurrentTargetWindowSnapshot(), "Invalid drag end: " + errTo, sw.ElapsedMilliseconds, null, null);
                }

                uint downFlag = button == "right" ? MOUSEEVENTF_RIGHTDOWN : (button == "middle" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_LEFTDOWN);
                uint upFlag = button == "right" ? MOUSEEVENTF_RIGHTUP : (button == "middle" ? MOUSEEVENTF_MIDDLEUP : MOUSEEVENTF_LEFTUP);

                bool setOk;
                POINT startActual = SmoothMoveCursorTo(fromX, fromY, true, 75, 8, out setOk);
                if (Math.Abs(startActual.X - fromX) + Math.Abs(startActual.Y - fromY) > 15)
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_drag", GetCurrentTargetWindowSnapshot(), "Cursor failed to reach drag start coordinates.", sw.ElapsedMilliseconds, null, null);
                }

                Thread.Sleep(35);
                uint downSent = SendMouseInputFlags(downFlag, 0);
                if (downSent == 0)
                {
                    sw.Stop();
                    return BuildActionResult(false, "mouse_drag", GetCurrentTargetWindowSnapshot(), "SendInput failed to press mouse button for drag.", sw.ElapsedMilliseconds, null, null);
                }

                Thread.Sleep(45);
                POINT endPt = SmoothMoveCursorTo(toX, toY, true, durationMs, 14, out setOk);
                Thread.Sleep(45);
                uint upSent = SendMouseInputFlags(upFlag, 0);

                int endDrift = Math.Abs(endPt.X - toX) + Math.Abs(endPt.Y - toY);
                bool ok = downSent > 0 && upSent > 0 && endDrift <= 15;
                sw.Stop();

                return BuildActionResult(
                    ok,
                    "mouse_drag",
                    GetCurrentTargetWindowSnapshot(),
                    ok ? null : "Drag completed with cursor drift exceeding tolerance.",
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object>
                    {
                        { "input_injected", downSent > 0 && upSent > 0 },
                        { "start_verified", true },
                        { "end_verified", endDrift <= 15 },
                        { "end_drift_px", endDrift }
                    },
                    new Dictionary<string, object>
                    {
                        { "from_x", fromX },
                        { "from_y", fromY },
                        { "to_x", endPt.X },
                        { "to_y", endPt.Y },
                        { "button", button }
                    }
                );
            }
            finally
            {
                ReleaseAllInputs();
            }
        }

        private static string GetFocusedElementValue()
        {
            try
            {
                AutomationElement focused = AutomationElement.FocusedElement;
                if (focused == null) return null;

                object vpObj;
                if (focused.TryGetCurrentPattern(ValuePattern.Pattern, out vpObj) && vpObj != null)
                {
                    return ((ValuePattern)vpObj).Current.Value;
                }

                object tpObj;
                if (focused.TryGetCurrentPattern(TextPattern.Pattern, out tpObj) && tpObj != null)
                {
                    return ((TextPattern)tpObj).DocumentRange.GetText(256);
                }
            }
            catch { }
            return null;
        }

        private static bool TrySetTextOnActiveWindowUia(string text, bool clearFirst, bool pressEnter, out string observedValue, out string matchedControlName)
        {
            observedValue = null;
            matchedControlName = null;
            try
            {
                IntPtr hWnd = GetEffectiveTargetWindowHandle(0);
                if (hWnd == IntPtr.Zero) return false;

                int visited;
                List<UiaScannedNode> nodes = ScanUiaTree(hWnd, "", "", 60, 700, out visited);
                UiaScannedNode targetNode = null;

                foreach (var n in nodes)
                {
                    string role = GetString(n.Data, "role", "");
                    bool hasFocus = GetBool(n.Data, "has_focus", false);
                    bool enabled = GetBool(n.Data, "is_enabled", true);
                    if (!enabled) continue;

                    if ((role == "Edit" || role == "Document" || role == "ComboBox") && hasFocus)
                    {
                        targetNode = n;
                        break;
                    }
                    if (targetNode == null && (role == "Edit" || role == "Document"))
                    {
                        targetNode = n;
                    }
                }

                if (targetNode == null || targetNode.Element == null) return false;

                object vpObj;
                if (targetNode.Element.TryGetCurrentPattern(ValuePattern.Pattern, out vpObj) && vpObj != null)
                {
                    ValuePattern vp = (ValuePattern)vpObj;
                    if (!vp.Current.IsReadOnly)
                    {
                        string existing = vp.Current.Value ?? "";
                        string nextVal = clearFirst ? text : (existing + text);
                        if (pressEnter) nextVal += "\r\n";
                        vp.SetValue(nextVal);
                        Thread.Sleep(20);
                        observedValue = vp.Current.Value;
                        matchedControlName = GetString(targetNode.Data, "name", "Edit");
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static bool IsCalculatorWindow(Dictionary<string, object> winInfo)
        {
            if (winInfo == null) return false;
            string proc = GetString(winInfo, "process_name", "").ToLowerInvariant();
            string title = GetString(winInfo, "title", "").ToLowerInvariant();
            return proc.Contains("calculator") || proc == "calc" || title == "calculator" || title.Contains("calculator");
        }

        private static string GetCalculatorDisplayText(IntPtr targetHwnd)
        {
            try
            {
                int visited;
                List<UiaScannedNode> nodes = GetOrScanUiaTree(targetHwnd, "", "", 360, 900, false, out visited);
                string exprText = null;
                string resultText = null;

                foreach (var n in nodes)
                {
                    string autoId = GetString(n.Data, "automation_id", "");
                    string name = GetString(n.Data, "name", "");
                    if (string.Equals(autoId, "CalculatorResults", StringComparison.OrdinalIgnoreCase))
                    {
                        resultText = name;
                    }
                    else if (string.Equals(autoId, "CalculatorExpression", StringComparison.OrdinalIgnoreCase))
                    {
                        exprText = name;
                    }
                }

                if (!string.IsNullOrEmpty(resultText))
                {
                    return !string.IsNullOrEmpty(exprText) ? (exprText + " -> " + resultText) : resultText;
                }
            }
            catch { }
            return null;
        }

        private static string MapCalculatorCharToAutomationId(char ch)
        {
            switch (ch)
            {
                case '0': return "num0Button";
                case '1': return "num1Button";
                case '2': return "num2Button";
                case '3': return "num3Button";
                case '4': return "num4Button";
                case '5': return "num5Button";
                case '6': return "num6Button";
                case '7': return "num7Button";
                case '8': return "num8Button";
                case '9': return "num9Button";
                case '+': return "plusButton";
                case '-':
                case '−': return "minusButton";
                case '*':
                case '×':
                case 'x':
                case 'X': return "multiplyButton";
                case '/':
                case '÷': return "divideButton";
                case '=': return "equalButton";
                case '.':
                case ',': return "decimalSeparatorButton";
                case '%': return "percentButton";
                case 'c':
                case 'C': return "clearButton";
                default: return null;
            }
        }

        private static bool TryExecuteCalculatorSequenceViaUia(IntPtr targetHwnd, string sequenceText, bool clearFirst, bool pressEnter, out List<string> invokedButtons, out string displayAfter)
        {
            invokedButtons = new List<string>();
            displayAfter = null;
            if (string.IsNullOrEmpty(sequenceText)) return false;

            try
            {
                int visited;
                List<UiaScannedNode> nodes = GetOrScanUiaTree(targetHwnd, "", "", 360, 1200, true, out visited);
                if (nodes == null || nodes.Count == 0) return false;

                var byAutoId = new Dictionary<string, UiaScannedNode>(StringComparer.OrdinalIgnoreCase);
                foreach (var n in nodes)
                {
                    string aid = GetString(n.Data, "automation_id", "");
                    if (!string.IsNullOrEmpty(aid) && !byAutoId.ContainsKey(aid))
                    {
                        byAutoId[aid] = n;
                    }
                }

                var autoIdsToInvoke = new List<string>();
                if (clearFirst)
                {
                    if (byAutoId.ContainsKey("clearButton")) autoIdsToInvoke.Add("clearButton");
                    else if (byAutoId.ContainsKey("clearEntryButton")) autoIdsToInvoke.Add("clearEntryButton");
                }

                bool hasExplicitEquals = false;
                foreach (char ch in sequenceText)
                {
                    if (char.IsWhiteSpace(ch)) continue;
                    if (ch == '\n' || ch == '\r')
                    {
                        autoIdsToInvoke.Add("equalButton");
                        hasExplicitEquals = true;
                        continue;
                    }
                    string aid = MapCalculatorCharToAutomationId(ch);
                    if (aid == null)
                    {
                        return false;
                    }
                    if (aid == "equalButton") hasExplicitEquals = true;
                    autoIdsToInvoke.Add(aid);
                }

                if (pressEnter && !hasExplicitEquals)
                {
                    autoIdsToInvoke.Add("equalButton");
                }

                if (autoIdsToInvoke.Count == 0) return false;

                // Verify all needed buttons exist in the Calculator UIA tree
                foreach (string aid in autoIdsToInvoke)
                {
                    if (!byAutoId.ContainsKey(aid)) return false;
                }

                foreach (string aid in autoIdsToInvoke)
                {
                    UiaScannedNode node = byAutoId[aid];
                    object patObj;
                    if (node.Element != null && node.Element.TryGetCurrentPattern(InvokePattern.Pattern, out patObj) && patObj != null)
                    {
                        ((InvokePattern)patObj).Invoke();
                        invokedButtons.Add(GetString(node.Data, "name", aid));
                        Thread.Sleep(22);
                    }
                    else
                    {
                        return false;
                    }
                }

                InvalidateUiaCache();
                Thread.Sleep(35);
                displayAfter = GetCalculatorDisplayText(targetHwnd);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static Dictionary<string, object> CmdTypeText(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                string text = GetString(req, "text", "");
                bool clearFirst = GetBool(req, "clear_first", false);
                bool pressEnter = GetBool(req, "press_enter", false);
                int delayMs = Math.Max(1, Math.Min(150, GetInt(req, "delay_ms", 8)));
                string target = GetString(req, "target", "").Trim();
                int uiaId = GetInt(req, "uia_id", -1);
                bool hasCoords = req.ContainsKey("x") && req.ContainsKey("y") && req["x"] != null && req["y"] != null;
                long expectedHwnd = GetLong(req, "expected_hwnd", GetLong(req, "hwnd", 0));

                var preWin = GetWindowInfoByHandle(GetEffectiveTargetWindowHandle(expectedHwnd));

                // Fast & 100% deterministic UIA button invocation when typing math expressions into Windows Calculator
                if (IsCalculatorWindow(preWin) && string.IsNullOrEmpty(target) && uiaId < 0)
                {
                    IntPtr calcHwnd = GetEffectiveTargetWindowHandle(expectedHwnd);
                    List<string> calcInvoked;
                    string calcDisplay;
                    if (TryExecuteCalculatorSequenceViaUia(calcHwnd, text, clearFirst, pressEnter, out calcInvoked, out calcDisplay))
                    {
                        sw.Stop();
                        return BuildActionResult(
                            true,
                            "type_text",
                            GetWindowInfoByHandle(calcHwnd),
                            null,
                            sw.ElapsedMilliseconds,
                            new Dictionary<string, object>
                            {
                                { "uia_pattern", "InvokePattern(CalculatorSequence)" },
                                { "invoked_buttons", calcInvoked },
                                { "calculator_display", calcDisplay },
                                { "uia_value_verified", !string.IsNullOrEmpty(calcDisplay) }
                            },
                            new Dictionary<string, object>
                            {
                                { "typed_length", text.Length },
                                { "text", text },
                                { "cleared_first", clearFirst },
                                { "pressed_enter", pressEnter },
                                { "detection_method", "uia_calculator_buttons" },
                                { "calculator_display", calcDisplay }
                            }
                        );
                    }
                }

                // If a target or uia_id or coordinates are passed on type_text, focus/click the target first
                if (uiaId >= 0 || !string.IsNullOrEmpty(target))
                {
                    var uiaReq = new Dictionary<string, object>(req);
                    uiaReq["action"] = "set_value";
                    var uiaRes = CmdUiaAction(uiaReq);
                    if (GetBool(uiaRes, "success", false) || GetBool(uiaRes, "target_disabled", false))
                    {
                        InvalidateUiaCache();
                        return uiaRes;
                    }
                }
                else if (hasCoords)
                {
                    var clickRes = CmdMouseClick(new Dictionary<string, object>
                    {
                        { "x", req["x"] },
                        { "y", req["y"] },
                        { "button", "left" },
                        { "click_type", "single" },
                        { "prefer_uia", false }
                    });
                    if (!GetBool(clickRes, "success", false))
                    {
                        return clickRes;
                    }
                    Thread.Sleep(60);
                }

                preWin = GetCurrentTargetWindowSnapshot();
                if (preWin == null)
                {
                    sw.Stop();
                    return BuildActionResult(false, "type_text", null, "No active foreground window to receive typed text.", sw.ElapsedMilliseconds, null, null);
                }

                string preValue = GetFocusedElementValue();

                if (clearFirst)
                {
                    SendKeyCombo(0x41, new List<byte> { 0x11 }); // Ctrl+A
                    Thread.Sleep(30);
                    SendVirtualKey(0x08); // Backspace
                    Thread.Sleep(30);
                }

                uint totalInjected = 0;
                uint totalExpected = 0;

                foreach (char ch in text)
                {
                    if (_cancelRequested) break;
                    if (ch == '\r') continue;
                    if (ch == '\n')
                    {
                        totalExpected += 2;
                        totalInjected += SendVirtualKey(0x0D);
                        Thread.Sleep(delayMs);
                        continue;
                    }

                    INPUT[] inputs = new INPUT[2];
                    inputs[0].type = INPUT_KEYBOARD;
                    inputs[0].u.ki.wVk = 0;
                    inputs[0].u.ki.wScan = (ushort)ch;
                    inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;

                    inputs[1].type = INPUT_KEYBOARD;
                    inputs[1].u.ki.wVk = 0;
                    inputs[1].u.ki.wScan = (ushort)ch;
                    inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

                    totalExpected += 2;
                    totalInjected += SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                    if (delayMs > 0) Thread.Sleep(delayMs);
                }

                if (text.Length > 0 && totalInjected == 0)
                {
                    // Fallback to direct semantic UIA ValuePattern on active window Edit/Document control!
                    string uiaObserved;
                    string uiaControlName;
                    if (TrySetTextOnActiveWindowUia(text, clearFirst, pressEnter, out uiaObserved, out uiaControlName))
                    {
                        sw.Stop();
                        return BuildActionResult(
                            true,
                            "type_text",
                            GetCurrentTargetWindowSnapshot(),
                            null,
                            sw.ElapsedMilliseconds,
                            new Dictionary<string, object>
                            {
                                { "uia_pattern", "ValuePattern.SetValue" },
                                { "uia_value_verified", true },
                                { "control_name", uiaControlName },
                                { "observed_control_value", uiaObserved != null && uiaObserved.Length > 180 ? uiaObserved.Substring(0, 180) : uiaObserved }
                            },
                            new Dictionary<string, object>
                            {
                                { "typed_length", text.Length },
                                { "text", text },
                                { "cleared_first", clearFirst },
                                { "pressed_enter", pressEnter },
                                { "detection_method", "uia_value_pattern" }
                            }
                        );
                    }

                    sw.Stop();
                    return BuildActionResult(
                        false,
                        "type_text",
                        GetCurrentTargetWindowSnapshot(),
                        "Win32 SendInput failed to inject character events (0 keystrokes dispatched).",
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object> { { "input_injected", false } },
                        null
                    );
                }

                if (pressEnter && !_cancelRequested)
                {
                    Thread.Sleep(45);
                    totalExpected += 2;
                    totalInjected += SendVirtualKey(0x0D); // Enter
                }

                Thread.Sleep(35);
                string postValue = GetFocusedElementValue();
                bool valueVerified = postValue != null && (postValue != preValue || postValue.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0);

                sw.Stop();
                return BuildActionResult(
                    true,
                    "type_text",
                    GetCurrentTargetWindowSnapshot(),
                    null,
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object>
                    {
                        { "input_injected", totalInjected == totalExpected },
                        { "events_sent", (int)totalInjected },
                        { "events_expected", (int)totalExpected },
                        { "uia_value_verified", valueVerified },
                        { "observed_control_value", postValue }
                    },
                    new Dictionary<string, object>
                    {
                        { "typed_length", text.Length },
                        { "text", text },
                        { "cleared_first", clearFirst },
                        { "pressed_enter", pressEnter }
                    }
                );
            }
            finally
            {
                ReleaseAllInputs();
            }
        }

        private static Dictionary<string, object> CmdKeyPress(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                string rawKeyName = GetString(req, "key", "").Trim();
                string keyName = rawKeyName;
                var modifiers = new List<byte>();

                if (req.ContainsKey("modifiers") && req["modifiers"] is IEnumerable && !(req["modifiers"] is string))
                {
                    foreach (var modObj in (IEnumerable)req["modifiers"])
                    {
                        if (modObj == null) continue;
                        byte modVk = ResolveModifierVk(modObj.ToString());
                        if (modVk != 0 && !modifiers.Contains(modVk)) modifiers.Add(modVk);
                    }
                }

                if (keyName.Length > 1 && keyName.Contains("+"))
                {
                    bool endsWithPlusKey = keyName.EndsWith("++");
                    string[] parts = keyName.Split(new[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
                    int modLimit = endsWithPlusKey ? parts.Length : parts.Length - 1;
                    for (int i = 0; i < modLimit; i++)
                    {
                        byte modVk = ResolveModifierVk(parts[i].Trim());
                        if (modVk != 0 && !modifiers.Contains(modVk)) modifiers.Add(modVk);
                    }
                    keyName = endsWithPlusKey ? "+" : (parts.Length > 0 ? parts[parts.Length - 1].Trim() : "+");
                }

                // If active window is Calculator and a calculator key is pressed without Ctrl/Alt/Win modifiers, invoke via UIA for 100% reliability
                if (modifiers.Count == 0 && keyName.Length == 1)
                {
                    var curWin = GetCurrentTargetWindowSnapshot();
                    if (IsCalculatorWindow(curWin))
                    {
                        string calcAid = MapCalculatorCharToAutomationId(keyName[0]);
                        if (calcAid != null)
                        {
                            var uiaCalcRes = CmdUiaAction(new Dictionary<string, object>
                            {
                                { "action", "invoke" },
                                { "automation_id", calcAid },
                                { "target", keyName }
                            });
                            if (GetBool(uiaCalcRes, "success", false))
                            {
                                InvalidateUiaCache();
                                uiaCalcRes["action"] = "key_press";
                                uiaCalcRes["key"] = rawKeyName;
                                return uiaCalcRes;
                            }
                        }
                    }
                }

                byte vk = ResolveVirtualKey(keyName);
                if (vk == 0)
                {
                    // Check if the single key itself was a modifier like "win" or "alt" or "ctrl"
                    vk = ResolveModifierVk(keyName);
                }

                if (vk == 0)
                {
                    sw.Stop();
                    return BuildActionResult(false, "key_press", GetCurrentTargetWindowSnapshot(), "Unsupported key name: " + rawKeyName, sw.ElapsedMilliseconds, null, null);
                }

                uint sent = SendKeyCombo(vk, modifiers);
                uint expected = (uint)(modifiers.Count * 2 + 2);
                bool ok = sent >= 2;
                sw.Stop();

                return BuildActionResult(
                    ok,
                    "key_press",
                    GetCurrentTargetWindowSnapshot(),
                    ok ? null : "Win32 SendInput failed to dispatch key press.",
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object>
                    {
                        { "input_injected", ok },
                        { "events_sent", (int)sent },
                        { "events_expected", (int)expected },
                        { "modifiers_released", true }
                    },
                    new Dictionary<string, object>
                    {
                        { "key", rawKeyName },
                        { "vk", (int)vk },
                        { "modifiers_count", modifiers.Count }
                    }
                );
            }
            finally
            {
                ReleaseAllInputs();
            }
        }

        private static Dictionary<string, object> CmdWait(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            int durationMs = GetInt(req, "duration_ms", GetInt(req, "ms", GetInt(req, "wait_ms", 250)));
            durationMs = Math.Max(0, Math.Min(30000, durationMs));
            bool completed = InterruptibleSleep(durationMs);
            sw.Stop();

            return BuildActionResult(
                completed,
                "wait",
                GetCurrentTargetWindowSnapshot(),
                completed ? null : "Wait interrupted by sequence cancellation.",
                sw.ElapsedMilliseconds,
                new Dictionary<string, object>
                {
                    { "requested_wait_ms", durationMs },
                    { "actual_wait_ms", sw.ElapsedMilliseconds },
                    { "interrupted", !completed }
                },
                new Dictionary<string, object>
                {
                    { "duration_ms", sw.ElapsedMilliseconds },
                    { "requested_ms", durationMs }
                }
            );
        }

        private static uint SendVirtualKey(byte vk)
        {
            uint sent = 0;
            sent += SendKeyVkInput(vk, false);
            Thread.Sleep(22);
            sent += SendKeyVkInput(vk, true);
            return sent;
        }

        private static uint SendKeyCombo(byte vk, List<byte> modifiers)
        {
            uint sent = 0;
            try
            {
                foreach (byte mod in modifiers)
                {
                    sent += SendKeyVkInput(mod, false);
                    Thread.Sleep(15);
                }
                sent += SendKeyVkInput(vk, false);
                Thread.Sleep(25);
                sent += SendKeyVkInput(vk, true);
                Thread.Sleep(15);
            }
            finally
            {
                for (int i = modifiers.Count - 1; i >= 0; i--)
                {
                    sent += SendKeyVkInput(modifiers[i], true);
                    Thread.Sleep(10);
                }
            }
            return sent;
        }

        private static byte ResolveModifierVk(string mod)
        {
            switch (mod.Trim().ToLowerInvariant())
            {
                case "ctrl":
                case "control":
                    return 0x11;
                case "shift":
                    return 0x10;
                case "alt":
                case "menu":
                    return 0x12;
                case "win":
                case "windows":
                case "meta":
                    return 0x5B;
                default:
                    return 0;
            }
        }

        private static byte ResolveVirtualKey(string key)
        {
            string k = key.Trim().ToLowerInvariant();
            if (k.Length == 1)
            {
                char c = k[0];
                if (c >= 'a' && c <= 'z') return (byte)char.ToUpperInvariant(c);
                if (c >= '0' && c <= '9') return (byte)c;
            }

            switch (k)
            {
                case "enter":
                case "return": return 0x0D;
                case "space":
                case "spacebar": return 0x20;
                case "tab": return 0x09;
                case "esc":
                case "escape": return 0x1B;
                case "backspace":
                case "back": return 0x08;
                case "delete":
                case "del": return 0x2E;
                case "insert":
                case "ins": return 0x2D;
                case "up":
                case "arrowup": return 0x26;
                case "down":
                case "arrowdown": return 0x28;
                case "left":
                case "arrowleft": return 0x25;
                case "right":
                case "arrowright": return 0x27;
                case "home": return 0x24;
                case "end": return 0x23;
                case "pageup":
                case "pgup": return 0x21;
                case "pagedown":
                case "pgdn": return 0x22;
                case "f1": return 0x70;
                case "f2": return 0x71;
                case "f3": return 0x72;
                case "f4": return 0x73;
                case "f5": return 0x74;
                case "f6": return 0x75;
                case "f7": return 0x76;
                case "f8": return 0x77;
                case "f9": return 0x78;
                case "f10": return 0x79;
                case "f11": return 0x7A;
                case "f12": return 0x7B;
                case "mediaplaypause":
                case "playpause": return 0xB3;
                case "medianext":
                case "nexttrack": return 0xB0;
                case "mediaprev":
                case "prevtrack": return 0xB1;
                case "volumemute":
                case "mute": return 0xAD;
                case "volumedown": return 0xAE;
                case "volumeup": return 0xAF;
                case "plus":
                case "add":
                case "+": return 0x6B; // VK_ADD
                case "equals":
                case "equal":
                case "=": return 0xBB; // VK_OEM_PLUS ('=' key)
                case "minus":
                case "subtract":
                case "-": return 0xBD; // VK_OEM_MINUS
                case "multiply":
                case "times":
                case "*": return 0x6A; // VK_MULTIPLY
                case "slash":
                case "divide":
                case "/": return 0xBF; // VK_OEM_2
                case "period":
                case "decimal":
                case "dot":
                case ".": return 0xBE;
                case "comma":
                case ",": return 0xBC;
                default: return 0;
            }
        }

        // --- Window Enumeration, Active Window & Dialog Detection ---

        private class WindowEntry
        {
            public long Hwnd;
            public int Pid;
            public string ProcessName;
            public string Title;
            public string ClassName;
            public RECT Rect;
            public bool IsMinimized;
            public bool IsMaximized;
            public bool IsForeground;
            public bool IsModalDialog;
            public long OwnerHwnd;
        }

        private static bool CheckWindowIsModalOrDialog(IntPtr hWnd, string className, string title, out long ownerHwnd)
        {
            ownerHwnd = 0;
            try
            {
                IntPtr owner = GetWindow(hWnd, GW_OWNER);
                if (owner != IntPtr.Zero) ownerHwnd = owner.ToInt64();

                if (className == "#32770" || className.IndexOf("Dialog", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return true;
                }

                uint style = unchecked((uint)GetWindowLong(hWnd, GWL_STYLE));
                uint exStyle = unchecked((uint)GetWindowLong(hWnd, GWL_EXSTYLE));
                if (owner != IntPtr.Zero && ((exStyle & WS_EX_DLGMODALFRAME) != 0 || ((style & WS_POPUP) != 0 && (style & WS_DLGFRAME) != 0)))
                {
                    return true;
                }
            }
            catch { }
            return false;
        }

        private static List<WindowEntry> EnumerateVisibleWindows()
        {
            var list = new List<WindowEntry>();
            IntPtr fg = GetForegroundWindow();

            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd)) return true;

                int len = GetWindowTextLength(hWnd);
                if (len <= 0) return true;

                StringBuilder sbTitle = new StringBuilder(len + 1);
                GetWindowText(hWnd, sbTitle, sbTitle.Capacity);
                string title = sbTitle.ToString().Trim();
                if (string.IsNullOrEmpty(title)) return true;

                StringBuilder sbClass = new StringBuilder(256);
                GetClassName(hWnd, sbClass, sbClass.Capacity);
                string className = sbClass.ToString();

                if (className == "Progman" || className == "WorkerW" || className == "Shell_TrayWnd")
                    return true;

                RECT rect;
                GetWindowRect(hWnd, out rect);
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;
                bool iconic = IsIconic(hWnd);

                if (!iconic && (w < 60 || h < 45)) return true;

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                string procName = "";
                try
                {
                    using (var p = Process.GetProcessById((int)pid))
                    {
                        procName = p.ProcessName;
                    }
                }
                catch { }

                long ownerHwnd;
                bool isDialog = CheckWindowIsModalOrDialog(hWnd, className, title, out ownerHwnd);

                list.Add(new WindowEntry
                {
                    Hwnd = hWnd.ToInt64(),
                    Pid = (int)pid,
                    ProcessName = procName,
                    Title = title,
                    ClassName = className,
                    Rect = rect,
                    IsMinimized = iconic,
                    IsMaximized = IsZoomed(hWnd),
                    IsForeground = (hWnd == fg),
                    IsModalDialog = isDialog,
                    OwnerHwnd = ownerHwnd
                });

                return true;
            }, IntPtr.Zero);

            return list;
        }

        private static Dictionary<string, object> SerializeWindow(WindowEntry w)
        {
            if (w == null) return null;
            int width = Math.Max(0, w.Rect.Right - w.Rect.Left);
            int height = Math.Max(0, w.Rect.Bottom - w.Rect.Top);
            return new Dictionary<string, object>
            {
                { "hwnd", w.Hwnd },
                { "pid", w.Pid },
                { "process_name", w.ProcessName },
                { "title", w.Title },
                { "class_name", w.ClassName },
                { "is_minimized", w.IsMinimized },
                { "is_maximized", w.IsMaximized },
                { "is_foreground", w.IsForeground },
                { "is_modal_dialog", w.IsModalDialog },
                { "owner_hwnd", w.OwnerHwnd },
                { "rect", new Dictionary<string, object>
                    {
                        { "x", w.Rect.Left },
                        { "y", w.Rect.Top },
                        { "width", width },
                        { "height", height }
                    }
                }
            };
        }

        private static Dictionary<string, object> CmdListWindows(Dictionary<string, object> req)
        {
            var wins = EnumerateVisibleWindows();
            var serialized = new List<Dictionary<string, object>>();
            foreach (var w in wins) serialized.Add(SerializeWindow(w));

            return new Dictionary<string, object>
            {
                { "success", true },
                { "windows", serialized }
            };
        }

        private static Dictionary<string, object> CmdGetActiveWindow()
        {
            IntPtr fg = GetEffectiveTargetWindowHandle(0);
            if (fg == IntPtr.Zero)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "No active foreground window" }
                };
            }

            var wins = EnumerateVisibleWindows();
            foreach (var w in wins)
            {
                if (w.Hwnd == fg.ToInt64())
                {
                    var res = SerializeWindow(w);
                    res["success"] = true;
                    return res;
                }
            }

            var info = GetWindowInfoByHandle(fg);
            if (info != null)
            {
                info["success"] = true;
                return info;
            }

            return new Dictionary<string, object>
            {
                { "success", false },
                { "error", "Could not inspect foreground window" }
            };
        }

        private static Dictionary<string, object> CmdFocusWindow(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            long targetHwnd = GetLong(req, "hwnd", 0);
            string titleQuery = GetString(req, "title_query", "").ToLowerInvariant().Trim();
            var procFilter = new List<string>();

            if (req.ContainsKey("process_names") && req["process_names"] is IEnumerable && !(req["process_names"] is string))
            {
                foreach (var pObj in (IEnumerable)req["process_names"])
                {
                    if (pObj != null)
                    {
                        string clean = pObj.ToString().ToLowerInvariant().Replace(".exe", "").Trim();
                        if (!string.IsNullOrEmpty(clean)) procFilter.Add(clean);
                    }
                }
            }

            var wins = EnumerateVisibleWindows();
            WindowEntry best = null;
            int bestScore = -1;

            foreach (var w in wins)
            {
                if (targetHwnd != 0 && w.Hwnd == targetHwnd)
                {
                    best = w;
                    break;
                }

                int score = 0;
                string pLower = (w.ProcessName ?? "").ToLowerInvariant();
                string tLower = (w.Title ?? "").ToLowerInvariant();

                bool procMatch = false;
                if (procFilter.Count > 0)
                {
                    foreach (var pf in procFilter)
                    {
                        if (pLower == pf)
                        {
                            procMatch = true;
                            score += 120;
                            break;
                        }
                        if (pLower.Contains(pf))
                        {
                            procMatch = true;
                            score += 75;
                            break;
                        }
                    }
                }

                bool titleMatch = false;
                if (!string.IsNullOrEmpty(titleQuery))
                {
                    if (tLower == titleQuery)
                    {
                        titleMatch = true;
                        score += 110;
                    }
                    else if (tLower.Contains(titleQuery))
                    {
                        titleMatch = true;
                        score += 70;
                    }
                }

                if (!procMatch && !titleMatch) continue;

                if (procFilter.Count > 0 && !procMatch)
                {
                    if (pLower != "applicationframehost" && tLower != titleQuery)
                        continue;
                }

                int width = Math.Max(0, w.Rect.Right - w.Rect.Left);
                int height = Math.Max(0, w.Rect.Bottom - w.Rect.Top);
                int area = width * height;
                if (area > 200000) score += 30;
                else if (area > 60000) score += 15;
                if (w.IsForeground) score += 5;

                if (score > bestScore)
                {
                    bestScore = score;
                    best = w;
                }
            }

            if (best == null)
            {
                sw.Stop();
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "action", "focus_window" },
                    { "duration_ms", sw.ElapsedMilliseconds },
                    { "error", "Matching window not found" }
                };
            }

            IntPtr hWnd = new IntPtr(best.Hwnd);

            if (IsIconic(hWnd))
            {
                ShowWindow(hWnd, SW_RESTORE);
                Thread.Sleep(160);
            }

            IntPtr fg = GetForegroundWindow();
            if (fg != hWnd)
            {
                uint fgPid;
                uint fgThread = GetWindowThreadProcessId(fg, out fgPid);
                uint curThread = GetCurrentThreadId();
                bool attached = false;

                if (fgThread != 0 && fgThread != curThread)
                {
                    attached = AttachThreadInput(curThread, fgThread, true);
                }

                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);

                if (attached)
                {
                    AttachThreadInput(curThread, fgThread, false);
                }

                Thread.Sleep(55);
                if (GetForegroundWindow() != hWnd)
                {
                    SendKeyVkInput(0x12, false); // Alt down
                    SetForegroundWindow(hWnd);
                    SendKeyVkInput(0x12, true);  // Alt up
                    Thread.Sleep(55);
                }
            }

            RECT updatedRect;
            GetWindowRect(hWnd, out updatedRect);
            best.Rect = updatedRect;
            best.IsMinimized = IsIconic(hWnd);
            best.IsMaximized = IsZoomed(hWnd);
            best.IsForeground = (GetForegroundWindow() == hWnd);
            sw.Stop();

            var result = SerializeWindow(best);
            result["success"] = true;
            result["action"] = "focus_window";
            result["duration_ms"] = sw.ElapsedMilliseconds;
            result["execution_duration_ms"] = sw.ElapsedMilliseconds;
            result["target_window"] = SerializeWindow(best);
            result["verification"] = new Dictionary<string, object>
            {
                { "is_foreground", best.IsForeground },
                { "is_minimized", best.IsMinimized }
            };
            return result;
        }

        // --- Screenshot Optimization, Perceptual Comparison & Local Windows OCR ---

        private static Bitmap CaptureScreenRegionBitmap(long targetHwnd, Dictionary<string, object> cropRectDict, out Rectangle actualCaptureRect)
        {
            Rectangle screenBounds = Screen.PrimaryScreen.Bounds;
            Rectangle vScreen = SystemInformation.VirtualScreen;

            if (targetHwnd == 0)
            {
                IntPtr eff = GetEffectiveTargetWindowHandle(0);
                if (eff != IntPtr.Zero) targetHwnd = eff.ToInt64();
            }

            int capX = screenBounds.X;
            int capY = screenBounds.Y;
            int capW = screenBounds.Width;
            int capH = screenBounds.Height;

            // Default to target window bounds if hwnd is provided and no explicit crop_rect was passed
            if (cropRectDict == null && targetHwnd != 0 && IsWindow(new IntPtr(targetHwnd)) && !IsIconic(new IntPtr(targetHwnd)))
            {
                RECT wr;
                if (GetWindowRect(new IntPtr(targetHwnd), out wr))
                {
                    int left = Math.Max(vScreen.Left, wr.Left);
                    int top = Math.Max(vScreen.Top, wr.Top);
                    int right = Math.Min(vScreen.Right, wr.Right);
                    int bottom = Math.Min(vScreen.Bottom, wr.Bottom);
                    if (right - left >= 60 && bottom - top >= 60)
                    {
                        capX = left;
                        capY = top;
                        capW = right - left;
                        capH = bottom - top;
                    }
                }
            }
            else if (cropRectDict != null)
            {
                int rx = GetInt(cropRectDict, "x", capX);
                int ry = GetInt(cropRectDict, "y", capY);
                int rw = GetInt(cropRectDict, "width", capW);
                int rh = GetInt(cropRectDict, "height", capH);

                int left = Math.Max(vScreen.Left, rx);
                int top = Math.Max(vScreen.Top, ry);
                int right = Math.Min(vScreen.Right, rx + rw);
                int bottom = Math.Min(vScreen.Bottom, ry + rh);

                if (right - left >= 40 && bottom - top >= 40)
                {
                    capX = left;
                    capY = top;
                    capW = right - left;
                    capH = bottom - top;
                }
            }

            actualCaptureRect = new Rectangle(capX, capY, capW, capH);
            Bitmap rawBmp = new Bitmap(capW, capH, PixelFormat.Format24bppRgb);

            using (Graphics g = Graphics.FromImage(rawBmp))
            {
                try
                {
                    g.CopyFromScreen(capX, capY, 0, 0, new Size(capW, capH), CopyPixelOperation.SourceCopy);
                }
                catch (Exception copyEx)
                {
                    bool printed = false;
                    if (targetHwnd != 0)
                    {
                        IntPtr hdc = g.GetHdc();
                        try
                        {
                            printed = PrintWindow(new IntPtr(targetHwnd), hdc, 2);
                            if (!printed)
                            {
                                printed = PrintWindow(new IntPtr(targetHwnd), hdc, 0);
                            }
                        }
                        finally
                        {
                            g.ReleaseHdc(hdc);
                        }
                    }

                    if (!printed)
                    {
                        rawBmp.Dispose();
                        throw new Exception(
                            "Screen capture failed (" + copyEx.Message + "). Ensure the Windows desktop is unlocked and running in an interactive user session."
                        );
                    }
                }
            }

            return rawBmp;
        }

        private static byte[] ComputeBitmapSignature(Bitmap src, int gridW, int gridH)
        {
            if (src == null) return null;
            byte[] sig = new byte[gridW * gridH];
            using (Bitmap thumb = new Bitmap(gridW, gridH, PixelFormat.Format24bppRgb))
            {
                using (Graphics g = Graphics.FromImage(thumb))
                {
                    g.InterpolationMode = InterpolationMode.Bilinear;
                    g.DrawImage(src, 0, 0, gridW, gridH);
                }

                int idx = 0;
                for (int y = 0; y < gridH; y++)
                {
                    for (int x = 0; x < gridW; x++)
                    {
                        Color c = thumb.GetPixel(x, y);
                        int luma = (c.R * 299 + c.G * 587 + c.B * 114) / 1000;
                        sig[idx++] = (byte)Math.Max(0, Math.Min(255, luma));
                    }
                }
            }
            return sig;
        }

        private static string ComputeSignatureHash(byte[] sig)
        {
            if (sig == null || sig.Length == 0) return "";
            uint hash = 2166136261;
            for (int i = 0; i < sig.Length; i++)
            {
                // Quantize by 4 to ignore minor compression/cursor noise
                uint q = (uint)(sig[i] >> 2);
                hash ^= q;
                hash *= 16777619;
            }
            return hash.ToString("x8");
        }

        private static double CompareSignaturesScore(byte[] sigA, byte[] sigB, int cellDiffThreshold)
        {
            if (sigA == null || sigB == null || sigA.Length != sigB.Length || sigA.Length == 0)
            {
                return 1.0;
            }

            int changedCells = 0;
            for (int i = 0; i < sigA.Length; i++)
            {
                if (Math.Abs(sigA[i] - sigB[i]) >= cellDiffThreshold)
                {
                    changedCells++;
                }
            }

            return (double)changedCells / sigA.Length;
        }

        private static Dictionary<string, object> CompareAndRecordSignature(long hwnd, Bitmap bmp, Rectangle captureRect)
        {
            const int GridSize = 24;
            byte[] currentSig = ComputeBitmapSignature(bmp, GridSize, GridSize);
            string currentHash = ComputeSignatureHash(currentSig);

            byte[] prevSig = null;
            if (hwnd != 0 && _windowSignatures.ContainsKey(hwnd))
            {
                prevSig = _windowSignatures[hwnd];
            }
            else if (_lastGlobalSignature != null)
            {
                prevSig = _lastGlobalSignature;
            }

            double changeScore = 1.0;
            double meanDelta = 0.0;
            bool meaningfulChange = true;
            Dictionary<string, object> changedBounds = null;

            if (prevSig != null && currentSig != null && prevSig.Length == currentSig.Length)
            {
                int changedCells = 0;
                long totalDelta = 0;
                int minGX = GridSize, minGY = GridSize, maxGX = -1, maxGY = -1;

                for (int gy = 0; gy < GridSize; gy++)
                {
                    for (int gx = 0; gx < GridSize; gx++)
                    {
                        int idx = gy * GridSize + gx;
                        int diff = Math.Abs(currentSig[idx] - prevSig[idx]);
                        totalDelta += diff;
                        if (diff >= 10)
                        {
                            changedCells++;
                            if (gx < minGX) minGX = gx;
                            if (gy < minGY) minGY = gy;
                            if (gx > maxGX) maxGX = gx;
                            if (gy > maxGY) maxGY = gy;
                        }
                    }
                }

                changeScore = (double)changedCells / currentSig.Length;
                meanDelta = (double)totalDelta / (currentSig.Length * 255.0);
                meaningfulChange = changeScore >= 0.025 || meanDelta >= 0.015;

                if (maxGX >= minGX && maxGY >= minGY)
                {
                    int rx = captureRect.X + (minGX * captureRect.Width) / GridSize;
                    int ry = captureRect.Y + (minGY * captureRect.Height) / GridSize;
                    int rw = Math.Max(16, ((maxGX - minGX + 1) * captureRect.Width) / GridSize);
                    int rh = Math.Max(16, ((maxGY - minGY + 1) * captureRect.Height) / GridSize);
                    changedBounds = new Dictionary<string, object>
                    {
                        { "x", rx },
                        { "y", ry },
                        { "width", rw },
                        { "height", rh }
                    };
                }
            }

            if (currentSig != null)
            {
                _lastGlobalSignature = currentSig;
                _lastGlobalHash = currentHash;
                if (hwnd != 0) _windowSignatures[hwnd] = currentSig;
            }

            return new Dictionary<string, object>
            {
                { "screen_changed", meaningfulChange },
                { "change_score", Math.Round(changeScore, 4) },
                { "mean_pixel_delta", Math.Round(meanDelta, 4) },
                { "hash", currentHash },
                { "changed_region", changedBounds }
            };
        }

        private static Dictionary<string, object> CmdScreenshot(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            long targetHwnd = GetLong(req, "hwnd", 0);
            Dictionary<string, object> cropRectDict = null;
            if (req.ContainsKey("crop_rect") && req["crop_rect"] is Dictionary<string, object>)
            {
                cropRectDict = (Dictionary<string, object>)req["crop_rect"];
            }

            int maxWidth = GetInt(req, "max_width", 1280);
            string format = GetString(req, "format", "jpeg").ToLowerInvariant();
            long quality = GetInt(req, "quality", 82);
            string savePath = GetString(req, "save_path", "");
            bool includeBase64 = GetBool(req, "include_base64", true);
            bool runOcr = GetBool(req, "include_ocr", false);

            Rectangle actualRect;
            using (Bitmap rawBmp = CaptureScreenRegionBitmap(targetHwnd, cropRectDict, out actualRect))
            {
                var diffInfo = CompareAndRecordSignature(targetHwnd, rawBmp, actualRect);

                Dictionary<string, object> ocrData = null;
                if (runOcr)
                {
                    ocrData = ExtractTextWithLocalOcr(rawBmp, actualRect, "");
                }

                int capW = actualRect.Width;
                int capH = actualRect.Height;
                int outW = capW;
                int outH = capH;
                if (maxWidth > 0 && capW > maxWidth)
                {
                    double scale = (double)maxWidth / capW;
                    outW = maxWidth;
                    outH = Math.Max(1, (int)Math.Round(capH * scale));
                }

                using (Bitmap finalBmp = (outW == capW && outH == capH)
                    ? new Bitmap(rawBmp)
                    : ResizeBitmap(rawBmp, outW, outH))
                {
                    using (MemoryStream ms = new MemoryStream())
                    {
                        if (format == "png")
                        {
                            finalBmp.Save(ms, ImageFormat.Png);
                        }
                        else
                        {
                            ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
                            if (jpgEncoder != null)
                            {
                                EncoderParameters encParams = new EncoderParameters(1);
                                encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                                finalBmp.Save(ms, jpgEncoder, encParams);
                            }
                            else
                            {
                                finalBmp.Save(ms, ImageFormat.Jpeg);
                            }
                        }

                        byte[] bytes = ms.ToArray();
                        if (!string.IsNullOrEmpty(savePath))
                        {
                            try
                            {
                                string dir = Path.GetDirectoryName(savePath);
                                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                                {
                                    Directory.CreateDirectory(dir);
                                }
                                File.WriteAllBytes(savePath, bytes);
                            }
                            catch { }
                        }

                        sw.Stop();
                        var res = new Dictionary<string, object>
                        {
                            { "success", true },
                            { "base64", includeBase64 ? Convert.ToBase64String(bytes) : null },
                            { "format", format },
                            { "byte_length", bytes.Length },
                            { "saved_path", string.IsNullOrEmpty(savePath) ? null : savePath },
                            { "elapsed_ms", sw.ElapsedMilliseconds },
                            { "comparison", diffInfo },
                            { "screen_changed", diffInfo["screen_changed"] },
                            { "change_score", diffInfo["change_score"] },
                            { "hash", diffInfo["hash"] },
                            { "capture_rect", new Dictionary<string, object>
                                {
                                    { "x", actualRect.X },
                                    { "y", actualRect.Y },
                                    { "width", actualRect.Width },
                                    { "height", actualRect.Height }
                                }
                            },
                            { "image_size", new Dictionary<string, object>
                                {
                                    { "width", outW },
                                    { "height", outH }
                                }
                            }
                        };

                        if (ocrData != null) res["ocr"] = ocrData;
                        return res;
                    }
                }
            }
        }

        private static Dictionary<string, object> CmdCompareScreenshots(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            long targetHwnd = GetLong(req, "hwnd", 0);
            Dictionary<string, object> cropRectDict = null;
            if (req.ContainsKey("crop_rect") && req["crop_rect"] is Dictionary<string, object>)
            {
                cropRectDict = (Dictionary<string, object>)req["crop_rect"];
            }

            Rectangle actualRect;
            using (Bitmap rawBmp = CaptureScreenRegionBitmap(targetHwnd, cropRectDict, out actualRect))
            {
                var diffInfo = CompareAndRecordSignature(targetHwnd, rawBmp, actualRect);
                sw.Stop();
                diffInfo["success"] = true;
                diffInfo["elapsed_ms"] = sw.ElapsedMilliseconds;
                diffInfo["capture_rect"] = new Dictionary<string, object>
                {
                    { "x", actualRect.X },
                    { "y", actualRect.Y },
                    { "width", actualRect.Width },
                    { "height", actualRect.Height }
                };
                return diffInfo;
            }
        }

        // --- Local Windows OCR (WinRT Windows.Media.Ocr.OcrEngine via Reflection) ---

        private static object GetOrInitWinRtOcrEngine()
        {
            if (_cachedOcrEngine != null) return _cachedOcrEngine;
            if (_ocrInitAttempted) return null;
            _ocrInitAttempted = true;

            try
            {
                Type ocrEngineType = Type.GetType("Windows.Media.Ocr.OcrEngine, Windows.Media, ContentType=WindowsRuntime");
                if (ocrEngineType == null)
                {
                    _ocrInitError = "Windows.Media.Ocr.OcrEngine type not available on this OS.";
                    return null;
                }

                MethodInfo tryCreateMethod = ocrEngineType.GetMethod("TryCreateFromUserProfileLanguages", BindingFlags.Public | BindingFlags.Static);
                if (tryCreateMethod != null)
                {
                    _cachedOcrEngine = tryCreateMethod.Invoke(null, null);
                }
            }
            catch (Exception ex)
            {
                _ocrInitError = ex.Message;
            }

            return _cachedOcrEngine;
        }

        private static object AwaitWinRtAsyncOperation(object asyncOp, Type asyncOpReturnType, int timeoutMs)
        {
            if (asyncOp == null) return null;
            Type asyncInfoType = Type.GetType("Windows.Foundation.IAsyncInfo, Windows.Foundation, ContentType=WindowsRuntime");
            PropertyInfo statusProp = asyncInfoType != null ? asyncInfoType.GetProperty("Status") : null;

            Stopwatch sw = Stopwatch.StartNew();
            while (sw.ElapsedMilliseconds < timeoutMs)
            {
                if (statusProp != null)
                {
                    object statusVal = statusProp.GetValue(asyncOp, null);
                    int statusInt = Convert.ToInt32(statusVal);
                    if (statusInt == 1) break; // Completed
                    if (statusInt == 2 || statusInt == 3) // Canceled or Error
                    {
                        throw new Exception("WinRT async operation failed with status " + statusInt);
                    }
                }
                Thread.Sleep(2);
            }

            MethodInfo getResults = asyncOpReturnType != null ? asyncOpReturnType.GetMethod("GetResults") : null;
            if (getResults == null)
            {
                getResults = asyncOp.GetType().GetMethod("GetResults");
            }

            return getResults != null ? getResults.Invoke(asyncOp, null) : null;
        }

        private static Dictionary<string, object> ExtractTextWithLocalOcr(Bitmap bmp, Rectangle screenOriginRect, string query)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                object ocrEngine = GetOrInitWinRtOcrEngine();
                if (ocrEngine == null)
                {
                    sw.Stop();
                    return new Dictionary<string, object>
                    {
                        { "success", false },
                        { "elapsed_ms", sw.ElapsedMilliseconds },
                        { "error", _ocrInitError ?? "Windows.Media.Ocr.OcrEngine unavailable" }
                    };
                }

                Type ocrEngineType = Type.GetType("Windows.Media.Ocr.OcrEngine, Windows.Media, ContentType=WindowsRuntime");
                Type ocrResultType = Type.GetType("Windows.Media.Ocr.OcrResult, Windows.Media, ContentType=WindowsRuntime");
                Type ocrLineType = Type.GetType("Windows.Media.Ocr.OcrLine, Windows.Media, ContentType=WindowsRuntime");
                Type ocrWordType = Type.GetType("Windows.Media.Ocr.OcrWord, Windows.Media, ContentType=WindowsRuntime");
                Type decoderType = Type.GetType("Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime");

                Assembly winRtAssm = Assembly.Load("System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089");
                Type streamExtType = winRtAssm.GetType("System.IO.WindowsRuntimeStreamExtensions");
                MethodInfo asRasMethod = streamExtType.GetMethod("AsRandomAccessStream", new Type[] { typeof(Stream) });

                using (MemoryStream ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Bmp);
                    ms.Position = 0;

                    object ras = asRasMethod.Invoke(null, new object[] { ms });
                    MethodInfo createAsyncMethod = null;
                    foreach (MethodInfo m in decoderType.GetMethods(BindingFlags.Public | BindingFlags.Static))
                    {
                        if (m.Name == "CreateAsync" && m.GetParameters().Length == 1)
                        {
                            createAsyncMethod = m;
                            break;
                        }
                    }

                    object decoderOp = createAsyncMethod.Invoke(null, new object[] { ras });
                    object decoder = AwaitWinRtAsyncOperation(decoderOp, createAsyncMethod.ReturnType, 1500);

                    MethodInfo getSoftBmpMethod = decoderType.GetMethod("GetSoftwareBitmapAsync", new Type[0]);
                    object softBmpOp = getSoftBmpMethod.Invoke(decoder, null);
                    object softwareBitmap = AwaitWinRtAsyncOperation(softBmpOp, getSoftBmpMethod.ReturnType, 1500);

                    MethodInfo recognizeMethod = ocrEngineType.GetMethod("RecognizeAsync");
                    object ocrOp = recognizeMethod.Invoke(ocrEngine, new object[] { softwareBitmap });
                    object ocrResult = AwaitWinRtAsyncOperation(ocrOp, recognizeMethod.ReturnType, 2500);

                    string fullText = "";
                    PropertyInfo textProp = ocrResultType.GetProperty("Text");
                    if (textProp != null) fullText = (textProp.GetValue(ocrResult, null) ?? "").ToString();

                    var linesList = new List<Dictionary<string, object>>();
                    Dictionary<string, object> bestMatch = null;
                    double bestScore = 0;

                    PropertyInfo linesProp = ocrResultType.GetProperty("Lines");
                    PropertyInfo lTextProp = ocrLineType.GetProperty("Text");
                    PropertyInfo lWordsProp = ocrLineType.GetProperty("Words");
                    PropertyInfo wTextProp = ocrWordType.GetProperty("Text");
                    PropertyInfo wRectProp = ocrWordType.GetProperty("BoundingRect");

                    IEnumerable linesEnum = linesProp != null ? (IEnumerable)linesProp.GetValue(ocrResult, null) : null;

                    if (linesEnum != null)
                    {
                        foreach (object lineObj in linesEnum)
                        {
                            if (lineObj == null) continue;
                            string lineText = lTextProp != null ? (lTextProp.GetValue(lineObj, null) ?? "").ToString().Trim() : "";
                            if (string.IsNullOrEmpty(lineText)) continue;

                            int minX = int.MaxValue, minY = int.MaxValue, maxX = int.MinValue, maxY = int.MinValue;
                            var wordsList = new List<Dictionary<string, object>>();

                            IEnumerable wordsEnum = lWordsProp != null ? (IEnumerable)lWordsProp.GetValue(lineObj, null) : null;
                            if (wordsEnum != null)
                            {
                                foreach (object wordObj in wordsEnum)
                                {
                                    if (wordObj == null) continue;
                                    string wText = wTextProp != null ? (wTextProp.GetValue(wordObj, null) ?? "").ToString().Trim() : "";
                                    object wRect = wRectProp != null ? wRectProp.GetValue(wordObj, null) : null;

                                    if (wRect != null)
                                    {
                                        Type rectType = wRect.GetType();
                                        double rx = GetRectFieldOrProp(wRect, rectType, "X", "_x");
                                        double ry = GetRectFieldOrProp(wRect, rectType, "Y", "_y");
                                        double rw = GetRectFieldOrProp(wRect, rectType, "Width", "_width");
                                        double rh = GetRectFieldOrProp(wRect, rectType, "Height", "_height");

                                        int sx = screenOriginRect.X + (int)Math.Round(rx);
                                        int sy = screenOriginRect.Y + (int)Math.Round(ry);
                                        int swW = Math.Max(4, (int)Math.Round(rw));
                                        int shH = Math.Max(4, (int)Math.Round(rh));

                                        if (sx < minX) minX = sx;
                                        if (sy < minY) minY = sy;
                                        if (sx + swW > maxX) maxX = sx + swW;
                                        if (sy + shH > maxY) maxY = sy + shH;

                                        int wcx = sx + swW / 2;
                                        int wcy = sy + shH / 2;

                                        double wScore = !string.IsNullOrEmpty(query)
                                            ? ScoreUiaElement(query, wText, "", "", "Text", true)
                                            : 0;

                                        var wDict = new Dictionary<string, object>
                                        {
                                            { "text", wText },
                                            { "x", wcx },
                                            { "y", wcy },
                                            { "rect", new Dictionary<string, object> { { "x", sx }, { "y", sy }, { "width", swW }, { "height", shH } } },
                                            { "score", Math.Round(wScore, 3) }
                                        };
                                        wordsList.Add(wDict);

                                        if (wScore > bestScore && wScore >= 0.72)
                                        {
                                            bestScore = wScore;
                                            bestMatch = new Dictionary<string, object>
                                            {
                                                { "text", wText },
                                                { "x", wcx },
                                                { "y", wcy },
                                                { "rect", wDict["rect"] },
                                                { "score", Math.Round(wScore, 3) },
                                                { "match_level", "word" }
                                            };
                                        }
                                    }
                                }
                            }

                            if (minX != int.MaxValue && maxX > minX)
                            {
                                int lw = maxX - minX;
                                int lh = maxY - minY;
                                int lcx = minX + lw / 2;
                                int lcy = minY + lh / 2;

                                double lScore = !string.IsNullOrEmpty(query)
                                    ? ScoreUiaElement(query, lineText, "", "", "Text", true)
                                    : 0;

                                var lineRect = new Dictionary<string, object>
                                {
                                    { "x", minX },
                                    { "y", minY },
                                    { "width", lw },
                                    { "height", lh }
                                };

                                linesList.Add(new Dictionary<string, object>
                                {
                                    { "text", lineText },
                                    { "x", lcx },
                                    { "y", lcy },
                                    { "rect", lineRect },
                                    { "score", Math.Round(lScore, 3) },
                                    { "words", wordsList }
                                });

                                if (lScore >= bestScore && lScore >= 0.68)
                                {
                                    bestScore = lScore;
                                    bestMatch = new Dictionary<string, object>
                                    {
                                        { "text", lineText },
                                        { "x", lcx },
                                        { "y", lcy },
                                        { "rect", lineRect },
                                        { "score", Math.Round(lScore, 3) },
                                        { "match_level", "line" }
                                    };
                                }
                            }
                        }
                    }

                    sw.Stop();
                    return new Dictionary<string, object>
                    {
                        { "success", true },
                        { "elapsed_ms", sw.ElapsedMilliseconds },
                        { "text", fullText },
                        { "line_count", linesList.Count },
                        { "lines", linesList },
                        { "best_match", bestMatch }
                    };
                }
            }
            catch (Exception ex)
            {
                sw.Stop();
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "elapsed_ms", sw.ElapsedMilliseconds },
                    { "error", "Local OCR error: " + ex.Message }
                };
            }
        }

        private static double GetRectFieldOrProp(object rectObj, Type rectType, string propName, string fieldName)
        {
            PropertyInfo pi = rectType.GetProperty(propName);
            if (pi != null) return Convert.ToDouble(pi.GetValue(rectObj, null));
            FieldInfo fi = rectType.GetField(fieldName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (fi != null) return Convert.ToDouble(fi.GetValue(rectObj));
            FieldInfo fiPub = rectType.GetField(propName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            if (fiPub != null) return Convert.ToDouble(fiPub.GetValue(rectObj));
            return 0.0;
        }

        private static Dictionary<string, object> CmdOcr(Dictionary<string, object> req)
        {
            long targetHwnd = GetLong(req, "hwnd", 0);
            string query = GetString(req, "query", "").Trim();
            Dictionary<string, object> cropRectDict = null;
            if (req.ContainsKey("crop_rect") && req["crop_rect"] is Dictionary<string, object>)
            {
                cropRectDict = (Dictionary<string, object>)req["crop_rect"];
            }

            Rectangle actualRect;
            using (Bitmap rawBmp = CaptureScreenRegionBitmap(targetHwnd, cropRectDict, out actualRect))
            {
                var ocrRes = ExtractTextWithLocalOcr(rawBmp, actualRect, query);
                ocrRes["capture_rect"] = new Dictionary<string, object>
                {
                    { "x", actualRect.X },
                    { "y", actualRect.Y },
                    { "width", actualRect.Width },
                    { "height", actualRect.Height }
                };
                return ocrRes;
            }
        }

        private static Dictionary<string, object> CmdGetScreenState(Dictionary<string, object> req)
        {
            Stopwatch totalSw = Stopwatch.StartNew();
            long targetHwnd = GetLong(req, "hwnd", 0);
            string query = GetString(req, "query", "").Trim();
            bool includeOcr = GetBool(req, "include_ocr", true);
            int maxUiaElements = GetInt(req, "max_elements", 80);

            IntPtr hWnd = GetEffectiveTargetWindowHandle(targetHwnd);
            var winInfo = GetWindowInfoByHandle(hWnd);

            // 1. UIA Lookup
            Stopwatch uiaSw = Stopwatch.StartNew();
            var uiaRes = CmdUiaInspect(new Dictionary<string, object>
            {
                { "hwnd", hWnd != IntPtr.Zero ? hWnd.ToInt64() : 0 },
                { "query", query },
                { "max_elements", maxUiaElements },
                { "timeout_ms", 900 }
            });
            uiaSw.Stop();

            // 2. Capture relevant window region & compare screenshot signature
            Stopwatch shotSw = Stopwatch.StartNew();
            Rectangle actualRect;
            Dictionary<string, object> diffInfo = null;
            Dictionary<string, object> ocrInfo = null;
            long ocrMs = 0;
            string captureWarning = null;

            try
            {
                using (Bitmap rawBmp = CaptureScreenRegionBitmap(hWnd != IntPtr.Zero ? hWnd.ToInt64() : 0, null, out actualRect))
                {
                    diffInfo = CompareAndRecordSignature(hWnd != IntPtr.Zero ? hWnd.ToInt64() : 0, rawBmp, actualRect);
                    shotSw.Stop();

                    if (includeOcr)
                    {
                        Stopwatch ocrSw = Stopwatch.StartNew();
                        ocrInfo = ExtractTextWithLocalOcr(rawBmp, actualRect, query);
                        ocrSw.Stop();
                        ocrMs = ocrSw.ElapsedMilliseconds;
                    }
                }
            }
            catch (Exception capEx)
            {
                shotSw.Stop();
                captureWarning = capEx.Message;
            }

            // Build compact OCR summary (top lines) so Node.js gets compact screen state
            var compactOcrLines = new List<Dictionary<string, object>>();
            if (ocrInfo != null && GetBool(ocrInfo, "success", false) && ocrInfo.ContainsKey("lines") && ocrInfo["lines"] is IEnumerable)
            {
                int count = 0;
                foreach (var lObj in (IEnumerable)ocrInfo["lines"])
                {
                    if (count >= 45) break;
                    var ld = lObj as Dictionary<string, object>;
                    if (ld != null)
                    {
                        compactOcrLines.Add(new Dictionary<string, object>
                        {
                            { "text", ld["text"] },
                            { "x", ld["x"] },
                            { "y", ld["y"] },
                            { "rect", ld["rect"] }
                        });
                        count++;
                    }
                }
            }

            totalSw.Stop();
            return new Dictionary<string, object>
            {
                { "success", true },
                { "active_window", winInfo },
                { "capture_warning", captureWarning },
                { "screen_changed", diffInfo != null ? diffInfo["screen_changed"] : true },
                { "change_score", diffInfo != null ? diffInfo["change_score"] : 0.0 },
                { "screen_hash", diffInfo != null ? diffInfo["hash"] : "" },
                { "changed_region", diffInfo != null ? diffInfo["changed_region"] : null },
                { "uia_element_count", uiaRes != null && uiaRes.ContainsKey("element_count") ? uiaRes["element_count"] : 0 },
                { "uia_best_match", uiaRes != null && uiaRes.ContainsKey("best_match") ? uiaRes["best_match"] : null },
                { "uia_elements", uiaRes != null && uiaRes.ContainsKey("elements") ? uiaRes["elements"] : new List<object>() },
                { "ocr_best_match", ocrInfo != null && ocrInfo.ContainsKey("best_match") ? ocrInfo["best_match"] : null },
                { "ocr_lines", compactOcrLines },
                { "timings_ms", new Dictionary<string, object>
                    {
                        { "uia_lookup_ms", uiaSw.ElapsedMilliseconds },
                        { "screenshot_capture_ms", shotSw.ElapsedMilliseconds },
                        { "ocr_ms", ocrMs },
                        { "total_ms", totalSw.ElapsedMilliseconds }
                    }
                }
            };
        }

        private static Bitmap ResizeBitmap(Bitmap src, int width, int height)
        {
            Bitmap dst = new Bitmap(width, height, PixelFormat.Format24bppRgb);
            using (Graphics g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(src, 0, 0, width, height);
            }
            return dst;
        }

        private static ImageCodecInfo GetEncoder(ImageFormat format)
        {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
            foreach (ImageCodecInfo codec in codecs)
            {
                if (codec.FormatID == format.Guid) return codec;
            }
            return null;
        }

        // --- Windows UI Automation: Enumeration, Control Text Reading, Enabled State & Direct Control Invocation ---

        private static void WakeBrowserAccessibility(IntPtr rootHwnd)
        {
            if (rootHwnd == IntPtr.Zero) return;
            long key = rootHwnd.ToInt64();
            lock (_uiaCacheLock)
            {
                if (_wokenBrowserHwnds.Contains(key)) return;
                _wokenBrowserHwnds.Add(key);
            }

            try
            {
                EnumChildWindows(rootHwnd, (childHwnd, lParam) =>
                {
                    StringBuilder sbClass = new StringBuilder(128);
                    GetClassName(childHwnd, sbClass, sbClass.Capacity);
                    string cls = sbClass.ToString();
                    if (cls.Contains("Chrome_RenderWidgetHostHWND"))
                    {
                        IntPtr res;
                        SendMessageTimeout(childHwnd, WM_GETOBJECT, IntPtr.Zero, new IntPtr(unchecked((int)0xFFFFFFFC)), SMTO_ABORTIFHUNG, 120, out res);
                    }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
        }

        private class UiaScannedNode
        {
            public int Index;
            public AutomationElement Element;
            public Dictionary<string, object> Data;
            public double Score;
        }

        private static void InvalidateUiaCache()
        {
            lock (_uiaCacheLock)
            {
                _cachedUiaHwnd = 0;
                _cachedUiaTickMs = 0;
                _cachedUiaNodes = null;
            }
        }

        private static List<UiaScannedNode> GetOrScanUiaTree(IntPtr targetHwnd, string query, string roleFilter, int maxElements, int timeoutMs, bool allowCache, out int visitedNodes)
        {
            long hwndKey = targetHwnd != IntPtr.Zero ? targetHwnd.ToInt64() : -1;
            long nowTicks = Environment.TickCount & int.MaxValue;
            List<UiaScannedNode> rawNodes = null;

            if (allowCache && string.IsNullOrEmpty(roleFilter))
            {
                lock (_uiaCacheLock)
                {
                    if (_cachedUiaNodes != null && _cachedUiaHwnd == hwndKey && Math.Abs(nowTicks - _cachedUiaTickMs) <= 1800)
                    {
                        rawNodes = _cachedUiaNodes;
                    }
                }
            }

            if (rawNodes != null)
            {
                visitedNodes = rawNodes.Count;
                var scored = new List<UiaScannedNode>(rawNodes.Count);
                foreach (var n in rawNodes)
                {
                    var dataCopy = new Dictionary<string, object>(n.Data);
                    double s = ScoreUiaElement(
                        query,
                        GetString(dataCopy, "name", ""),
                        GetString(dataCopy, "automation_id", ""),
                        GetString(dataCopy, "text", GetString(dataCopy, "help_text", "")),
                        GetString(dataCopy, "role", ""),
                        GetBool(dataCopy, "is_interactive", true)
                    );
                    dataCopy["score"] = Math.Round(s, 3);
                    scored.Add(new UiaScannedNode
                    {
                        Index = n.Index,
                        Element = n.Element,
                        Data = dataCopy,
                        Score = s
                    });
                }
                return scored;
            }

            // Always scan up to 360 elements internally so controls in the lower half of the window (like Calculator keypad or bottom bars) are never cut off
            int internalScanLimit = Math.Max(maxElements, 360);
            List<UiaScannedNode> fresh = ScanUiaTree(targetHwnd, query, roleFilter, internalScanLimit, timeoutMs, out visitedNodes);
            if (string.IsNullOrEmpty(roleFilter) && fresh.Count > 0)
            {
                lock (_uiaCacheLock)
                {
                    _cachedUiaHwnd = hwndKey;
                    _cachedUiaTickMs = Environment.TickCount & int.MaxValue;
                    _cachedUiaNodes = fresh;
                }
            }
            return fresh;
        }

        private static List<UiaScannedNode> ScanUiaTree(IntPtr targetHwnd, string query, string roleFilter, int maxElements, int timeoutMs, out int visitedNodes)
        {
            visitedNodes = 0;
            var results = new List<UiaScannedNode>();
            Stopwatch sw = Stopwatch.StartNew();
            int scanLimit = Math.Max(maxElements, 360);

            if (targetHwnd != IntPtr.Zero)
            {
                WakeBrowserAccessibility(targetHwnd);
            }

            AutomationElement rootEl;
            try
            {
                rootEl = targetHwnd != IntPtr.Zero
                    ? AutomationElement.FromHandle(targetHwnd)
                    : AutomationElement.RootElement;
            }
            catch
            {
                return results;
            }

            if (rootEl == null) return results;

            Rectangle vScreen = SystemInformation.VirtualScreen;
            var queue = new Queue<KeyValuePair<AutomationElement, int>>();
            queue.Enqueue(new KeyValuePair<AutomationElement, int>(rootEl, 0));
            TreeWalker walker = TreeWalker.ControlViewWalker;

            string normRoleFilter = (roleFilter ?? "").Trim().ToLowerInvariant();

            while (queue.Count > 0 && results.Count < scanLimit && sw.ElapsedMilliseconds < timeoutMs && visitedNodes < 1500)
            {
                var currentPair = queue.Dequeue();
                AutomationElement el = currentPair.Key;
                int depth = currentPair.Value;
                visitedNodes++;

                if (depth > 0)
                {
                    try
                    {
                        var cur = el.Current;
                        if (!cur.IsOffscreen)
                        {
                            System.Windows.Rect br = cur.BoundingRectangle;
                            if (!br.IsEmpty && !double.IsInfinity(br.Width) && !double.IsInfinity(br.Height) && br.Width >= 5 && br.Height >= 5)
                            {
                                int x = (int)Math.Round(br.Left);
                                int y = (int)Math.Round(br.Top);
                                int w = (int)Math.Round(br.Width);
                                int h = (int)Math.Round(br.Height);

                                if (x + w > vScreen.Left && x < vScreen.Right && y + h > vScreen.Top && y < vScreen.Bottom)
                                {
                                    string name = (cur.Name ?? "").Trim();
                                    string autoId = (cur.AutomationId ?? "").Trim();
                                    string helpText = (cur.HelpText ?? "").Trim();
                                    string ctrlType = cur.ControlType != null ? cur.ControlType.ProgrammaticName.Replace("ControlType.", "") : "Unknown";
                                    string localizedRole = (cur.LocalizedControlType ?? ctrlType).Trim();
                                    string className = (cur.ClassName ?? "").Trim();
                                    bool isEnabled = cur.IsEnabled;
                                    bool isFocusable = cur.IsKeyboardFocusable;
                                    bool hasFocus = cur.HasKeyboardFocus;

                                    if (!string.IsNullOrEmpty(normRoleFilter) &&
                                        ctrlType.ToLowerInvariant() != normRoleFilter &&
                                        localizedRole.ToLowerInvariant() != normRoleFilter)
                                    {
                                        // Still walk children below
                                    }
                                    else
                                    {
                                        // Check supported UIA patterns & read visible control text
                                        var supportedPatterns = new List<string>();
                                        string controlText = "";
                                        string toggleState = null;
                                        bool? isSelected = null;
                                        string expandState = null;

                                        object patObj;
                                        if (el.TryGetCurrentPattern(InvokePattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("Invoke");
                                        }
                                        if (el.TryGetCurrentPattern(ValuePattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("Value");
                                            try { controlText = (((ValuePattern)patObj).Current.Value ?? "").Trim(); } catch { }
                                        }
                                        if (el.TryGetCurrentPattern(TextPattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("Text");
                                            if (string.IsNullOrEmpty(controlText))
                                            {
                                                try { controlText = (((TextPattern)patObj).DocumentRange.GetText(240) ?? "").Trim(); } catch { }
                                            }
                                        }
                                        if (el.TryGetCurrentPattern(TogglePattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("Toggle");
                                            try { toggleState = ((TogglePattern)patObj).Current.ToggleState.ToString(); } catch { }
                                        }
                                        if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("SelectionItem");
                                            try { isSelected = ((SelectionItemPattern)patObj).Current.IsSelected; } catch { }
                                        }
                                        if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out patObj) && patObj != null)
                                        {
                                            supportedPatterns.Add("ExpandCollapse");
                                            try { expandState = ((ExpandCollapsePattern)patObj).Current.ExpandCollapseState.ToString(); } catch { }
                                        }

                                        if (string.IsNullOrEmpty(controlText))
                                        {
                                            controlText = !string.IsNullOrEmpty(name) ? name : helpText;
                                        }

                                        bool isInteractive =
                                            supportedPatterns.Count > 0 ||
                                            ctrlType == "Button" ||
                                            ctrlType == "Hyperlink" ||
                                            ctrlType == "Edit" ||
                                            ctrlType == "ComboBox" ||
                                            ctrlType == "CheckBox" ||
                                            ctrlType == "RadioButton" ||
                                            ctrlType == "MenuItem" ||
                                            ctrlType == "TabItem" ||
                                            ctrlType == "ListItem" ||
                                            ctrlType == "TreeItem" ||
                                            ctrlType == "Slider" ||
                                            ctrlType == "SplitButton";

                                        if (!string.IsNullOrEmpty(name) || !string.IsNullOrEmpty(autoId) || !string.IsNullOrEmpty(helpText) || !string.IsNullOrEmpty(controlText) || ctrlType == "Edit")
                                        {
                                            if (name.Length > 140) name = name.Substring(0, 140);
                                            if (controlText.Length > 200) controlText = controlText.Substring(0, 200);

                                            int cx = x + w / 2;
                                            int cy = y + h / 2;

                                            double matchScore = ScoreUiaElement(query, name, autoId, string.IsNullOrEmpty(controlText) ? helpText : controlText, ctrlType, isInteractive);
                                            int idx = results.Count;

                                            var elDict = new Dictionary<string, object>
                                            {
                                                { "index", idx },
                                                { "name", name },
                                                { "role", ctrlType },
                                                { "control_type", ctrlType },
                                                { "localized_role", localizedRole },
                                                { "automation_id", autoId },
                                                { "help_text", helpText },
                                                { "text", controlText },
                                                { "class_name", className },
                                                { "is_enabled", isEnabled },
                                                { "is_interactive", isInteractive },
                                                { "is_focusable", isFocusable },
                                                { "has_focus", hasFocus },
                                                { "toggle_state", toggleState },
                                                { "is_selected", isSelected },
                                                { "expand_state", expandState },
                                                { "patterns", supportedPatterns },
                                                { "x", cx },
                                                { "y", cy },
                                                { "rect", new Dictionary<string, object>
                                                    {
                                                        { "x", x },
                                                        { "y", y },
                                                        { "width", w },
                                                        { "height", h }
                                                    }
                                                },
                                                { "score", Math.Round(matchScore, 3) }
                                            };

                                            results.Add(new UiaScannedNode
                                            {
                                                Index = idx,
                                                Element = el,
                                                Data = elDict,
                                                Score = matchScore
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }

                if (depth < 14 && sw.ElapsedMilliseconds < timeoutMs)
                {
                    try
                    {
                        AutomationElement child = walker.GetFirstChild(el);
                        int childCount = 0;
                        while (child != null && childCount < 85 && sw.ElapsedMilliseconds < timeoutMs)
                        {
                            queue.Enqueue(new KeyValuePair<AutomationElement, int>(child, depth + 1));
                            childCount++;
                            child = walker.GetNextSibling(child);
                        }
                    }
                    catch { }
                }
            }

            return results;
        }

        private static Dictionary<string, object> CmdUiaInspect(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            long hwndVal = GetLong(req, "hwnd", 0);
            string query = GetString(req, "query", "").Trim();
            string roleFilter = GetString(req, "role", "").Trim();
            int maxElements = Math.Max(10, Math.Min(400, GetInt(req, "max_elements", 180)));
            int timeoutMs = Math.Max(250, Math.Min(4000, GetInt(req, "timeout_ms", 1400)));

            IntPtr targetHwnd = GetEffectiveTargetWindowHandle(hwndVal);

            bool allowCache = GetBool(req, "use_cache", false);
            int visited;
            List<UiaScannedNode> scanned = GetOrScanUiaTree(targetHwnd, query, roleFilter, maxElements, timeoutMs, allowCache, out visited);

            Dictionary<string, object> bestMatch = null;
            double topScore = 0;

            foreach (var node in scanned)
            {
                if (!string.IsNullOrEmpty(query) && node.Score > topScore)
                {
                    topScore = node.Score;
                    bestMatch = node.Data;
                }
            }

            if (topScore < 0.62) bestMatch = null;

            // Prioritize interactive controls and high-scoring matches if trimming to maxElements
            var orderedNodes = new List<UiaScannedNode>(scanned);
            if (orderedNodes.Count > maxElements)
            {
                orderedNodes.Sort((a, b) =>
                {
                    int scoreCmp = b.Score.CompareTo(a.Score);
                    if (scoreCmp != 0) return scoreCmp;
                    bool aInt = GetBool(a.Data, "is_interactive", false) || GetString(a.Data, "automation_id", "") == "CalculatorResults";
                    bool bInt = GetBool(b.Data, "is_interactive", false) || GetString(b.Data, "automation_id", "") == "CalculatorResults";
                    if (aInt != bInt) return bInt.CompareTo(aInt);
                    return a.Index.CompareTo(b.Index);
                });
            }

            var elements = new List<Dictionary<string, object>>(Math.Min(maxElements, orderedNodes.Count));
            for (int i = 0; i < orderedNodes.Count && i < maxElements; i++)
            {
                elements.Add(orderedNodes[i].Data);
            }

            sw.Stop();
            return new Dictionary<string, object>
            {
                { "success", true },
                { "hwnd", targetHwnd.ToInt64() },
                { "active_window", GetWindowInfoByHandle(targetHwnd) },
                { "elapsed_ms", sw.ElapsedMilliseconds },
                { "visited_nodes", visited },
                { "element_count", scanned.Count },
                { "returned_count", elements.Count },
                { "best_match", bestMatch },
                { "elements", elements }
            };
        }

        // Direct Semantic UIA Control Invocation (InvokePattern, ValuePattern, TogglePattern, SelectionItemPattern, ExpandCollapsePattern)
        private static Dictionary<string, object> CmdUiaAction(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            try
            {
                long hwndVal = GetLong(req, "hwnd", GetLong(req, "expected_hwnd", 0));
                IntPtr targetHwnd = GetEffectiveTargetWindowHandle(hwndVal);
                string uiaOp = GetString(req, "uia_operation", GetString(req, "action", "invoke")).ToLowerInvariant();
                string query = GetString(req, "target", GetString(req, "query", "")).Trim();
                string roleFilter = GetString(req, "role", GetString(req, "control_type", "")).Trim();
                string autoIdQuery = GetString(req, "automation_id", "").Trim();
                int uiaId = GetInt(req, "uia_id", GetInt(req, "index", -1));
                string textToSet = GetString(req, "text", "");
                bool clearFirst = GetBool(req, "clear_first", false);
                bool pressEnter = GetBool(req, "press_enter", false);
                int timeoutMs = GetInt(req, "timeout_ms", 1200);

                int visited;
                List<UiaScannedNode> nodes = GetOrScanUiaTree(targetHwnd, query, roleFilter, 360, timeoutMs, true, out visited);
                UiaScannedNode matched = null;
                var winInfo = GetWindowInfoByHandle(targetHwnd);

                // If target window is Calculator and query is a multi-digit number or math expression (e.g. "25" or "5+5="), invoke sequence directly
                if (uiaId < 0 && string.IsNullOrEmpty(autoIdQuery) && !string.IsNullOrEmpty(query) && query.Length > 1 && IsCalculatorWindow(winInfo))
                {
                    bool allCalcChars = true;
                    foreach (char ch in query)
                    {
                        if (!char.IsWhiteSpace(ch) && MapCalculatorCharToAutomationId(ch) == null)
                        {
                            allCalcChars = false;
                            break;
                        }
                    }
                    if (allCalcChars)
                    {
                        List<string> invokedBtns;
                        string calcDisp;
                        if (TryExecuteCalculatorSequenceViaUia(targetHwnd, query, clearFirst, pressEnter, out invokedBtns, out calcDisp))
                        {
                            sw.Stop();
                            return BuildActionResult(
                                true,
                                "uia_invoke",
                                winInfo,
                                null,
                                sw.ElapsedMilliseconds,
                                new Dictionary<string, object>
                                {
                                    { "uia_pattern", "InvokePattern(CalculatorSequence)" },
                                    { "control_enabled", true },
                                    { "direct_invocation", true },
                                    { "invoked_buttons", invokedBtns },
                                    { "calculator_display", calcDisp }
                                },
                                new Dictionary<string, object>
                                {
                                    { "target", query },
                                    { "matched_label", string.Join(", ", invokedBtns.ToArray()) },
                                    { "role", "Button" },
                                    { "uia_pattern", "InvokePattern" },
                                    { "detection_method", "uia_pattern_invoke" },
                                    { "calculator_display", calcDisp }
                                }
                            );
                        }
                    }
                }

                if (uiaId >= 0 && uiaId < nodes.Count)
                {
                    matched = nodes[uiaId];
                }
                else if (!string.IsNullOrEmpty(autoIdQuery))
                {
                    foreach (var n in nodes)
                    {
                        if (string.Equals(GetString(n.Data, "automation_id", ""), autoIdQuery, StringComparison.OrdinalIgnoreCase))
                        {
                            matched = n;
                            break;
                        }
                    }
                }

                if (matched == null && !string.IsNullOrEmpty(query))
                {
                    double bestScore = 0;
                    foreach (var n in nodes)
                    {
                        if (n.Score > bestScore)
                        {
                            bestScore = n.Score;
                            matched = n;
                        }
                    }
                    if (bestScore < 0.72) matched = null;
                }

                if (matched == null || matched.Element == null)
                {
                    sw.Stop();
                    return BuildActionResult(
                        false,
                        "uia_action",
                        GetWindowInfoByHandle(targetHwnd),
                        string.Format("UIA element matching '{0}' not found in accessibility tree.", !string.IsNullOrEmpty(query) ? query : autoIdQuery),
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object> { { "uia_found", false }, { "visited_nodes", visited } },
                        new Dictionary<string, object> { { "uia_found", false } }
                    );
                }

                AutomationElement el = matched.Element;
                string elName = GetString(matched.Data, "name", query);
                string elRole = GetString(matched.Data, "role", "Control");
                bool isEnabled = GetBool(matched.Data, "is_enabled", true);
                int cx = GetInt(matched.Data, "x", 0);
                int cy = GetInt(matched.Data, "y", 0);

                if (!isEnabled)
                {
                    sw.Stop();
                    return BuildActionResult(
                        false,
                        "uia_action",
                        GetWindowInfoByHandle(targetHwnd),
                        string.Format("Target UI Automation control '{0}' ({1}) is disabled (IsEnabled=false).", elName, elRole),
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object>
                        {
                            { "uia_found", true },
                            { "control_enabled", false },
                            { "element", matched.Data }
                        },
                        new Dictionary<string, object>
                        {
                            { "target_disabled", true },
                            { "element", matched.Data },
                            { "x", cx },
                            { "y", cy }
                        }
                    );
                }

                if (uiaOp == "set_value" || uiaOp == "type_text" || uiaOp == "type")
                {
                    bool setViaPattern = false;
                    string observedVal = null;
                    object vpObj;
                    if (!pressEnter && el.TryGetCurrentPattern(ValuePattern.Pattern, out vpObj) && vpObj != null)
                    {
                        try
                        {
                            ValuePattern vp = (ValuePattern)vpObj;
                            if (!vp.Current.IsReadOnly)
                            {
                                string finalVal = textToSet;
                                if (!clearFirst && !string.IsNullOrEmpty(vp.Current.Value))
                                {
                                    finalVal = vp.Current.Value + textToSet;
                                }
                                vp.SetValue(finalVal);
                                Thread.Sleep(15);
                                observedVal = vp.Current.Value;
                                setViaPattern = (observedVal == finalVal);
                            }
                        }
                        catch { }
                    }

                    if (!setViaPattern)
                    {
                        try { el.SetFocus(); } catch { }
                        var clickRes = CmdMouseClick(new Dictionary<string, object>
                        {
                            { "x", cx },
                            { "y", cy },
                            { "button", "left" },
                            { "click_type", "single" },
                            { "prefer_uia", false }
                        });
                        if (!GetBool(clickRes, "success", false))
                        {
                            return clickRes;
                        }
                        Thread.Sleep(45);
                        var typeRes = CmdTypeText(new Dictionary<string, object>
                        {
                            { "text", textToSet },
                            { "clear_first", clearFirst },
                            { "press_enter", pressEnter }
                        });
                        typeRes["uia_element"] = matched.Data;
                        typeRes["detection_method"] = "uia_direct";
                        return typeRes;
                    }

                    sw.Stop();
                    return BuildActionResult(
                        true,
                        "type_text",
                        GetWindowInfoByHandle(targetHwnd),
                        null,
                        sw.ElapsedMilliseconds,
                        new Dictionary<string, object>
                        {
                            { "uia_pattern", "ValuePattern.SetValue" },
                            { "control_enabled", true },
                            { "value_verified", true },
                            { "observed_value", observedVal }
                        },
                        new Dictionary<string, object>
                        {
                            { "text", textToSet },
                            { "target", elName },
                            { "role", elRole },
                            { "x", cx },
                            { "y", cy },
                            { "detection_method", "uia_value_pattern" },
                            { "uia_element", matched.Data }
                        }
                    );
                }

                // Invoke / Toggle / Select / Expand / Coordinate Click fallback
                string usedPattern = null;
                bool invokedOk = false;
                object pat;

                if (el.TryGetCurrentPattern(InvokePattern.Pattern, out pat) && pat != null)
                {
                    try
                    {
                        ((InvokePattern)pat).Invoke();
                        usedPattern = "InvokePattern";
                        invokedOk = true;
                    }
                    catch { }
                }

                if (!invokedOk && el.TryGetCurrentPattern(TogglePattern.Pattern, out pat) && pat != null)
                {
                    try
                    {
                        TogglePattern tp = (TogglePattern)pat;
                        ToggleState preState = tp.Current.ToggleState;
                        tp.Toggle();
                        Thread.Sleep(25);
                        ToggleState postState = tp.Current.ToggleState;
                        usedPattern = "TogglePattern(" + preState + "->" + postState + ")";
                        invokedOk = true;
                    }
                    catch { }
                }

                if (!invokedOk && el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pat) && pat != null)
                {
                    try
                    {
                        SelectionItemPattern sp = (SelectionItemPattern)pat;
                        sp.Select();
                        usedPattern = "SelectionItemPattern";
                        invokedOk = true;
                    }
                    catch { }
                }

                if (!invokedOk && el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pat) && pat != null)
                {
                    try
                    {
                        ExpandCollapsePattern ep = (ExpandCollapsePattern)pat;
                        if (ep.Current.ExpandCollapseState == ExpandCollapseState.Collapsed)
                            ep.Expand();
                        else
                            ep.Collapse();
                        usedPattern = "ExpandCollapsePattern";
                        invokedOk = true;
                    }
                    catch { }
                }

                if (!invokedOk)
                {
                    // Element found in UIA and verified enabled, but requires physical click at its UIA bounding center
                    try { el.SetFocus(); } catch { }
                    var clickRes = CmdMouseClick(new Dictionary<string, object>
                    {
                        { "x", cx },
                        { "y", cy },
                        { "button", "left" },
                        { "click_type", "single" },
                        { "prefer_uia", false }
                    });
                    clickRes["matched_label"] = elName;
                    clickRes["role"] = elRole;
                    clickRes["detection_method"] = "uia_bounding_rect";
                    clickRes["uia_element"] = matched.Data;
                    return clickRes;
                }

                InvalidateUiaCache();
                Thread.Sleep(35);
                string calcDisplayAfterInvoke = IsCalculatorWindow(winInfo) ? GetCalculatorDisplayText(targetHwnd) : null;
                sw.Stop();
                var invokeExtra = new Dictionary<string, object>
                {
                    { "target", query },
                    { "matched_label", elName },
                    { "role", elRole },
                    { "uia_pattern", usedPattern },
                    { "detection_method", "uia_pattern_invoke" },
                    { "x", cx },
                    { "y", cy },
                    { "button", "left" },
                    { "click_type", "single" }
                };
                if (!string.IsNullOrEmpty(calcDisplayAfterInvoke))
                {
                    invokeExtra["calculator_display"] = calcDisplayAfterInvoke;
                }
                return BuildActionResult(
                    true,
                    "uia_invoke",
                    winInfo,
                    null,
                    sw.ElapsedMilliseconds,
                    new Dictionary<string, object>
                    {
                        { "uia_pattern", usedPattern },
                        { "control_enabled", true },
                        { "direct_invocation", true },
                        { "calculator_display", calcDisplayAfterInvoke },
                        { "element", matched.Data }
                    },
                    invokeExtra
                );
            }
            finally
            {
                ReleaseAllInputs();
            }
        }

        // --- Safety & Destructive Action Check ---

        private static bool IsDestructiveActionStep(Dictionary<string, object> step, out string reason)
        {
            reason = null;
            if (step == null) return false;

            string act = GetString(step, "action", GetString(step, "type", "")).ToLowerInvariant();
            string target = GetString(step, "target", GetString(step, "label", "")).Trim();
            string text = GetString(step, "text", "").Trim();
            string key = GetString(step, "key", "").Trim().ToLowerInvariant();

            if (!string.IsNullOrEmpty(target) && DestructiveTargetRegex.IsMatch(target))
            {
                reason = string.Format("Target '{0}' matches a destructive UI control pattern.", target);
                return true;
            }

            if (!string.IsNullOrEmpty(text) && DestructiveCommandRegex.IsMatch(text))
            {
                reason = string.Format("Text input '{0}' contains a destructive command pattern.", text);
                return true;
            }

            if (key == "shift+delete" || key == "shift+del")
            {
                reason = "Shortcut 'shift+delete' permanently deletes items.";
                return true;
            }

            return false;
        }

        // --- Batched Action Sequence Execution (`execute_action_sequence`) ---

        private static Dictionary<string, object> CmdExecuteActionSequence(Dictionary<string, object> req)
        {
            Stopwatch totalSw = Stopwatch.StartNew();
            _cancelRequested = false;
            _cancelReason = null;
            _sequenceRunning = true;

            long uiaLookupMs = 0;
            long mouseKeyboardExecutionMs = 0;
            long verificationMs = 0;
            long screenshotCaptureMs = 0;
            long ocrMs = 0;

            var actionResults = new List<Dictionary<string, object>>();
            string abortedReason = null;
            int failedStepIndex = -1;
            bool requiresConfirmation = false;
            Dictionary<string, object> blockedAction = null;
            bool dialogAppeared = false;
            bool unexpectedWindowChange = false;
            bool sequenceSuccess = true;

            try
            {
                if (!req.ContainsKey("actions") || !(req["actions"] is IEnumerable) || (req["actions"] is string))
                {
                    totalSw.Stop();
                    return new Dictionary<string, object>
                    {
                        { "success", false },
                        { "action", "execute_action_sequence" },
                        { "error", "'actions' array is required for execute_action_sequence." }
                    };
                }

                var steps = new List<Dictionary<string, object>>();
                foreach (var item in (IEnumerable)req["actions"])
                {
                    var dict = item as Dictionary<string, object>;
                    if (dict != null) steps.Add(dict);
                }

                if (steps.Count == 0)
                {
                    totalSw.Stop();
                    return new Dictionary<string, object>
                    {
                        { "success", false },
                        { "action", "execute_action_sequence" },
                        { "error", "'actions' array must contain at least one action." }
                    };
                }

                bool stopOnError = GetBool(req, "stop_on_error", true);
                bool stopOnWindowChange = GetBool(req, "stop_on_window_change", true);
                bool stopOnDialog = GetBool(req, "stop_on_dialog", true);
                bool confirmedDestructive = GetBool(req, "confirm_destructive", GetBool(req, "confirmed_destructive", false));
                int interActionDelayMs = Math.Max(0, Math.Min(2000, GetInt(req, "inter_action_delay_ms", 65)));
                bool captureStateAfter = GetBool(req, "capture_state_after", true);

                // Safety check: pre-scan sequence for destructive actions unless confirmed
                if (!confirmedDestructive)
                {
                    for (int i = 0; i < steps.Count; i++)
                    {
                        string destructiveReason;
                        if (IsDestructiveActionStep(steps[i], out destructiveReason))
                        {
                            requiresConfirmation = true;
                            sequenceSuccess = false;
                            abortedReason = "destructive_action_requires_confirmation";
                            failedStepIndex = i;
                            blockedAction = steps[i];
                            totalSw.Stop();
                            return new Dictionary<string, object>
                            {
                                { "success", false },
                                { "action", "execute_action_sequence" },
                                { "requires_confirmation", true },
                                { "destructive_action_detected", true },
                                { "aborted_reason", abortedReason },
                                { "blocked_step_index", i },
                                { "blocked_action", blockedAction },
                                { "error", "Confirmation required before executing destructive action: " + destructiveReason },
                                { "message", "Confirmation required before executing destructive action: " + destructiveReason },
                                { "results", actionResults },
                                { "timings_ms", new Dictionary<string, object>
                                    {
                                        { "uia_lookup_ms", uiaLookupMs },
                                        { "mouse_keyboard_execution_ms", mouseKeyboardExecutionMs },
                                        { "verification_ms", verificationMs },
                                        { "screenshot_capture_ms", screenshotCaptureMs },
                                        { "ocr_ms", ocrMs },
                                        { "total_ms", totalSw.ElapsedMilliseconds }
                                    }
                                }
                            };
                        }
                    }
                }

                // Focus or identify expected target window before sequence begins
                long expectedHwnd = GetLong(req, "expected_hwnd", GetLong(req, "hwnd", 0));
                int expectedPid = GetInt(req, "expected_pid", 0);
                Dictionary<string, object> initialWindow = null;

                if (expectedHwnd != 0 || (req.ContainsKey("process_names") && req["process_names"] != null) || !string.IsNullOrEmpty(GetString(req, "title_query", "")))
                {
                    var focusRes = CmdFocusWindow(req);
                    if (GetBool(focusRes, "success", false))
                    {
                        initialWindow = focusRes;
                        expectedHwnd = GetLong(focusRes, "hwnd", expectedHwnd);
                        expectedPid = GetInt(focusRes, "pid", expectedPid);
                    }
                }

                if (initialWindow == null)
                {
                    initialWindow = GetCurrentTargetWindowSnapshot();
                    if (initialWindow != null)
                    {
                        if (expectedHwnd == 0) expectedHwnd = GetLong(initialWindow, "hwnd", 0);
                        if (expectedPid == 0) expectedPid = GetInt(initialWindow, "pid", 0);
                    }
                }

                string initialTitle = initialWindow != null ? GetString(initialWindow, "title", "") : "";

                // Capture fast baseline signature before sequence starts only when captureStateAfter is enabled
                if (captureStateAfter)
                {
                    Stopwatch baseShotSw = Stopwatch.StartNew();
                    try
                    {
                        Rectangle baseRect;
                        using (Bitmap baseBmp = CaptureScreenRegionBitmap(expectedHwnd, null, out baseRect))
                        {
                            CompareAndRecordSignature(expectedHwnd, baseBmp, baseRect);
                        }
                    }
                    catch { }
                    baseShotSw.Stop();
                    screenshotCaptureMs += baseShotSw.ElapsedMilliseconds;
                }

                // Execute actions sequentially without requesting any LLM inference between actions
                for (int i = 0; i < steps.Count; i++)
                {
                    if (_cancelRequested)
                    {
                        sequenceSuccess = false;
                        abortedReason = "cancelled";
                        break;
                    }

                    Dictionary<string, object> step = new Dictionary<string, object>(steps[i]);
                    string rawType = GetString(step, "action", GetString(step, "type", "")).ToLowerInvariant().Trim();
                    bool allowWindowChange = GetBool(step, "allow_window_change", rawType == "focus_window");

                    // Pre-step target window integrity & modal dialog check
                    if (i > 0 && expectedHwnd != 0 && !allowWindowChange)
                    {
                        Stopwatch verSw = Stopwatch.StartNew();
                        IntPtr curFg = GetForegroundWindow();
                        if (curFg != IntPtr.Zero && curFg.ToInt64() != expectedHwnd)
                        {
                            var curWin = GetWindowInfoByHandle(curFg);
                            int curPid = curWin != null ? GetInt(curWin, "pid", 0) : 0;
                            string curClass = curWin != null ? GetString(curWin, "class_name", "") : "";
                            string curTitle = curWin != null ? GetString(curWin, "title", "") : "";
                            long ownerHwnd;
                            bool isDialog = CheckWindowIsModalOrDialog(curFg, curClass, curTitle, out ownerHwnd);

                            if (isDialog && stopOnDialog)
                            {
                                verSw.Stop();
                                verificationMs += verSw.ElapsedMilliseconds;
                                dialogAppeared = true;
                                abortedReason = "dialog_appeared";
                                break;
                            }

                            if (stopOnWindowChange && expectedPid > 0 && curPid != expectedPid)
                            {
                                verSw.Stop();
                                verificationMs += verSw.ElapsedMilliseconds;
                                unexpectedWindowChange = true;
                                sequenceSuccess = false;
                                abortedReason = "target_window_changed";
                                failedStepIndex = i;
                                break;
                            }
                        }
                        verSw.Stop();
                        verificationMs += verSw.ElapsedMilliseconds;
                    }

                    if (!step.ContainsKey("expected_hwnd") && expectedHwnd != 0) step["expected_hwnd"] = expectedHwnd;
                    if (!step.ContainsKey("expected_pid") && expectedPid != 0) step["expected_pid"] = expectedPid;

                    // Resolve semantic target via UIA or Local OCR if no explicit (x, y) coordinates are provided
                    bool hasXY = step.ContainsKey("x") && step.ContainsKey("y") && step["x"] != null && step["y"] != null;
                    string targetQuery = GetString(step, "target", "").Trim();
                    int stepUiaId = GetInt(step, "uia_id", -1);
                    string stepAutoId = GetString(step, "automation_id", "").Trim();

                    bool needsTargetResolution =
                        !hasXY &&
                        (!string.IsNullOrEmpty(targetQuery) || stepUiaId >= 0 || !string.IsNullOrEmpty(stepAutoId)) &&
                        (rawType == "click" || rawType == "mouse_click" || rawType == "left_click" ||
                         rawType == "right_click" || rawType == "middle_click" || rawType == "double_click" ||
                         rawType == "move_mouse" || rawType == "move" || rawType == "scroll" || rawType == "mouse_scroll" ||
                         rawType == "type" || rawType == "type_text" || rawType == "text_input" ||
                         rawType == "uia_invoke" || rawType == "uia_action");

                    bool handledByDirectUia =
                        (rawType == "uia_invoke" || rawType == "uia_action" ||
                         rawType == "left_click" || rawType == "click" || rawType == "mouse_click" ||
                         rawType == "type" || rawType == "type_text" || rawType == "text_input");

                    if (needsTargetResolution && !handledByDirectUia)
                    {
                        // 1. Try UIA lookup first
                        Stopwatch uiaSw = Stopwatch.StartNew();
                        int visited;
                        List<UiaScannedNode> nodes = ScanUiaTree(
                            expectedHwnd != 0 ? new IntPtr(expectedHwnd) : GetForegroundWindow(),
                            targetQuery,
                            GetString(step, "role", ""),
                            180,
                            950,
                            out visited
                        );
                        UiaScannedNode matchedNode = null;
                        if (stepUiaId >= 0 && stepUiaId < nodes.Count) matchedNode = nodes[stepUiaId];
                        else if (!string.IsNullOrEmpty(stepAutoId))
                        {
                            foreach (var n in nodes)
                            {
                                if (string.Equals(GetString(n.Data, "automation_id", ""), stepAutoId, StringComparison.OrdinalIgnoreCase))
                                {
                                    matchedNode = n;
                                    break;
                                }
                            }
                        }
                        if (matchedNode == null && !string.IsNullOrEmpty(targetQuery))
                        {
                            double topScore = 0;
                            foreach (var n in nodes)
                            {
                                if (n.Score > topScore)
                                {
                                    topScore = n.Score;
                                    matchedNode = n;
                                }
                            }
                            if (topScore < 0.72) matchedNode = null;
                        }
                        uiaSw.Stop();
                        uiaLookupMs += uiaSw.ElapsedMilliseconds;

                        if (matchedNode != null)
                        {
                            step["x"] = matchedNode.Data["x"];
                            step["y"] = matchedNode.Data["y"];
                            step["uia_id"] = matchedNode.Index;
                            step["resolved_by"] = "uia";
                            step["matched_label"] = matchedNode.Data["name"];
                        }
                        else if (!string.IsNullOrEmpty(targetQuery))
                        {
                            // 2. Fallback to fast Local Windows OCR before failing or requesting vision
                            Stopwatch ocrSw = Stopwatch.StartNew();
                            try
                            {
                                Rectangle capRect;
                                using (Bitmap bmp = CaptureScreenRegionBitmap(expectedHwnd, null, out capRect))
                                {
                                    var ocrRes = ExtractTextWithLocalOcr(bmp, capRect, targetQuery);
                                    if (GetBool(ocrRes, "success", false) && ocrRes.ContainsKey("best_match") && ocrRes["best_match"] is Dictionary<string, object>)
                                    {
                                        var bm = (Dictionary<string, object>)ocrRes["best_match"];
                                        step["x"] = bm["x"];
                                        step["y"] = bm["y"];
                                        step["resolved_by"] = "local_ocr";
                                        step["matched_label"] = bm["text"];
                                        step["prefer_uia"] = false;
                                    }
                                }
                            }
                            catch { }
                            ocrSw.Stop();
                            ocrMs += ocrSw.ElapsedMilliseconds;
                        }
                    }

                    // Execute the primitive action
                    Stopwatch execSw = Stopwatch.StartNew();
                    Dictionary<string, object> stepResult;

                    switch (rawType)
                    {
                        case "move_mouse":
                        case "move":
                            stepResult = CmdMoveMouse(step);
                            break;
                        case "left_click":
                        case "click":
                        case "mouse_click":
                            if (!step.ContainsKey("button")) step["button"] = "left";
                            if (!step.ContainsKey("click_type")) step["click_type"] = "single";
                            stepResult = CmdMouseClick(step);
                            break;
                        case "right_click":
                            step["button"] = "right";
                            step["click_type"] = "single";
                            stepResult = CmdMouseClick(step);
                            break;
                        case "middle_click":
                            step["button"] = "middle";
                            step["click_type"] = "single";
                            stepResult = CmdMouseClick(step);
                            break;
                        case "double_click":
                            if (!step.ContainsKey("button")) step["button"] = "left";
                            step["click_type"] = "double";
                            step["prefer_uia"] = false;
                            stepResult = CmdMouseClick(step);
                            break;
                        case "drag":
                        case "drag_and_drop":
                        case "mouse_drag":
                            stepResult = CmdMouseDrag(step);
                            break;
                        case "scroll":
                        case "mouse_scroll":
                            stepResult = CmdMouseScroll(step);
                            break;
                        case "type":
                        case "type_text":
                        case "text_input":
                            stepResult = CmdTypeText(step);
                            break;
                        case "key_press":
                        case "press_key":
                        case "shortcut":
                        case "hotkey":
                            stepResult = CmdKeyPress(step);
                            break;
                        case "wait":
                        case "sleep":
                            stepResult = CmdWait(step);
                            break;
                        case "uia_invoke":
                        case "uia_action":
                            stepResult = CmdUiaAction(step);
                            break;
                        case "focus_window":
                            stepResult = CmdFocusWindow(step);
                            if (GetBool(stepResult, "success", false))
                            {
                                expectedHwnd = GetLong(stepResult, "hwnd", expectedHwnd);
                                expectedPid = GetInt(stepResult, "pid", expectedPid);
                            }
                            break;
                        default:
                            stepResult = BuildActionResult(false, rawType, GetCurrentTargetWindowSnapshot(), "Unsupported sequence action type: " + rawType, 0, null, null);
                            break;
                    }

                    execSw.Stop();
                    mouseKeyboardExecutionMs += execSw.ElapsedMilliseconds;

                    stepResult["step_index"] = i;
                    if (step.ContainsKey("resolved_by") && !stepResult.ContainsKey("detection_method"))
                    {
                        stepResult["detection_method"] = step["resolved_by"];
                    }
                    if (step.ContainsKey("matched_label") && !stepResult.ContainsKey("matched_label"))
                    {
                        stepResult["matched_label"] = step["matched_label"];
                    }

                    actionResults.Add(stepResult);

                    bool stepOk = GetBool(stepResult, "success", false);
                    if (!stepOk)
                    {
                        sequenceSuccess = false;
                        failedStepIndex = i;
                        abortedReason = "action_failed";
                        if (stopOnError) break;
                    }

                    // Optional per-step post wait or default inter-action delay
                    int waitAfter = GetInt(step, "wait_after_ms", (i + 1 < steps.Count && rawType != "wait" && rawType != "sleep") ? interActionDelayMs : 0);
                    if (waitAfter > 0)
                    {
                        if (!InterruptibleSleep(waitAfter))
                        {
                            sequenceSuccess = false;
                            abortedReason = "cancelled";
                            break;
                        }
                    }
                }

                // Post-sequence verification & checkpoint evaluation
                Stopwatch postVerSw = Stopwatch.StartNew();
                IntPtr finalFg = GetForegroundWindow();
                var finalWindow = GetWindowInfoByHandle(finalFg);
                int finalPid = finalWindow != null ? GetInt(finalWindow, "pid", 0) : 0;
                string finalTitle = finalWindow != null ? GetString(finalWindow, "title", "") : "";
                string finalClass = finalWindow != null ? GetString(finalWindow, "class_name", "") : "";
                long finalOwner;
                bool finalIsDialog = finalFg != IntPtr.Zero && CheckWindowIsModalOrDialog(finalFg, finalClass, finalTitle, out finalOwner);
                if (finalIsDialog) dialogAppeared = true;

                bool windowTitleChanged = !string.Equals(initialTitle, finalTitle, StringComparison.Ordinal);
                bool appSwitched = (expectedPid > 0 && finalPid > 0 && expectedPid != finalPid) ||
                                   (expectedHwnd != 0 && finalFg != IntPtr.Zero && expectedHwnd != finalFg.ToInt64() && !finalIsDialog);

                if (appSwitched && stopOnWindowChange && sequenceSuccess)
                {
                    unexpectedWindowChange = true;
                }

                Dictionary<string, object> screenDiff = null;
                if (captureStateAfter)
                {
                    Stopwatch endShotSw = Stopwatch.StartNew();
                    try
                    {
                        Rectangle endRect;
                        long captureHwnd = finalFg != IntPtr.Zero ? finalFg.ToInt64() : expectedHwnd;
                        using (Bitmap endBmp = CaptureScreenRegionBitmap(captureHwnd, null, out endRect))
                        {
                            screenDiff = CompareAndRecordSignature(captureHwnd, endBmp, endRect);
                        }
                    }
                    catch { }
                    endShotSw.Stop();
                    screenshotCaptureMs += endShotSw.ElapsedMilliseconds;
                }

                double changeScore = screenDiff != null ? Convert.ToDouble(screenDiff["change_score"]) : 0.0;
                bool significantTransition = windowTitleChanged || changeScore >= 0.18;

                // Evaluate Checkpoint-Based Verification conditions (Requirement 5)
                var checkpointReasons = new List<string>();
                if (appSwitched) checkpointReasons.Add("app_opened_or_switched");
                if (significantTransition) checkpointReasons.Add("significant_transition");
                if (dialogAppeared) checkpointReasons.Add("dialog_appeared");
                if (!sequenceSuccess) checkpointReasons.Add("action_failed");
                if (GetBool(req, "depends_on_new_info", false)) checkpointReasons.Add("depends_on_new_info");

                bool requiresVisualInference = checkpointReasons.Count > 0;
                string calcDisplayFinal = IsCalculatorWindow(finalWindow)
                    ? GetCalculatorDisplayText(finalFg != IntPtr.Zero ? finalFg : new IntPtr(expectedHwnd))
                    : null;
                string focusedValFinal = GetFocusedElementValue();
                postVerSw.Stop();
                verificationMs += postVerSw.ElapsedMilliseconds;
                totalSw.Stop();

                var seqOutput = new Dictionary<string, object>
                {
                    { "success", sequenceSuccess && !_cancelRequested },
                    { "action", "execute_action_sequence" },
                    { "cancelled", _cancelRequested },
                    { "cancel_reason", _cancelReason },
                    { "aborted_reason", abortedReason },
                    { "failed_step_index", failedStepIndex >= 0 ? (object)failedStepIndex : null },
                    { "requires_confirmation", requiresConfirmation },
                    { "unexpected_window_change", unexpectedWindowChange },
                    { "dialog_appeared", dialogAppeared },
                    { "total_requested", steps.Count },
                    { "total_executed", actionResults.Count },
                    { "initial_window", initialWindow },
                    { "target_window", finalWindow },
                    { "calculator_display", calcDisplayFinal },
                    { "focused_value", focusedValFinal },
                    { "results", actionResults },
                    { "screen_change", screenDiff },
                    { "checkpoint", new Dictionary<string, object>
                        {
                            { "should_verify_visually", requiresVisualInference },
                            { "reasons", checkpointReasons },
                            { "primary_reason", checkpointReasons.Count > 0 ? checkpointReasons[0] : "none" },
                            { "window_title_changed", windowTitleChanged },
                            { "app_switched", appSwitched },
                            { "dialog_appeared", dialogAppeared },
                            { "action_failed", !sequenceSuccess },
                            { "change_score", changeScore }
                        }
                    },
                    { "timings_ms", new Dictionary<string, object>
                        {
                            { "uia_lookup_ms", uiaLookupMs },
                            { "mouse_keyboard_execution_ms", mouseKeyboardExecutionMs },
                            { "verification_ms", verificationMs },
                            { "screenshot_capture_ms", screenshotCaptureMs },
                            { "ocr_ms", ocrMs },
                            { "total_ms", totalSw.ElapsedMilliseconds }
                        }
                    }
                };
                return seqOutput;
            }
            finally
            {
                _sequenceRunning = false;
                ReleaseAllInputs();
            }
        }

        // --- UIA Scoring & Normalization Helpers ---

        private static Dictionary<string, object> CmdTestUiaScoring()
        {
            var mockElements = new List<Dictionary<string, string>>
            {
                new Dictionary<string, string> { { "name", "Square root" }, { "autoId", "squareRootButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Square" }, { "autoId", "xpower2Button" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Reciprocal" }, { "autoId", "invertButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Clear" }, { "autoId", "clearButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Clear entry" }, { "autoId", "clearEntryButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Zero" }, { "autoId", "num0Button" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Five" }, { "autoId", "num5Button" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Plus" }, { "autoId", "plusButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Minus" }, { "autoId", "minusButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Multiply by" }, { "autoId", "multiplyButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Divide by" }, { "autoId", "divideButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Equals" }, { "autoId", "equalButton" }, { "role", "Button" } },
                new Dictionary<string, string> { { "name", "Season 25" }, { "autoId", "track5" }, { "role", "ListItem" } }
            };

            string[] queries = new string[] { "5", "+", "=", "*", "/", "-", "Clear", "0", "sqrt" };
            var matches = new Dictionary<string, object>();

            foreach (string q in queries)
            {
                string bestName = null;
                string bestAutoId = null;
                double bestScore = 0;

                foreach (var el in mockElements)
                {
                    double s = ScoreUiaElement(q, el["name"], el["autoId"], "", el["role"], true);
                    if (s > bestScore)
                    {
                        bestScore = s;
                        bestName = el["name"];
                        bestAutoId = el["autoId"];
                    }
                }

                matches[q] = new Dictionary<string, object>
                {
                    { "matched_name", bestName },
                    { "matched_automation_id", bestAutoId },
                    { "score", bestScore }
                };
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "matches", matches }
            };
        }

        private static double MatchCanonicalUiQuery(string rawQuery, string normName, string normAutoId)
        {
            if (string.IsNullOrEmpty(rawQuery)) return 0;
            string rq = rawQuery.Trim().ToLowerInvariant();
            // Strip trailing words like "button" or "key" from rawQuery if present
            if (rq.EndsWith(" button")) rq = rq.Substring(0, rq.Length - 7).Trim();
            else if (rq.EndsWith(" key")) rq = rq.Substring(0, rq.Length - 4).Trim();

            string targetName = null;
            string targetAutoId = null;

            switch (rq)
            {
                case "0":
                case "zero":
                    targetName = "zero"; targetAutoId = "num0button"; break;
                case "1":
                case "one":
                    targetName = "one"; targetAutoId = "num1button"; break;
                case "2":
                case "two":
                    targetName = "two"; targetAutoId = "num2button"; break;
                case "3":
                case "three":
                    targetName = "three"; targetAutoId = "num3button"; break;
                case "4":
                case "four":
                    targetName = "four"; targetAutoId = "num4button"; break;
                case "5":
                case "five":
                    targetName = "five"; targetAutoId = "num5button"; break;
                case "6":
                case "six":
                    targetName = "six"; targetAutoId = "num6button"; break;
                case "7":
                case "seven":
                    targetName = "seven"; targetAutoId = "num7button"; break;
                case "8":
                case "eight":
                    targetName = "eight"; targetAutoId = "num8button"; break;
                case "9":
                case "nine":
                    targetName = "nine"; targetAutoId = "num9button"; break;
                case "+":
                case "plus":
                case "add":
                case "addition":
                    targetName = "plus"; targetAutoId = "plusbutton"; break;
                case "-":
                case "−":
                case "minus":
                case "subtract":
                case "subtraction":
                    targetName = "minus"; targetAutoId = "minusbutton"; break;
                case "*":
                case "×":
                case "multiply":
                case "multiply by":
                case "times":
                case "multiplication":
                    targetName = "multiply by"; targetAutoId = "multiplybutton"; break;
                case "/":
                case "÷":
                case "divide":
                case "divide by":
                case "division":
                    targetName = "divide by"; targetAutoId = "dividebutton"; break;
                case "=":
                case "equals":
                case "equal":
                    targetName = "equals"; targetAutoId = "equalbutton"; break;
                case "c":
                case "ac":
                case "clear":
                    targetName = "clear"; targetAutoId = "clearbutton"; break;
                case "ce":
                case "clear entry":
                    targetName = "clear entry"; targetAutoId = "clearentrybutton"; break;
                case ".":
                case "dot":
                case "point":
                case "decimal":
                case "decimal separator":
                    targetName = "decimal separator"; targetAutoId = "decimalseparatorbutton"; break;
                case "%":
                case "percent":
                case "percentage":
                    targetName = "percent"; targetAutoId = "percentbutton"; break;
                case "backspace":
                case "back space":
                    targetName = "backspace"; targetAutoId = "backspacebutton"; break;
                case "sqrt":
                case "square root":
                case "√":
                case "root":
                    targetName = "square root"; targetAutoId = "squarerootbutton"; break;
                case "+/-":
                case "negate":
                case "positive negative":
                    targetName = "positive negative"; targetAutoId = "negatebutton"; break;
            }

            if (targetName != null || targetAutoId != null)
            {
                if (!string.IsNullOrEmpty(targetAutoId) && normAutoId == targetAutoId)
                    return 0.99;
                if (!string.IsNullOrEmpty(targetName) && normName == targetName)
                    return 0.99;
                if (normName == rq)
                    return 0.98;
            }

            return 0;
        }

        private static double ScoreUiaElement(string query, string name, string autoId, string helpText, string ctrlType, bool isInteractive)
        {
            if (string.IsNullOrEmpty(query)) return 0;

            string rawTrimmed = query.Trim();
            if (string.IsNullOrEmpty(rawTrimmed)) return 0;

            string n = NormalizeText(name);
            string a = NormalizeText(autoId);
            string h = NormalizeText(helpText);

            // 1. Check exact raw match (e.g. button text is literally "+" or "=" or "5")
            if (!string.IsNullOrEmpty(name) && string.Equals(name.Trim(), rawTrimmed, StringComparison.OrdinalIgnoreCase))
            {
                return isInteractive ? 0.99 : 0.95;
            }

            // 2. Check canonical UI control & symbol/digit mapping (e.g. "5" -> "Five"/num5Button, "+" -> "Plus"/plusButton)
            double canonicalScore = MatchCanonicalUiQuery(rawTrimmed, n, a);
            if (canonicalScore > 0)
            {
                return canonicalScore;
            }

            string q = NormalizeText(query);
            string qCore = StripUiSuffixWords(q);
            if (string.IsNullOrEmpty(qCore)) qCore = q;

            // CRITICAL FIX: If query contains only symbols that normalized to empty string, NEVER match arbitrary elements!
            if (string.IsNullOrEmpty(qCore))
            {
                return 0;
            }

            double score = 0;
            bool isShortQuery = qCore.Length <= 2;

            if (!string.IsNullOrEmpty(n))
            {
                if (n == q || n == qCore)
                {
                    score = 0.96;
                }
                else if (!isShortQuery && n.Length >= 3 && (n.StartsWith(qCore + " ") || qCore.StartsWith(n + " ") || (n.StartsWith(qCore) && (double)qCore.Length / n.Length >= 0.55)))
                {
                    double ratio = (double)Math.Min(n.Length, qCore.Length) / Math.Max(n.Length, qCore.Length);
                    score = Math.Max(score, 0.78 + ratio * 0.16);
                }
                else if (!isShortQuery && qCore.Length >= 4 && n.Contains(qCore))
                {
                    score = Math.Max(score, 0.75);
                }
                else
                {
                    string[] qTokens = qCore.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    string[] nTokens = n.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (qTokens.Length > 0 && nTokens.Length > 0)
                    {
                        int matched = 0;
                        foreach (string qt in qTokens)
                        {
                            foreach (string nt in nTokens)
                            {
                                if (nt == qt || (!isShortQuery && qt.Length >= 4 && nt.Contains(qt)))
                                {
                                    matched++;
                                    break;
                                }
                            }
                        }
                        if (matched > 0)
                        {
                            double recall = (double)matched / qTokens.Length;
                            double precision = (double)matched / nTokens.Length;
                            double tokenScore = recall * 0.65 + precision * 0.25;
                            // Prevent a single-digit query like "5" from scoring >= 0.72 against a multi-word title like "Season 5"
                            if (isShortQuery && nTokens.Length > 1)
                            {
                                tokenScore *= 0.65;
                            }
                            score = Math.Max(score, tokenScore);
                        }
                    }
                }
            }

            if (!string.IsNullOrEmpty(a))
            {
                if (a == qCore) score = Math.Max(score, 0.92);
                else if (!isShortQuery && qCore.Length >= 3 && a.Contains(qCore)) score = Math.Max(score, 0.74);
            }

            if (!string.IsNullOrEmpty(h))
            {
                if (h == qCore) score = Math.Max(score, 0.88);
                else if (!isShortQuery && qCore.Length >= 4 && h.Contains(qCore)) score = Math.Max(score, 0.72);
            }

            if ((q.Contains("search") || q.Contains("address") || q.Contains("url") || q.Contains("input")) &&
                (ctrlType == "Edit" || ctrlType == "ComboBox"))
            {
                if (n.Contains("search") || n.Contains("address") || h.Contains("search") || a.Contains("search"))
                {
                    score = Math.Max(score, 0.92);
                }
            }

            if (score > 0 && isInteractive)
            {
                score = Math.Min(1.0, score + 0.04);
            }

            return score;
        }

        private static string NormalizeText(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            StringBuilder sb = new StringBuilder(input.Length);
            bool lastSpace = true;
            foreach (char ch in input.ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(ch))
                {
                    sb.Append(ch);
                    lastSpace = false;
                }
                else if (!lastSpace)
                {
                    sb.Append(' ');
                    lastSpace = true;
                }
            }
            return sb.ToString().Trim();
        }

        private static string StripUiSuffixWords(string normalized)
        {
            string[] stopWords = { "button", "btn", "icon", "link", "tab", "field", "input", "box", "bar", "menu", "item", "option", "the", "my", "on", "in" };
            string[] tokens = normalized.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var kept = new List<string>();
            foreach (string t in tokens)
            {
                bool isStop = false;
                foreach (string sw in stopWords)
                {
                    if (t == sw) { isStop = true; break; }
                }
                if (!isStop) kept.Add(t);
            }
            return string.Join(" ", kept.ToArray()).Trim();
        }

        // --- Helper Getters ---
        private static string GetString(Dictionary<string, object> d, string key, string fallback)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
                return d[key].ToString();
            return fallback;
        }

        private static int GetInt(Dictionary<string, object> d, string key, int fallback)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
            {
                int val;
                if (int.TryParse(d[key].ToString(), out val)) return val;
                double dval;
                if (double.TryParse(d[key].ToString(), out dval)) return (int)Math.Round(dval);
            }
            return fallback;
        }

        private static long GetLong(Dictionary<string, object> d, string key, long fallback)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
            {
                long val;
                if (long.TryParse(d[key].ToString(), out val)) return val;
            }
            return fallback;
        }

        private static bool GetBool(Dictionary<string, object> d, string key, bool fallback)
        {
            if (d != null && d.ContainsKey(key) && d[key] != null)
            {
                if (d[key] is bool) return (bool)d[key];
                bool val;
                if (bool.TryParse(d[key].ToString(), out val)) return val;
            }
            return fallback;
        }
    }
}
