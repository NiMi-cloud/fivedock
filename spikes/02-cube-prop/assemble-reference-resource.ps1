# Baut die REFERENZ-Resource "forge_cube" aus den Referenz-Exporten (Blender + Sollumz) und dem lokalen
# Vergleichswerkzeug (CodeWalker). Damit wird der Testaufbau (Server, Spawn-Befehl) bewiesen, bevor
# unser eigener Schreiber ins Spiel kommt.
#
#   powershell -File spikes\02-cube-prop\assemble-reference-resource.ps1 [-Regenerate]
#
# -Regenerate  exportiert zuerst Würfel + YTYP neu aus Blender und erzeugt die Textur neu.
param([switch]$Regenerate)
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dotnet = Join-Path $root '.dotnet\dotnet.exe'
$oracle = Join-Path $root '.local\oracle\bin\Release\net10.0\Oracle.dll'
$blender = Join-Path $root '.local\blender\blender-4.5.14-windows-x64\blender.exe'
$ex = Join-Path $root '.local\reference-exports\cube'
$res = Join-Path $root '.local\fxserver\server-data\resources\[local]\forge_cube'

$env:DOTNET_ROOT = Join-Path $root '.dotnet'
$env:DOTNET_NOLOGO = '1'

function Invoke-Oracle([string]$mode, [string]$in, [string]$out) {
    & $dotnet $oracle $mode $in $out
    if ($LASTEXITCODE -ne 0) { throw "Oracle '$mode' fehlgeschlagen." }
}

if ($Regenerate) {
    Remove-Item (Join-Path $ex 'gen8'), (Join-Path $ex 'gen9') -Recurse -Force -ErrorAction SilentlyContinue
    & $blender -b --factory-startup --python-exit-code 1 --python (Join-Path $root '.local\scripts\make_reference_cube.py') -- $ex
    if ($LASTEXITCODE -ne 0) { throw 'Blender-Export fehlgeschlagen.' }
    node (Join-Path $PSScriptRoot 'make-cube-texture.ts') (Join-Path $ex 'ytd')
    if ($LASTEXITCODE -ne 0) { throw 'Textur-Erzeugung fehlgeschlagen.' }
}

# Legacy (gen8) ist, was FiveM lädt.
Invoke-Oracle 'ydr' (Join-Path $ex 'gen8\forge_cube.ydr.xml') (Join-Path $ex 'gen8\forge_cube.ydr')
Invoke-Oracle 'ytyp' (Join-Path $ex 'gen8\forge_cube.ytyp.xml') (Join-Path $ex 'gen8\forge_cube.ytyp')
Invoke-Oracle 'ytd' (Join-Path $ex 'ytd\forge_cube.ytd.xml') (Join-Path $ex 'ytd\forge_cube.ytd')

New-Item -ItemType Directory -Force -Path (Join-Path $res 'stream') | Out-Null
Copy-Item (Join-Path $ex 'gen8\forge_cube.ydr') (Join-Path $res 'stream') -Force
Copy-Item (Join-Path $ex 'gen8\forge_cube.ytyp') (Join-Path $res 'stream') -Force
Copy-Item (Join-Path $ex 'ytd\forge_cube.ytd') (Join-Path $res 'stream') -Force

$manifest = @"
fx_version 'cerulean'
game 'gta5'

author 'fivedock'
description 'Referenz-Prop: Wuerfel mit Textur und Kollision (aus Blender + Sollumz + CodeWalker)'
version '0.1.0'

files {
    'stream/forge_cube.ytyp',
}

data_file 'DLC_ITYP_REQUEST' 'stream/forge_cube.ytyp'
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $res 'fxmanifest.lua'), $manifest, $utf8NoBom)

Write-Host "Resource gebaut: $res"
Get-ChildItem $res -Recurse -File | ForEach-Object { '  {0}  {1} Bytes' -f $_.FullName.Substring($res.Length + 1), $_.Length }

# In server.cfg freischalten (falls noch auskommentiert oder fehlend).
$cfg = Join-Path $root '.local\fxserver\server-data\server.cfg'
if (Test-Path $cfg) {
    $text = Get-Content $cfg -Raw
    if ($text -match '(?m)^\s*#\s*ensure forge_cube\s*$') {
        $text = $text -replace '(?m)^\s*#\s*ensure forge_cube\s*$', 'ensure forge_cube'
        [System.IO.File]::WriteAllText($cfg, $text, $utf8NoBom)
        Write-Host 'server.cfg: "ensure forge_cube" aktiviert.'
    } elseif ($text -notmatch '(?m)^\s*ensure forge_cube\s*$') {
        [System.IO.File]::WriteAllText($cfg, $text + "`nensure forge_cube`n", $utf8NoBom)
        Write-Host 'server.cfg: "ensure forge_cube" angehaengt.'
    }
}
