$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Dist = Join-Path $Root "dist"
$PackageRoot = Join-Path $Dist "MicroDynReleaseTracker"
$ZipPath = Join-Path $Dist "MicroDynReleaseTracker.zip"

if (Test-Path $PackageRoot) {
  Remove-Item -LiteralPath $PackageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $PackageRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageRoot "data") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageRoot "uploads") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageRoot "public") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageRoot "scripts") | Out-Null

Copy-Item -LiteralPath (Join-Path $Root "package.json") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $Root "README.md") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $Root "schema.sql") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $Root "server.js") -Destination $PackageRoot
Copy-Item -LiteralPath (Join-Path $Root "public\index.html") -Destination (Join-Path $PackageRoot "public")
Copy-Item -LiteralPath (Join-Path $Root "public\styles.css") -Destination (Join-Path $PackageRoot "public")
Copy-Item -LiteralPath (Join-Path $Root "public\app.js") -Destination (Join-Path $PackageRoot "public")

@"
@echo off
cd /d "%~dp0"
node server.js
"@ | Set-Content -LiteralPath (Join-Path $PackageRoot "start-tracker.bat") -Encoding ASCII

@"
@echo off
cd /d "%~dp0"
node server.js --init-db
"@ | Set-Content -LiteralPath (Join-Path $PackageRoot "initialize-database.bat") -Encoding ASCII

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

Compress-Archive -LiteralPath $PackageRoot -DestinationPath $ZipPath
Write-Host "Package created: $ZipPath"
