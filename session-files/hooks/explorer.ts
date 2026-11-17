// Shows a file in Windows Explorer: a new window, the file selected, raised in front.

// Opens a new Explorer window with the file selected (started by Windows
// through WMI, so it outlives this script), then raises that window.
// Windows won't let a background process raise a window while the person is
// using another app, so it joins the foreground thread's input first and,
// failing that, taps Alt: the two usual ways past that lock.
// Exit codes: 0 shown in front, 3 no such file, 4 opened but left behind.
export const SHOW_IN_EXPLORER = `
$ErrorActionPreference = 'Stop'
$p = $env:SESSION_FILES_PATH
if (-not (Test-Path -LiteralPath $p)) { exit 3 }
Add-Type -Namespace SessionFiles -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr x);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
$api = [SessionFiles.Win]
$shell = New-Object -ComObject Shell.Application
$before = @($shell.Windows() | ForEach-Object { [int64]$_.HWND })

# Launched through WMI so Windows itself starts explorer.exe: a child of this
# script would be killed with it when the mod's process call ends, and the
# window it was handing over closed with it.
$line = "explorer.exe /select,\`"$p\`""
try {
  $made = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $line }
  if ($made.ReturnValue -ne 0) { throw "WMI $($made.ReturnValue)" }
} catch {
  Start-Process explorer.exe -ArgumentList "/select,\`"$p\`""
}

$h = [IntPtr]::Zero
for ($i = 0; $i -lt 60 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 100
  foreach ($win in @($shell.Windows())) {
    if ($before -notcontains [int64]$win.HWND) { $h = [IntPtr]$win.HWND; break }
  }
}
if ($h -eq [IntPtr]::Zero) { exit 4 }

if ($api::IsIconic($h)) { [void]$api::ShowWindow($h, 9) } else { [void]$api::ShowWindow($h, 5) }
$fg = $api::GetForegroundWindow()
$them = $api::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
$me = $api::GetCurrentThreadId()
$joined = ($them -ne 0) -and ($them -ne $me) -and $api::AttachThreadInput($me, $them, $true)
[void]$api::BringWindowToTop($h)
[void]$api::SetForegroundWindow($h)
if ($joined) { [void]$api::AttachThreadInput($me, $them, $false) }
if ($api::GetForegroundWindow() -ne $h) {
  $api::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  $api::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [void]$api::SetForegroundWindow($h)
  $api::SwitchToThisWindow($h, $true)
}
Start-Sleep -Milliseconds 150
if ($api::GetForegroundWindow() -ne $h) { exit 4 }
exit 0
`

/** powershell -EncodedCommand wants base64 of UTF-16LE text: nothing to quote or escape. */
export function encodeForPowerShell(script: string): string {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i)
    bytes.push(code & 0xff, code >> 8)
  }
  const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += digits.charAt((n >> 18) & 63) + digits.charAt((n >> 12) & 63)
    out += b === undefined ? '=' : digits.charAt((n >> 6) & 63)
    out += c === undefined ? '=' : digits.charAt(n & 63)
  }
  return out
}

