using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
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

        [DllImport("user32.dll")]
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

        private const uint WM_GETOBJECT = 0x003D;
        private const uint SMTO_ABORTIFHUNG = 0x0002;

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        static void Main(string[] args)
        {
            try
            {
                // Enable Per-Monitor DPI Awareness so screen bounds, UIA rects, and cursor coordinates match 1:1
                try { SetProcessDpiAwareness(2); } catch { try { SetProcessDPIAware(); } catch { } }

                Console.InputEncoding = Encoding.UTF8;
                Console.OutputEncoding = Encoding.UTF8;

                if (args.Length > 0 && args[0] == "--server")
                {
                    string line;
                    while ((line = Console.ReadLine()) != null)
                    {
                        line = line.Trim();
                        if (string.IsNullOrEmpty(line)) continue;
                        string responseJson = HandleRequestLine(line);
                        Console.WriteLine(responseJson);
                        Console.Out.Flush();
                    }
                }
                else if (args.Length > 0)
                {
                    string responseJson = HandleRequestLine(args[0]);
                    Console.WriteLine(responseJson);
                }
                else
                {
                    Console.WriteLine(Json.Serialize(new Dictionary<string, object>
                    {
                        { "success", true },
                        { "status", "ready" }
                    }));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(Json.Serialize(new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", ex.Message }
                }));
            }
        }

        private static string HandleRequestLine(string line)
        {
            object reqId = null;
            try
            {
                var req = Json.Deserialize<Dictionary<string, object>>(line);
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
                        result = CmdMouseDrag(req);
                        break;
                    case "type_text":
                        result = CmdTypeText(req);
                        break;
                    case "key_press":
                        result = CmdKeyPress(req);
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
                    case "uia_inspect":
                        result = CmdUiaInspect(req);
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
                { "cursor", new Dictionary<string, object> { { "x", pt.X }, { "y", pt.Y } } }
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
            Rectangle vScreen = SystemInformation.VirtualScreen;
            targetX = Math.Max(vScreen.Left, Math.Min(vScreen.Right - 1, targetX));
            targetY = Math.Max(vScreen.Top, Math.Min(vScreen.Bottom - 1, targetY));

            POINT startPt;
            GetCursorPos(out startPt);

            if (smooth && durationMs > 0 && steps > 1)
            {
                int dx = targetX - startPt.X;
                int dy = targetY - startPt.Y;
                double dist = Math.Sqrt(dx * dx + dy * dy);

                if (dist > 3)
                {
                    int actualSteps = Math.Max(4, Math.Min(30, steps));
                    int stepSleep = Math.Max(4, durationMs / actualSteps);

                    for (int i = 1; i <= actualSteps; i++)
                    {
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
            Thread.Sleep(15);

            POINT endPt;
            GetCursorPos(out endPt);
            return endPt;
        }

        private static Dictionary<string, object> CmdMoveMouse(Dictionary<string, object> req)
        {
            int x = GetInt(req, "x", -1);
            int y = GetInt(req, "y", -1);
            bool smooth = GetBool(req, "smooth", true);
            int durationMs = GetInt(req, "duration_ms", 120);
            int steps = GetInt(req, "steps", 12);

            if (x < 0 || y < 0)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", string.Format("Invalid target coordinates ({0}, {1})", x, y) }
                };
            }

            bool setOk;
            POINT actual = SmoothMoveCursorTo(x, y, smooth, durationMs, steps, out setOk);
            int drift = Math.Abs(actual.X - x) + Math.Abs(actual.Y - y);
            bool ok = drift <= 15;

            return new Dictionary<string, object>
            {
                { "success", ok },
                { "set_cursor_ok", setOk },
                { "requested_x", x },
                { "requested_y", y },
                { "actual_x", actual.X },
                { "actual_y", actual.Y },
                { "error", ok ? null : string.Format("Cursor verification failed: requested ({0},{1}) but cursor is at ({2},{3}). Ensure desktop is unlocked and target window is not running as Administrator while STRANGE is standard user.", x, y, actual.X, actual.Y) }
            };
        }

        private static Dictionary<string, object> CmdMouseClick(Dictionary<string, object> req)
        {
            bool hasCoords = req.ContainsKey("x") && req.ContainsKey("y") && req["x"] != null && req["y"] != null;
            string button = GetString(req, "button", "left").ToLowerInvariant();
            string clickType = GetString(req, "click_type", "single").ToLowerInvariant();
            bool smooth = GetBool(req, "smooth", true);
            int durationMs = GetInt(req, "duration_ms", 120);
            int settleMs = GetInt(req, "settle_ms", 55);

            POINT currentPt;
            bool setOk = true;
            if (hasCoords)
            {
                int x = GetInt(req, "x", 0);
                int y = GetInt(req, "y", 0);
                currentPt = SmoothMoveCursorTo(x, y, smooth, durationMs, 12, out setOk);
                int drift = Math.Abs(currentPt.X - x) + Math.Abs(currentPt.Y - y);
                if (drift > 20)
                {
                    return new Dictionary<string, object>
                    {
                        { "success", false },
                        { "set_cursor_ok", setOk },
                        { "error", string.Format("Fail-check: Cursor could not reach ({0},{1}), stuck at ({2},{3}). Ensure desktop is unlocked and active window is not elevated (Admin).", x, y, currentPt.X, currentPt.Y) },
                        { "requested_x", x },
                        { "requested_y", y },
                        { "actual_x", currentPt.X },
                        { "actual_y", currentPt.Y }
                    };
                }
            }
            else
            {
                GetCursorPos(out currentPt);
            }

            // Pause after movement so hover states register before mouse down
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

            for (int c = 0; c < clicks; c++)
            {
                mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(40);
                mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);
                if (c + 1 < clicks)
                {
                    Thread.Sleep(70);
                }
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "x", currentPt.X },
                { "y", currentPt.Y },
                { "button", button },
                { "click_type", clicks == 2 ? "double" : "single" }
            };
        }

        private static Dictionary<string, object> CmdMouseScroll(Dictionary<string, object> req)
        {
            string direction = GetString(req, "direction", "down").ToLowerInvariant();
            int amount = Math.Max(1, Math.Min(50, GetInt(req, "amount", 5)));
            bool hasCoords = req.ContainsKey("x") && req.ContainsKey("y") && req["x"] != null && req["y"] != null;

            POINT pt;
            if (hasCoords)
            {
                int x = GetInt(req, "x", 0);
                int y = GetInt(req, "y", 0);
                bool setOk;
                pt = SmoothMoveCursorTo(x, y, true, 90, 8, out setOk);
                Thread.Sleep(45);
            }
            else
            {
                GetCursorPos(out pt);
            }

            uint flag = (direction == "left" || direction == "right") ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
            int deltaPerNotch = WHEEL_DELTA;
            if (direction == "down" || direction == "left")
            {
                deltaPerNotch = -WHEEL_DELTA;
            }

            for (int i = 0; i < amount; i++)
            {
                mouse_event(flag, 0, 0, deltaPerNotch, UIntPtr.Zero);
                if (i + 1 < amount) Thread.Sleep(25);
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "direction", direction },
                { "amount", amount },
                { "x", pt.X },
                { "y", pt.Y }
            };
        }

        private static Dictionary<string, object> CmdMouseDrag(Dictionary<string, object> req)
        {
            int fromX = GetInt(req, "from_x", 0);
            int fromY = GetInt(req, "from_y", 0);
            int toX = GetInt(req, "to_x", 0);
            int toY = GetInt(req, "to_y", 0);
            int durationMs = GetInt(req, "duration_ms", 250);

            bool setOk;
            SmoothMoveCursorTo(fromX, fromY, true, 100, 10, out setOk);
            Thread.Sleep(50);
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(60);
            POINT endPt = SmoothMoveCursorTo(toX, toY, true, durationMs, 16, out setOk);
            Thread.Sleep(60);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);

            return new Dictionary<string, object>
            {
                { "success", true },
                { "from_x", fromX },
                { "from_y", fromY },
                { "to_x", endPt.X },
                { "to_y", endPt.Y }
            };
        }

        private static Dictionary<string, object> CmdTypeText(Dictionary<string, object> req)
        {
            string text = GetString(req, "text", "");
            bool clearFirst = GetBool(req, "clear_first", false);
            bool pressEnter = GetBool(req, "press_enter", false);
            int delayMs = Math.Max(2, Math.Min(200, GetInt(req, "delay_ms", 14)));

            if (clearFirst)
            {
                SendKeyCombo(0x41, new List<byte> { 0x11 }); // Ctrl+A
                Thread.Sleep(45);
                SendVirtualKey(0x08); // Backspace
                Thread.Sleep(45);
            }

            foreach (char ch in text)
            {
                if (ch == '\r') continue;
                if (ch == '\n')
                {
                    SendVirtualKey(0x0D);
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

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
                Thread.Sleep(delayMs);
            }

            if (pressEnter)
            {
                Thread.Sleep(65);
                SendVirtualKey(0x0D); // Enter
            }

            return new Dictionary<string, object>
            {
                { "success", true },
                { "typed_length", text.Length },
                { "cleared_first", clearFirst },
                { "pressed_enter", pressEnter }
            };
        }

        private static Dictionary<string, object> CmdKeyPress(Dictionary<string, object> req)
        {
            string keyName = GetString(req, "key", "").Trim();
            var modifiers = new List<byte>();

            if (req.ContainsKey("modifiers") && req["modifiers"] is System.Collections.IEnumerable && !(req["modifiers"] is string))
            {
                foreach (var modObj in (System.Collections.IEnumerable)req["modifiers"])
                {
                    if (modObj == null) continue;
                    byte modVk = ResolveModifierVk(modObj.ToString());
                    if (modVk != 0 && !modifiers.Contains(modVk)) modifiers.Add(modVk);
                }
            }

            if (keyName.Contains("+"))
            {
                string[] parts = keyName.Split('+');
                for (int i = 0; i < parts.Length - 1; i++)
                {
                    byte modVk = ResolveModifierVk(parts[i].Trim());
                    if (modVk != 0 && !modifiers.Contains(modVk)) modifiers.Add(modVk);
                }
                keyName = parts[parts.Length - 1].Trim();
            }

            byte vk = ResolveVirtualKey(keyName);
            if (vk == 0)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "Unsupported key name: " + keyName }
                };
            }

            SendKeyCombo(vk, modifiers);

            return new Dictionary<string, object>
            {
                { "success", true },
                { "key", keyName },
                { "vk", (int)vk },
                { "modifiers_count", modifiers.Count }
            };
        }

        private static void SendVirtualKey(byte vk)
        {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        private static void SendKeyCombo(byte vk, List<byte> modifiers)
        {
            foreach (byte mod in modifiers)
            {
                keybd_event(mod, 0, 0, UIntPtr.Zero);
                Thread.Sleep(20);
            }
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(20);
            for (int i = modifiers.Count - 1; i >= 0; i--)
            {
                keybd_event(modifiers[i], 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                Thread.Sleep(15);
            }
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
                case "=": return 0xBB;
                case "minus":
                case "-": return 0xBD;
                case "slash":
                case "/": return 0xBF;
                case "period":
                case ".": return 0xBE;
                case "comma":
                case ",": return 0xBC;
                default: return 0;
            }
        }

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

                if (!iconic && (w < 80 || h < 60)) return true;

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
                    IsForeground = (hWnd == fg)
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
            IntPtr fg = GetForegroundWindow();
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

            RECT r;
            GetWindowRect(fg, out r);
            uint pid;
            GetWindowThreadProcessId(fg, out pid);
            string procName = "";
            try { procName = Process.GetProcessById((int)pid).ProcessName; } catch { }
            StringBuilder sb = new StringBuilder(512);
            GetWindowText(fg, sb, sb.Capacity);

            return new Dictionary<string, object>
            {
                { "success", true },
                { "hwnd", fg.ToInt64() },
                { "pid", (int)pid },
                { "process_name", procName },
                { "title", sb.ToString() },
                { "rect", new Dictionary<string, object>
                    {
                        { "x", r.Left },
                        { "y", r.Top },
                        { "width", Math.Max(0, r.Right - r.Left) },
                        { "height", Math.Max(0, r.Bottom - r.Top) }
                    }
                }
            };
        }

        private static Dictionary<string, object> CmdFocusWindow(Dictionary<string, object> req)
        {
            long targetHwnd = GetLong(req, "hwnd", 0);
            string titleQuery = GetString(req, "title_query", "").ToLowerInvariant().Trim();
            var procFilter = new List<string>();

            if (req.ContainsKey("process_names") && req["process_names"] is System.Collections.IEnumerable && !(req["process_names"] is string))
            {
                foreach (var pObj in (System.Collections.IEnumerable)req["process_names"])
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

                // Require at least process match or title match
                if (!procMatch && !titleMatch) continue;

                // If process filter was specified and didn't match, only allow title match for UWP ApplicationFrameHost or exact title match
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
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "Matching window not found" }
                };
            }

            IntPtr hWnd = new IntPtr(best.Hwnd);

            if (IsIconic(hWnd))
            {
                ShowWindow(hWnd, SW_RESTORE);
                Thread.Sleep(200);
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

                Thread.Sleep(80);
                if (GetForegroundWindow() != hWnd)
                {
                    keybd_event(0x12, 0, 0, UIntPtr.Zero); // Alt down
                    SetForegroundWindow(hWnd);
                    keybd_event(0x12, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Alt up
                    Thread.Sleep(80);
                }
            }

            RECT updatedRect;
            GetWindowRect(hWnd, out updatedRect);
            best.Rect = updatedRect;
            best.IsMinimized = IsIconic(hWnd);
            best.IsMaximized = IsZoomed(hWnd);
            best.IsForeground = (GetForegroundWindow() == hWnd);

            var result = SerializeWindow(best);
            result["success"] = true;
            return result;
        }

        private static Dictionary<string, object> CmdScreenshot(Dictionary<string, object> req)
        {
            Rectangle screenBounds = Screen.PrimaryScreen.Bounds;
            Rectangle vScreen = SystemInformation.VirtualScreen;

            int capX = screenBounds.X;
            int capY = screenBounds.Y;
            int capW = screenBounds.Width;
            int capH = screenBounds.Height;

            if (req.ContainsKey("crop_rect") && req["crop_rect"] is Dictionary<string, object>)
            {
                var cr = (Dictionary<string, object>)req["crop_rect"];
                int rx = GetInt(cr, "x", capX);
                int ry = GetInt(cr, "y", capY);
                int rw = GetInt(cr, "width", capW);
                int rh = GetInt(cr, "height", capH);

                int left = Math.Max(vScreen.Left, rx);
                int top = Math.Max(vScreen.Top, ry);
                int right = Math.Min(vScreen.Right, rx + rw);
                int bottom = Math.Min(vScreen.Bottom, ry + rh);

                if (right - left >= 80 && bottom - top >= 80)
                {
                    capX = left;
                    capY = top;
                    capW = right - left;
                    capH = bottom - top;
                }
            }

            int maxWidth = GetInt(req, "max_width", 1366);
            string format = GetString(req, "format", "jpeg").ToLowerInvariant();
            long quality = GetInt(req, "quality", 84);
            string savePath = GetString(req, "save_path", "");
            long targetHwnd = GetLong(req, "hwnd", 0);

            using (Bitmap rawBmp = new Bitmap(capW, capH, PixelFormat.Format24bppRgb))
            {
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
                                // PW_RENDERFULLCONTENT = 0x00000002
                                printed = PrintWindow(new IntPtr(targetHwnd), hdc, 2);
                            }
                            finally
                            {
                                g.ReleaseHdc(hdc);
                            }
                        }

                        if (!printed)
                        {
                            throw new Exception(
                                "Screen capture failed (" + copyEx.Message + "). Ensure the Windows desktop is unlocked and running in an interactive user session."
                            );
                        }
                    }
                }

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

                        return new Dictionary<string, object>
                        {
                            { "success", true },
                            { "base64", Convert.ToBase64String(bytes) },
                            { "format", format },
                            { "byte_length", bytes.Length },
                            { "saved_path", string.IsNullOrEmpty(savePath) ? null : savePath },
                            { "capture_rect", new Dictionary<string, object>
                                {
                                    { "x", capX },
                                    { "y", capY },
                                    { "width", capW },
                                    { "height", capH }
                                }
                            },
                            { "image_size", new Dictionary<string, object>
                                {
                                    { "width", outW },
                                    { "height", outH }
                                }
                            }
                        };
                    }
                }
            }
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

        private static void WakeBrowserAccessibility(IntPtr rootHwnd)
        {
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
                        SendMessageTimeout(childHwnd, WM_GETOBJECT, IntPtr.Zero, new IntPtr(unchecked((int)0xFFFFFFFC)), SMTO_ABORTIFHUNG, 150, out res);
                    }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
        }

        private static Dictionary<string, object> CmdUiaInspect(Dictionary<string, object> req)
        {
            Stopwatch sw = Stopwatch.StartNew();
            long hwndVal = GetLong(req, "hwnd", 0);
            string query = GetString(req, "query", "").Trim();
            int maxElements = Math.Max(10, Math.Min(400, GetInt(req, "max_elements", 180)));
            int timeoutMs = Math.Max(300, Math.Min(4000, GetInt(req, "timeout_ms", 1800)));

            IntPtr targetHwnd = hwndVal != 0 ? new IntPtr(hwndVal) : GetForegroundWindow();
            if (targetHwnd == IntPtr.Zero)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "No target window handle for UIA inspection" }
                };
            }

            WakeBrowserAccessibility(targetHwnd);

            AutomationElement rootEl;
            try
            {
                rootEl = AutomationElement.FromHandle(targetHwnd);
            }
            catch (Exception ex)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "AutomationElement.FromHandle failed: " + ex.Message }
                };
            }

            if (rootEl == null)
            {
                return new Dictionary<string, object>
                {
                    { "success", false },
                    { "error", "AutomationElement is null" }
                };
            }

            Rectangle vScreen = SystemInformation.VirtualScreen;
            var elements = new List<Dictionary<string, object>>();
            var queue = new Queue<KeyValuePair<AutomationElement, int>>();
            queue.Enqueue(new KeyValuePair<AutomationElement, int>(rootEl, 0));

            TreeWalker walker = TreeWalker.ControlViewWalker;
            int visited = 0;

            while (queue.Count > 0 && elements.Count < maxElements && sw.ElapsedMilliseconds < timeoutMs && visited < 950)
            {
                var currentPair = queue.Dequeue();
                AutomationElement el = currentPair.Key;
                int depth = currentPair.Value;
                visited++;

                if (depth > 0)
                {
                    try
                    {
                        var cur = el.Current;
                        if (!cur.IsOffscreen)
                        {
                            System.Windows.Rect br = cur.BoundingRectangle;
                            if (!br.IsEmpty && !double.IsInfinity(br.Width) && !double.IsInfinity(br.Height) && br.Width >= 6 && br.Height >= 6)
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
                                    string className = (cur.ClassName ?? "").Trim();

                                    bool isInteractive =
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

                                    if (!string.IsNullOrEmpty(name) || !string.IsNullOrEmpty(autoId) || !string.IsNullOrEmpty(helpText) || ctrlType == "Edit")
                                    {
                                        if (name.Length > 140) name = name.Substring(0, 140);

                                        int cx = x + w / 2;
                                        int cy = y + h / 2;

                                        double matchScore = ScoreUiaElement(query, name, autoId, helpText, ctrlType, isInteractive);

                                        elements.Add(new Dictionary<string, object>
                                        {
                                            { "index", elements.Count },
                                            { "name", name },
                                            { "automation_id", autoId },
                                            { "help_text", helpText },
                                            { "control_type", ctrlType },
                                            { "class_name", className },
                                            { "is_interactive", isInteractive },
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
                                        });
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

            Dictionary<string, object> bestMatch = null;
            if (!string.IsNullOrEmpty(query) && elements.Count > 0)
            {
                double topScore = 0;
                foreach (var item in elements)
                {
                    double s = Convert.ToDouble(item["score"]);
                    if (s > topScore)
                    {
                        topScore = s;
                        bestMatch = item;
                    }
                }
                if (topScore < 0.58) bestMatch = null;
            }

            sw.Stop();
            return new Dictionary<string, object>
            {
                { "success", true },
                { "hwnd", targetHwnd.ToInt64() },
                { "elapsed_ms", sw.ElapsedMilliseconds },
                { "visited_nodes", visited },
                { "element_count", elements.Count },
                { "best_match", bestMatch },
                { "elements", elements }
            };
        }

        private static double ScoreUiaElement(string query, string name, string autoId, string helpText, string ctrlType, bool isInteractive)
        {
            if (string.IsNullOrEmpty(query)) return 0;

            string q = NormalizeText(query);
            string qCore = StripUiSuffixWords(q);
            if (string.IsNullOrEmpty(qCore)) qCore = q;

            string n = NormalizeText(name);
            string a = NormalizeText(autoId);
            string h = NormalizeText(helpText);

            double score = 0;

            if (!string.IsNullOrEmpty(n))
            {
                if (n == q || n == qCore) score = 0.96;
                else if (n.StartsWith(qCore) || qCore.StartsWith(n))
                {
                    double ratio = (double)Math.Min(n.Length, qCore.Length) / Math.Max(n.Length, qCore.Length);
                    score = Math.Max(score, 0.78 + ratio * 0.16);
                }
                else if (n.Contains(qCore))
                {
                    score = Math.Max(score, 0.76);
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
                                if (nt == qt || (qt.Length >= 4 && nt.Contains(qt)))
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
                            score = Math.Max(score, recall * 0.65 + precision * 0.25);
                        }
                    }
                }
            }

            if (!string.IsNullOrEmpty(a))
            {
                if (a == qCore) score = Math.Max(score, 0.90);
                else if (a.Contains(qCore)) score = Math.Max(score, 0.72);
            }

            if (!string.IsNullOrEmpty(h))
            {
                if (h == qCore) score = Math.Max(score, 0.88);
                else if (h.Contains(qCore)) score = Math.Max(score, 0.70);
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
