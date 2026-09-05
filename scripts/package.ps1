# package.ps1 - Package the extension into a clean zip archive for Store submission
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$distZip = "need_more_jlu_v$version.zip"

Write-Host "Packaging need_more_jlu v$version -> $distZip ..."

if (Test-Path $distZip) {
    Remove-Item $distZip -Force
}

$includeItems = @(
    "manifest.json",
    "_locales",
    "assets",
    "background",
    "config",
    "content",
    "dashboard",
    "data",
    "icons",
    "options",
    "popup"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($distZip, [System.IO.Compression.ZipArchiveMode]::Create)

$rootPath = (Get-Location).Path

foreach ($item in $includeItems) {
    if (Test-Path $item) {
        $itemInfo = Get-Item $item
        if ($itemInfo -is [System.IO.DirectoryInfo]) {
            $files = Get-ChildItem -Path $item -Recurse -File
            foreach ($file in $files) {
                $relPath = $file.FullName.Substring($rootPath.Length + 1).Replace('\', '/')
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        } else {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $itemInfo.FullName, $item, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
}

$zip.Dispose()

$zipInfo = Get-Item $distZip
Write-Host " Successfully created $distZip ($([math]::Round($zipInfo.Length / 1MB, 2)) MB / $($zipInfo.Length) bytes)"
