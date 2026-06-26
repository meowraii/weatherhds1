param(
    [string]$Version = '26.05.29',
    [string]$Output = 'bin/weatherhds.exe'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pngPath = Join-Path $repoRoot 'public/images/favicon.png'
$icoPath = Join-Path $repoRoot 'build/windows/weatherhds.ico'
$manifestPath = Join-Path $repoRoot 'build/windows/app.manifest'
$versionInfoPath = Join-Path $repoRoot 'build/windows/versioninfo.json'
$resourcePath = Join-Path $repoRoot 'resource_windows_amd64.syso'
$outputPath = Join-Path $repoRoot $Output
$outputDir = Split-Path -Parent $outputPath

function Convert-PngToIco {
    param(
        [Parameter(Mandatory = $true)][string]$Png,
        [Parameter(Mandatory = $true)][string]$Ico
    )

    $pngBytes = [System.IO.File]::ReadAllBytes($Png)
    if ($pngBytes.Length -lt 24) {
        throw 'Invalid PNG file.'
    }

    $pngSignature = [byte[]](137,80,78,71,13,10,26,10)
    for ($i = 0; $i -lt $pngSignature.Length; $i++) {
        if ($pngBytes[$i] -ne $pngSignature[$i]) {
            throw 'Input file is not a PNG image.'
        }
    }

    $width = ([uint32]$pngBytes[16] -shl 24) -bor ([uint32]$pngBytes[17] -shl 16) -bor ([uint32]$pngBytes[18] -shl 8) -bor [uint32]$pngBytes[19]
    $height = ([uint32]$pngBytes[20] -shl 24) -bor ([uint32]$pngBytes[21] -shl 16) -bor ([uint32]$pngBytes[22] -shl 8) -bor [uint32]$pngBytes[23]

    $widthByte = if ($width -ge 256) { [byte]0 } else { [byte]$width }
    $heightByte = if ($height -ge 256) { [byte]0 } else { [byte]$height }

    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($stream)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)
    $writer.Write([byte]$widthByte)
    $writer.Write([byte]$heightByte)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)
    $writer.Write($pngBytes)
    [System.IO.File]::WriteAllBytes($Ico, $stream.ToArray())
    $writer.Dispose()
    $stream.Dispose()
}

if (-not (Test-Path -LiteralPath $pngPath)) {
    throw "Favicon PNG was not found at $pngPath"
}

New-Item -ItemType Directory -Path (Split-Path -Parent $icoPath) -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Convert-PngToIco -Png $pngPath -Ico $icoPath

go run github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest `
    -64 `
    -o $resourcePath `
    -manifest $manifestPath `
    -icon $icoPath `
    -product-name 'WeatherHDS Server' `
    -description 'WeatherHDS Server' `
    -company 'METEOchannel / meowraii' `
    -copyright 'Copyright (c) meowraii' `
    -internal-name 'weatherhds' `
    -original-name 'weatherhds.exe' `
    -file-version $Version `
    -product-version $Version `
    -propagate-ver-strings `
    $versionInfoPath

if ($LASTEXITCODE -ne 0) {
    throw 'goversioninfo resource generation failed.'
}

Push-Location $repoRoot
try {
    $env:GOOS = 'windows'
    $env:GOARCH = 'amd64'
    go build -trimpath -ldflags "-s -w" -o $outputPath .
    if ($LASTEXITCODE -ne 0) {
        throw 'go build failed.'
    }
}
finally {
    Remove-Item Env:GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    Pop-Location
}

Write-Output "Built $outputPath"
