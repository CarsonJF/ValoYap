<#
.SYNOPSIS
  ValoYap PTT spike: does Valorant accept a synthetic (SendInput) push-to-talk press?

.DESCRIPTION
  Holds your PTT key down using several injection methods, one trial at a time, with a
  countdown before each. Run a custom game / The Range, set your voice-chat to push-to-talk
  on the same key, and watch whether the "speaking" indicator lights up on your name
  (party/team panel) during each trial. Nothing here talks to the game: it only sends
  keyboard events to Windows, exactly like a macro keyboard would.

  Methods tried (in order):
    1. SendInput, hardware scan code      (KEYEVENTF_SCANCODE)  <- ValoYap's default
    2. SendInput, virtual-key             (wVk)
    3. keybd_event, scan code             (legacy API)
  Control trial (optional, -Control): taps the key in the *active window* so you can verify the
  script injects at all (open Notepad first).

.PARAMETER Key
  Your in-game PTT key. Examples: V, Z, CapsLock, Space, F13, LShift, Num0, MouseX1 (not supported here).

.PARAMETER HoldSeconds
  How long each trial holds the key (default 4).

.PARAMETER CountdownSeconds
  Time to alt-tab into the game before each trial (default 5).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\PttSpike.ps1 -Key V

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\PttSpike.ps1 -Key F13 -Methods scancode
#>
param(
  [Parameter(Mandatory = $true)][string]$Key,
  [int]$HoldSeconds = 4,
  [int]$CountdownSeconds = 5,
  [ValidateSet("scancode", "vk", "keybd_event")][string[]]$Methods = @("scancode", "vk", "keybd_event"),
  [switch]$Control
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Native {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion u; }
  [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public static void Key(ushort vk, ushort scan, bool up, bool ext, bool useScan) {
    uint f = (up ? 0x2u : 0u) | (ext ? 0x1u : 0u) | (useScan ? 0x8u : 0u);
    var i = new INPUT { type = 1 };
    i.u.ki = new KEYBDINPUT { wVk = useScan ? (ushort)0 : vk, wScan = scan, dwFlags = f };
    uint sent = SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) throw new Exception("SendInput failed, Win32 error " + Marshal.GetLastWin32Error() + " (blocked by UIPI? try running elevated if the game is elevated)");
  }
}
'@

# name -> vk, scan (set 1), extended
$table = @{
  "SPACE" = @(0x20, 0x39, $false); "CAPSLOCK" = @(0x14, 0x3A, $false); "TAB" = @(0x09, 0x0F, $false)
  "LSHIFT" = @(0xA0, 0x2A, $false); "LCTRL" = @(0xA2, 0x1D, $false); "LALT" = @(0xA4, 0x38, $false)
  "RCTRL" = @(0xA3, 0x1D, $true);  "RALT" = @(0xA5, 0x38, $true)
  "INSERT" = @(0x2D, 0x52, $true); "DELETE" = @(0x2E, 0x53, $true); "HOME" = @(0x24, 0x47, $true); "END" = @(0x23, 0x4F, $true)
  "UP" = @(0x26, 0x48, $true); "DOWN" = @(0x28, 0x50, $true); "LEFT" = @(0x25, 0x4B, $true); "RIGHT" = @(0x27, 0x4D, $true)
}
$letters = @{ Q=0x10;W=0x11;E=0x12;R=0x13;T=0x14;Y=0x15;U=0x16;I=0x17;O=0x18;P=0x19;A=0x1E;S=0x1F;D=0x20;F=0x21;G=0x22;H=0x23;J=0x24;K=0x25;L=0x26;Z=0x2C;X=0x2D;C=0x2E;V=0x2F;B=0x30;N=0x31;M=0x32 }
foreach ($l in $letters.Keys) { $table[$l] = @([int][char]$l, $letters[$l], $false) }
for ($i = 0; $i -le 9; $i++) { $table["NUM$i"] = @((0x60 + $i), @(0x52,0x4F,0x50,0x51,0x4B,0x4C,0x4D,0x47,0x48,0x49)[$i], $false) }
for ($i = 1; $i -le 10; $i++) { $table["F$i"] = @((0x6F + $i), (0x3A + $i), $false) }
$table["F11"] = @(0x7A, 0x57, $false); $table["F12"] = @(0x7B, 0x58, $false)
for ($i = 13; $i -le 24; $i++) { $table["F$i"] = @((0x6F + $i), $(if ($i -le 15) { 0x64 + $i - 13 } else { 0x67 + $i - 16 }), $false) }

$k = $table[$Key.ToUpper()]
if (-not $k) { Write-Host "Unknown key '$Key'. Known: $(($table.Keys | Sort-Object) -join ', ')" -ForegroundColor Red; exit 1 }
$vk = [uint16]$k[0]; $scan = [uint16]$k[1]; $ext = [bool]$k[2]

function Press([string]$method, [bool]$down) {
  switch ($method) {
    "scancode"    { [Native]::Key($vk, $scan, -not $down, $ext, $true) }
    "vk"          { [Native]::Key($vk, $scan, -not $down, $ext, $false) }
    "keybd_event" { $f = 8; if (-not $down) { $f = $f -bor 2 }; if ($ext) { $f = $f -bor 1 }; [Native]::keybd_event([byte]0, [byte]$scan, [uint32]$f, [UIntPtr]::Zero) }
  }
}

function ActiveWindow { $sb = New-Object System.Text.StringBuilder 256; [void][Native]::GetWindowText([Native]::GetForegroundWindow(), $sb, 256); $sb.ToString() }

Write-Host ""
Write-Host "ValoYap PTT spike" -ForegroundColor Red
Write-Host "Key: $Key  (vk=0x$($vk.ToString('X2')) scan=0x$($scan.ToString('X2')) ext=$ext)"
Write-Host "In Valorant: Settings > Audio > Voice Chat > Party/Team Voice = Push To Talk, bound to '$Key'."
Write-Host "Join a custom game / The Range, then watch your own speaking indicator."
Write-Host ""

if ($Control) {
  Write-Host "CONTROL: focus Notepad. Tapping '$Key' in $CountdownSeconds s..."
  Start-Sleep -Seconds $CountdownSeconds
  Press "scancode" $true; Start-Sleep -Milliseconds 80; Press "scancode" $false
  Write-Host "Control done. Active window was: $(ActiveWindow)"
}

$results = @()
foreach ($m in $Methods) {
  Write-Host "Trial [$m]: switch to Valorant now..." -ForegroundColor Yellow
  for ($s = $CountdownSeconds; $s -gt 0; $s--) { Write-Host -NoNewline "$s.. "; Start-Sleep -Seconds 1 }
  Write-Host ""
  $win = ActiveWindow
  try {
    Press $m $true
    Write-Host "  >> HOLDING $Key via $m for $HoldSeconds s (active window: '$win')" -ForegroundColor Green
    Start-Sleep -Seconds $HoldSeconds
  } finally {
    Press $m $false
    Write-Host "  >> released" -ForegroundColor Green
  }
  $ans = Read-Host "  Did the in-game speaking indicator / mic activity show? (y/n)"
  $results += [pscustomobject]@{ Method = $m; ActiveWindow = $win; Worked = $ans }
  Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "RESULTS (paste into docs/PTT_SPIKE.md)" -ForegroundColor Red
$results | Format-Table -AutoSize
