# Deploying the platform

Scripted install for the one machine that runs The Lord Erroll inside the
building. Full hardware, network and go-live guidance stays in
[../docs/deployment.md](../docs/deployment.md).

> **This is the on-premise install.** Service carries on when the internet
> drops, because the server lives on the restaurant's own network. Hosting it
> off-site puts the connection back in the ordering path, which is a real cost
> and should be a deliberate choice — see
> [../docs/cloud-hosting.md](../docs/cloud-hosting.md) for that path and what it
> changes.

## What is here

| File | Purpose |
|---|---|
| `install.sh` | Installer for Linux and macOS |
| `install.ps1` | Installer for Windows |
| `lord-erroll.service` | systemd unit template, filled in by `install.sh` |
| `com.lorderroll.platform.plist` | launchd daemon template, filled in by `install.sh` |
| `cloud/` | Dockerfile, Compose stack and Caddy config for a hosted install |

## Linux and macOS

```bash
git clone <repo> /opt/lord-erroll && cd /opt/lord-erroll
./deploy/install.sh --service \
  --base-url http://192.168.1.50:4000 \
  --backup-dir /mnt/backup/lord-erroll \
  --open-firewall
```

Run `./deploy/install.sh --help` for every option. Leave `--service` off for a
first pass if the static address is not settled yet, then re-run with it.

Linux installs a systemd unit; macOS installs a launchd daemon in
`/Library/LaunchDaemons` so it starts at boot with nobody logged in. Both
prompt for sudo at that step only.

## Windows

From an **elevated** PowerShell:

```powershell
cd C:\lord-erroll
.\deploy\install.ps1 -Service -OpenFirewall `
  -BaseUrl http://192.168.1.50:4000 `
  -BackupDir D:\backups\lord-erroll
```

Windows has no native service manager for a plain executable, so `-Service`
registers a Scheduled Task running as SYSTEM, triggered at startup and set to
restart on failure. No third-party wrapper such as NSSM is needed.

## What the installers do

1. Check Node.js is 20 or newer, and warn if the native SQLite driver would
   have to compile without a toolchain present.
2. Install dependencies from the lockfile.
3. Create `.env` if missing, generate a real `SESSION_SECRET`, and record the
   port, QR base URL and backup directory.
4. Build the guest and staff app.
5. Seed the database.
6. Optionally register the boot service and open the firewall port.

They are safe to re-run. The seed only adds what is missing, so an existing
menu and existing staff accounts are never overwritten.

## Two things the scripts cannot decide for you

**The QR base URL is printed into every table card.** If it is unset, the
installer fills in the address the machine currently happens to have and warns
you. Confirm that address is static, by DHCP reservation or a fixed address,
before printing 54 cards. Changing it later means reprinting all of them.

**The backup directory must not be the server's own disk.** The default in
`.env.example` is a folder inside the project, which is fine for development
and useless as a backup. Pass `--backup-dir` or `-BackupDir` pointing at an
external drive, a second disk, or a NAS mount. The installer warns if you
don't. Snapshots run in-process at 04:00, so no cron or Task Scheduler entry is
needed for them.

## Credentials

The seed prints every PIN and password once, and stores them hashed. Write them
down. A manager can reset any of them later in **Admin → Staff**.

If they are lost before anyone has signed in, `npm run seed:reset` regenerates
them, but it **wipes the menu and the floor with them**. Do that before entering
prices, never after. You can also preset the manager password by exporting
`ADMIN_PASSWORD` before the first seed.

## Checking it worked

```bash
curl http://localhost:4000/api/health     # ok, and how many checks are open
npm test                                  # 22 tests over pricing, firing, billing, access
```

The startup banner prints every address the server answers on and stops warning
about `SESSION_SECRET` once it is set. Then scan one printed card from a phone
on the restaurant network and confirm it opens the right table.

Service control:

| | Linux | macOS | Windows |
|---|---|---|---|
| Status | `systemctl status lord-erroll` | `launchctl print system/com.lorderroll.platform` | `Get-ScheduledTask -TaskName LordErrollPlatform` |
| Logs | `journalctl -u lord-erroll -f` | `tail -f /var/log/lord-erroll.log` | Task Scheduler history |
| Restart | `systemctl restart lord-erroll` | `launchctl kickstart -k system/com.lorderroll.platform` | `Stop-ScheduledTask` then `Start-ScheduledTask` |
