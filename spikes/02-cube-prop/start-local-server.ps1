# Startet den lokalen FiveM-Testserver im sichtbaren Fenster (Strg+C beendet ihn).
#   powershell -File spikes\02-cube-prop\start-local-server.ps1
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fx = Join-Path $root '.local\fxserver'
$data = Join-Path $fx 'server-data'
$cfg = Join-Path $data 'server.cfg'

if (-not (Test-Path $cfg)) { throw "server.cfg fehlt. Zuerst setup-local-server.ps1 ausfuehren." }
if ((Get-Content $cfg -Raw) -match 'HIER_DEIN_CFX_LIZENZSCHLUESSEL') {
    throw "Kein Lizenzschluessel: Trage deinen Cfx.re-Schluessel in $cfg bei sv_licenseKey ein (https://portal.cfx.re)."
}

Set-Location $data
& (Join-Path $fx 'FXServer.exe') +exec server.cfg
