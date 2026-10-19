$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT' -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This installer supports Windows x64 only. CI installs the pinned Linux build separately.'
}

$version = '0.168.0'
$expected = 'f6cf760426de305cdd85c6eaa7e203a4d623e74cc6ad8fea61228caf1e59f243'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$destination = Join-Path $root '.tools\hugo'
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('fs-notes-hugo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $archive = Join-Path $temporary "hugo_${version}_windows-amd64.zip"
    Invoke-WebRequest -Uri "https://github.com/gohugoio/hugo/releases/download/v${version}/hugo_${version}_windows-amd64.zip" -OutFile $archive -TimeoutSec 180
    $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        throw "Hugo checksum mismatch: expected $expected, received $actual."
    }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Expand-Archive -Path $archive -DestinationPath $destination -Force
    & (Join-Path $destination 'hugo.exe') version
    if ($LASTEXITCODE -ne 0) { throw 'Installed Hugo did not start.' }
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
