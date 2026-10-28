param([Parameter(Mandatory=$true)][long]$Handle, [Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ConfigUiWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$rect = New-Object ConfigUiWindowCapture+Rect
[void][ConfigUiWindowCapture]::SetThreadDpiAwarenessContext([IntPtr](-4))
if (![ConfigUiWindowCapture]::GetWindowRect([IntPtr]$Handle, [ref]$rect)) { throw 'Cannot read test window bounds' }
$bitmap = New-Object System.Drawing.Bitmap(($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$dc = $graphics.GetHdc()
try {
  if (![ConfigUiWindowCapture]::PrintWindow([IntPtr]$Handle, $dc, 2)) { throw 'Cannot render test window' }
} finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
try { $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bitmap.Dispose() }
