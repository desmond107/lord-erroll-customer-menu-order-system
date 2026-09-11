<#
.SYNOPSIS
  The Lord Erroll ordering platform - installer for Windows.

.DESCRIPTION
  Sets the platform up on a Windows machine and, with -Service, registers it to
  start at boot and restart if it ever stops.

  Safe to re-run. Dependencies are reinstalled, the app is rebuilt, and the seed
  only adds what is missing, so an existing menu and existing staff accounts are
  never clobbered.

  Windows has no native service manager for a plain executable, so -Service
  registers a Scheduled Task running as SYSTEM, triggered at startup with
  restart-on-failure. That needs no third-party wrapper such as NSSM.

.EXAMPLE
  .\deploy\install.ps1
  .\deploy\install.ps1 -Service -BaseUrl http://192.168.1.50:4000 -BackupDir D:\backups\lord-erroll
#>
[CmdletBinding()]
param(
  # Register the boot service (a Scheduled Task) and start it.
  [switch] $Service,
  # Port to listen on. Defaults to whatever .env already says, else 4000.
  [int]    $Port,
  # Address printed into every QR code, e.g. http://192.168.1.50:4000
  [string] $BaseUrl,
  # Where nightly snapshots are written. Use a drive that is not the server's own.
  [string] $BackupDir,
  # Add an inbound firewall rule for the port on private networks.
  [switch] $OpenFirewall,
  # Skip the database seed.
  [switch] $NoSeed
)

$ErrorActionPreference = 'Stop'

$Root    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env'

function Say  { param($m) Write-Host "`n$m" -ForegroundColor White }
function Info { param($m) Write-Host "  $m" }
function Warn { param($m) Write-Host "  ! $m" -ForegroundColor Yellow }
function Die  { param($m) Write-Host "`n$m`n" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 1. preflight
Say '1. Checking the machine'

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Die 'node is not installed. This needs Node.js 20 or newer.' }
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) { Die 'npm is not installed.' }

$NodeBin   = $nodeCmd.Source
$nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 20) { Die "Node $(& node -v) is too old. This needs 20 or newer." }
Info "node $(& node -v) at $NodeBin"

if ($Service -or $OpenFirewall) {
  $admin = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { Die 'Registering the service or the firewall rule needs an elevated PowerShell. Right-click, Run as administrator.' }
}

# ------------------------------------------------------------ 2. dependencies
Say '2. Installing dependencies'
Push-Location $Root
try {
  if (Test-Path (Join-Path $Root 'package-lock.json')) {
    & $npmCmd.Source ci
    if ($LASTEXITCODE -ne 0) { Warn 'npm ci failed, falling back to npm install'; & $npmCmd.Source install }
  } else {
    & $npmCmd.Source install
  }
  if ($LASTEXITCODE -ne 0) { Die 'Dependency install failed. The SQLite driver is a native module; if it tried to compile, install the Visual Studio Build Tools with the C++ workload and re-run.' }

  # ------------------------------------------------------------ 3. configuration
  Say '3. Writing .env'

  # Read and write through node so the parsing matches the server's own, and so
  # a value containing "=" survives the round trip.
  function Set-EnvValue {
    param([string] $Key, [string] $Value)
    & $NodeBin -e @'
const fs = require("fs"), [p, k, v] = process.argv.slice(1);
let t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
const re = new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=.*$", "m");
if (re.test(t)) t = t.replace(re, k + "=" + v);
else t += (t === "" || t.endsWith("\n") ? "" : "\n") + k + "=" + v + "\n";
fs.writeFileSync(p, t);
'@ $EnvFile $Key $Value
  }
  function Get-EnvValue {
    param([string] $Key)
    # No early return: node -e evaluates at the top level, where a bare
    # "return" is a syntax error rather than an exit.
    (& $NodeBin -e @'
const fs = require("fs"), [p, k] = process.argv.slice(1);
const t = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
const m = t.match(new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=(.*)$", "m"));
console.log(m ? m[1].trim() : "");
'@ $EnvFile $Key).Trim()
  }

  if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Root '.env.example') $EnvFile
    Info 'created .env from .env.example'
  } else {
    Info '.env already exists, keeping the values already in it'
  }

  # A session secret left at the example value lets anyone forge a staff session.
  $currentSecret = Get-EnvValue 'SESSION_SECRET'
  $exampleSecret = (Select-String -Path (Join-Path $Root '.env.example') -Pattern '^SESSION_SECRET=(.*)$').Matches.Groups[1].Value
  if ([string]::IsNullOrWhiteSpace($currentSecret) -or
      $currentSecret -eq $exampleSecret -or
      $currentSecret -eq 'change-me-before-go-live') {
    Set-EnvValue 'SESSION_SECRET' (& $NodeBin -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
    Info 'generated a new SESSION_SECRET'
  } else {
    Info 'SESSION_SECRET already set, left alone'
  }

  if ($Port) { Set-EnvValue 'PORT' "$Port"; Info "PORT=$Port" }
  $effectivePort = Get-EnvValue 'PORT'
  if ([string]::IsNullOrWhiteSpace($effectivePort)) { $effectivePort = '4000' }

  # The QR base URL is printed into every table card. Getting it wrong and
  # discovering it later means reprinting all of them, so this never guesses
  # silently: it fills in a detected address and says to confirm it.
  if ($BaseUrl) {
    Set-EnvValue 'PUBLIC_BASE_URL' $BaseUrl
    Info "PUBLIC_BASE_URL=$BaseUrl"
  } else {
    $currentUrl = Get-EnvValue 'PUBLIC_BASE_URL'
    # .env.example ships a placeholder hostname that only resolves if someone has
    # already added that local DNS record. Treat it as unset rather than printing
    # it back as configured: 54 cards pointing at a name that does not resolve is
    # an expensive way to find out.
    $exampleUrl = (Select-String -Path (Join-Path $Root '.env.example') -Pattern '^PUBLIC_BASE_URL=(.*)$').Matches.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($currentUrl) -or $currentUrl -eq $exampleUrl) {
      $lan = (& $NodeBin -e 'const os=require("os");const a=Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==="IPv4"&&!i.internal).map(i=>i.address);process.stdout.write(a[0]||"")')
      if ($lan) {
        Set-EnvValue 'PUBLIC_BASE_URL' "http://${lan}:$effectivePort"
        Warn "PUBLIC_BASE_URL set to http://${lan}:$effectivePort from this machine's"
        Warn 'current address. Confirm it is STATIC before printing table cards.'
        Warn 'To use a hostname instead, re-run with -BaseUrl and make sure the'
        Warn 'name resolves on the restaurant network first.'
      } else {
        Warn 'No LAN address found. Set PUBLIC_BASE_URL in .env by hand.'
      }
    } else {
      Info "PUBLIC_BASE_URL=$currentUrl"
    }
  }

  if ($BackupDir) { Set-EnvValue 'BACKUP_DIR' ($BackupDir -replace '\\', '/') }
  $effectiveBackup = Get-EnvValue 'BACKUP_DIR'
  if ([string]::IsNullOrWhiteSpace($effectiveBackup)) { $effectiveBackup = './data/backups' }
  $absBackup = [IO.Path]::GetFullPath((Join-Path $Root ($effectiveBackup -replace '/', '\')))
  if ($absBackup.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
    Warn "BACKUP_DIR is $effectiveBackup, which is on the server's own disk."
    Warn 'A backup on the disk it protects is not a backup. Re-run with'
    Warn '-BackupDir pointing at a second drive or a network share.'
  }
  Info "BACKUP_DIR=$effectiveBackup"

  Set-EnvValue 'NODE_ENV' 'production'
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'data') | Out-Null

  # ------------------------------------------------------------------ 4. build
  Say '4. Building the guest and staff app'
  & $npmCmd.Source run build
  if ($LASTEXITCODE -ne 0) { Die 'Build failed.' }

  # ------------------------------------------------------------------- 5. seed
  if ($NoSeed) {
    Say '5. Seed skipped (-NoSeed)'
  } else {
    Say '5. Seeding the database'
    Info 'Existing tables, menu items and staff are left untouched.'
    Info 'PINs and passwords for any NEW account are printed once, below.'
    & $npmCmd.Source run seed
    if ($LASTEXITCODE -ne 0) { Die 'Seed failed.' }
  }
}
finally { Pop-Location }

# ---------------------------------------------------------------- 6. service
$taskName = 'LordErrollPlatform'
if ($Service) {
  Say '6. Registering the boot service'

  # node is invoked directly rather than through npm.cmd. npm would sit between
  # the task and the server as an extra process, and stopping the task would
  # kill the wrapper instead of the handler that closes the database cleanly.
  $action = New-ScheduledTaskAction -Execute $NodeBin `
              -Argument "`"$Root\server\src\index.js`"" -WorkingDirectory $Root
  $trigger = New-ScheduledTaskTrigger -AtStartup
  # SYSTEM so the platform runs with nobody logged in, which a machine under the
  # bar counter never is.
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' `
                 -LogonType ServiceAccount -RunLevel Highest
  # A restaurant floor cannot wait for someone to notice the server died.
  $settings = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -StartWhenAvailable -RestartCount 999 `
                -RestartInterval (New-TimeSpan -Minutes 1) `
                -ExecutionTimeLimit ([TimeSpan]::Zero)

  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'The Lord Erroll ordering platform' | Out-Null
  Start-ScheduledTask -TaskName $taskName

  Info "registered scheduled task $taskName, running as SYSTEM"
  Info "status:  Get-ScheduledTask -TaskName $taskName"
  Info "stop:    Stop-ScheduledTask -TaskName $taskName"
  Info 'logs:    the server writes to the console; redirect it or use Event Viewer'

  if ($OpenFirewall) {
    $ruleName = "Lord Erroll ordering platform ($effectivePort/tcp)"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
      Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $effectivePort -Profile Private | Out-Null
    Info "firewall: opened $effectivePort/tcp on private networks"
  } else {
    Warn "Windows Firewall will block staff tablets until $effectivePort/tcp is open."
    Warn 'Re-run with -OpenFirewall from an elevated PowerShell.'
  }
} else {
  Say '6. Boot service not registered'
  Info 'Re-run with -Service once the address and backup drive are settled.'
}

# ------------------------------------------------------------------ 7. done
Say 'Done'
if ($Service) {
  Start-Sleep -Seconds 2
  try {
    Invoke-RestMethod -Uri "http://localhost:$effectivePort/api/health" -TimeoutSec 5 | Out-Null
    Info "The server is answering on http://localhost:$effectivePort"
  } catch {
    Warn 'The server is not answering yet. Check the task history in Task Scheduler.'
  }
} else {
  Info 'Start it with:  npm start'
}
Info 'Then scan one printed table card from a phone on the restaurant network.'
Info 'Go-live checklist: docs/go-live.md'
Write-Host ''
