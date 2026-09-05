Add-Type -AssemblyName System.Drawing

$iconsDir = "b:\workspace\01_active\need_more_jlu\icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
}

function Create-Icon([int]$sz, [string]$outPath) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rect = New-Object System.Drawing.Rectangle(0, 0, $sz, $sz)
    $c1 = [System.Drawing.Color]::FromArgb(255, 30, 64, 175) # #1e40af
    $c2 = [System.Drawing.Color]::FromArgb(255, 2, 132, 199) # #0284c7
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
    
    $radius = [math]::Max(2, [int]($sz * 0.2))
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius*2, $radius*2, 180, 90)
    $path.AddArc($sz - $radius*2, 0, $radius*2, $radius*2, 270, 90)
    $path.AddArc($sz - $radius*2, $sz - $radius*2, $radius*2, $radius*2, 0, 90)
    $path.AddArc(0, $sz - $radius*2, $radius*2, $radius*2, 90, 90)
    $path.CloseFigure()
    
    $g.FillPath($brush, $path)

    # Draw White text "JLU"
    $fontSize = [math]::Max(6, [int]($sz * 0.35))
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $g.DrawString("JLU", $font, [System.Drawing.Brushes]::White, [float]($sz/2), [float]($sz/2), $sf)
    
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created icon $sz -> $outPath"
}

Create-Icon 16 "$iconsDir\icon16.png"
Create-Icon 48 "$iconsDir\icon48.png"
Create-Icon 128 "$iconsDir\icon128.png"
