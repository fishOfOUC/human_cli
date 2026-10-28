param([int]$X, [int]$Y, [int]$Width, [int]$Height)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = $null
$graphics = $null
$stream = $null
try {
    $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($X, $Y, 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
    if ($stream) { $stream.Dispose() }
}
