param(
    [string]$ExePath = 'dist/WeatherHDS-Windows-x86_64-Portable/WeatherHDS Server.exe',
    [int]$Port = 3000,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedExePath = Join-Path $repoRoot $ExePath
$buildScript = Join-Path $PSScriptRoot 'build-windows.ps1'

if (-not $SkipBuild -or -not (Test-Path -LiteralPath $resolvedExePath)) {
    & $buildScript
}

$exeFullPath = (Resolve-Path -LiteralPath $resolvedExePath).Path
$ruleName = 'WeatherHDS API ' + $Port
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$check = netsh advfirewall firewall show rule name="$ruleName"
$ruleExists = $check -and -not ($check -match 'No rules match the specified criteria')

if (-not $ruleExists) {
    if ($isAdmin) {
        netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow program="$exeFullPath" protocol=TCP localport=$Port enable=yes profile=any | Out-Null
    } else {
        Write-Warning "Firewall rule '$ruleName' does not exist. Run this script once as Administrator to add it and stop repeat prompts."
    }
}

Push-Location $repoRoot
try {
    & $exeFullPath
}
finally {
    Pop-Location
}
