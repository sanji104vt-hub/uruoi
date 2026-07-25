# Resize editor-shot product photos for web delivery.
# Source photos are 2160x2880 smartphone shots (1.1-1.8MB each), far larger than
# the ~360-540px display width. Downscale long side to 1440px at JPEG quality 82.
# Originals remain in Downloads/shohin-shashin, so this is not destructive.
# NOTE: keep this file ASCII-only. PowerShell 5.1 misparses UTF-8 (no BOM) .ps1
# files that contain multi-byte characters.

Add-Type -AssemblyName System.Drawing

$dir = "public\images\editor"
$maxLongSide = 1440
$quality = 82

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

$totalBefore = 0
$totalAfter = 0
$count = 0

Get-ChildItem -Path $dir -Filter *.jpg | ForEach-Object {
    $file = $_.FullName
    $name = $_.Name
    $sizeBefore = $_.Length
    $totalBefore += $sizeBefore

    $img = [System.Drawing.Image]::FromFile($file)
    $w = $img.Width
    $h = $img.Height
    $longSide = [Math]::Max($w, $h)

    if ($longSide -le $maxLongSide) {
        $img.Dispose()
        $totalAfter += $sizeBefore
        Write-Output ("  skip {0}: {1}x{2} already small" -f $name, $w, $h)
        return
    }

    $scale = $maxLongSide / $longSide
    $newW = [int][Math]::Round($w * $scale)
    $newH = [int][Math]::Round($h * $scale)

    $bmp = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $newW, $newH)
    $g.Dispose()
    $img.Dispose()

    $tmp = "$file.tmp"
    $bmp.Save($tmp, $jpegCodec, $encoderParams)
    $bmp.Dispose()

    Remove-Item $file -Force
    Rename-Item $tmp $file

    $sizeAfter = (Get-Item $file).Length
    $totalAfter += $sizeAfter
    $count++
    Write-Output ("  ok   {0}: {1}x{2} -> {3}x{4}  {5}KB -> {6}KB" -f $name, $w, $h, $newW, $newH, [int]($sizeBefore/1KB), [int]($sizeAfter/1KB))
}

Write-Output ""
Write-Output ("resized: {0} files" -f $count)
Write-Output ("total  : {0}MB -> {1}MB" -f [Math]::Round($totalBefore/1MB,1), [Math]::Round($totalAfter/1MB,1))
