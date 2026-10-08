# Richtet den lokalen Test-Server ein: kopiert server.cfg (falls noch keine existiert) und den Test-Helfer.
# Aufruf aus dem Projektordner:  powershell -File spikes\02-cube-prop\setup-local-server.ps1
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$data = Join-Path $root '.local\fxserver\server-data'
if (-not (Test-Path $data)) { throw "server-data fehlt: $data (cfx-server-data klonen)" }

$cfg = Join-Path $data 'server.cfg'
if (-not (Test-Path $cfg)) {
    Copy-Item (Join-Path $PSScriptRoot 'server.cfg.template') $cfg
    Write-Host "server.cfg angelegt: $cfg"
    Write-Host "WICHTIG: Lizenzschluessel eintragen (sv_licenseKey)."
} else {
    Write-Host "server.cfg existiert schon, nicht ueberschrieben."
}

$dest = Join-Path $data 'resources\[local]\forge_test_runner'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'forge_test_runner\*') $dest -Recurse -Force
Write-Host "Test-Helfer kopiert nach: $dest"
