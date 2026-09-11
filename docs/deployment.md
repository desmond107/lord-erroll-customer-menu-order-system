# Installing the platform at the restaurant

This describes putting the system into The Lord Erroll so that taking, routing and
serving an order never depends on the internet.

To run it on a rented server reachable from anywhere instead, see
[cloud-hosting.md](./cloud-hosting.md). That trades the guarantee above for
outside access, so read its first section before choosing it.

---

## 1. What to buy

| Item | Why |
|---|---|
| One small always-on machine — an Intel NUC, a Mac mini, or a Raspberry Pi 5 with 4GB and an SSD | Runs the whole platform. A Pi is enough for this size of floor; a NUC leaves more headroom |
| A dedicated Wi-Fi router or access points, separate from guest Wi-Fi | Staff devices and guest phones reach the server without competing with guest browsing |
| A UPS sized for the server and the router, 20 minutes or more | Once the paper pad is retired, a power blip must not stop service |
| Tablets: one per section, one for the kitchen pass, one for the bar | 10-inch or larger for the passes |
| An external drive or NAS share for backups | Off the server, still inside the building |

The server needs no screen after setup.

---

## 2. Network

The ordering network only has to reach the server. It does not need a route to the
internet for service to work.

1. Give the server a **static LAN address**, by DHCP reservation or a fixed address.
2. Put staff tablets and the guest Wi-Fi on a network that can reach that address.
3. Optional but worth doing: add a local DNS record so the QR codes read
   `order.lorderroll.local` instead of an IP. Most routers can do this. Without it,
   set `PUBLIC_BASE_URL` to the IP address and the codes still work.

> The address in `PUBLIC_BASE_URL` is printed into every QR code. Changing it later
> means reprinting every table card, so settle it before you print.

---

## 3. Install

The steps below are what the installer in [`deploy/`](../deploy/README.md) does
for you. To script it instead, on Linux or macOS:

```bash
git clone <this repository> /opt/lord-erroll && cd /opt/lord-erroll
./deploy/install.sh --service \
  --base-url http://192.168.1.50:4000 \
  --backup-dir /mnt/backup/lord-erroll --open-firewall
```

On Windows, from an elevated PowerShell, `.\deploy\install.ps1 -Service`.
That also installs the boot service covered in section 4, so you can skip it.

To do it by hand:

```bash
git clone <this repository> /opt/lord-erroll
cd /opt/lord-erroll
npm install
cp .env.example .env
```

Edit `.env`:

```ini
PORT=4000
HOST=0.0.0.0
SESSION_SECRET=<a long random string — change this>
PUBLIC_BASE_URL=http://order.lorderroll.local:4000   # or http://192.168.1.50:4000
BACKUP_DIR=/Volumes/backup/lord-erroll               # the external drive or NAS mount
SERVICE_CHARGE_PERCENT=10
VAT_PERCENT=16
PRICES_INCLUDE_VAT=true
```

Then:

```bash
npm run seed     # writes down the PINs and passwords it prints
npm run build
npm start
```

Startup prints every address the server can be reached on. Try one from a phone on
the restaurant network before going further.

---

## 4. Keep it running

Run it under the operating system's own service manager so it restarts after a power
cut. `./deploy/install.sh --service` does this, filling in the templates in
[`deploy/`](../deploy/README.md). To write the unit yourself, on Linux,
`/etc/systemd/system/lord-erroll.service`:

```ini
[Unit]
Description=The Lord Erroll ordering platform
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/lord-erroll
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=lorderroll
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now lord-erroll
sudo systemctl status lord-erroll
```

On macOS, use a `launchd` plist with `KeepAlive` set; there is one ready to fill in
at `deploy/com.lorderroll.platform.plist`. On Windows, register a Scheduled Task
that runs at startup as SYSTEM, which `deploy\install.ps1 -Service` does.

---

## 5. Set up the floor

In **Admin → Floor & QR**:

1. Check the sections and tables match the room. The seed creates Bar Side (12),
   West Wing (16), East Wing (16) and Clairmont Side (10); add, rename or retire
   until it matches.
2. Print the table cards. "All tables" opens a print sheet, two cards to an A4 page.
   Print at **100% scale** on card stock and cut on the hairlines.
3. Scan one card with a phone on the restaurant network and confirm it opens that
   table's menu with the right section and number at the top.

If a card is ever photographed and misused, **New code** on that table invalidates
the printed card. Reprint it afterwards.

---

## 6. Staff accounts

In **Admin → Staff**, create an account per person. Waiters, kitchen and bar sign in
with a 4-digit PIN, shown once when the account is created. Managers use an email
and password.

Assign each waiter their sections. A waiter only sees, and can only act on, tables
in their own sections. The kitchen, bar and management see the whole floor.

---

## 7. Backups

A snapshot runs at 04:00 into `BACKUP_DIR` and 30 days are kept. Run one by hand
with `npm run backup`.

`BACKUP_DIR` should be a mount that is **not** the server's own disk. Restoring is a
file copy:

```bash
sudo systemctl stop lord-erroll
cp /Volumes/backup/lord-erroll/lord-erroll-<timestamp>.db data/lord-erroll.db
sudo systemctl start lord-erroll
```

If the owner wants sales figures off-site, sync the backup folder to cloud storage
on a schedule. Keep that strictly separate from service: nothing in the ordering
path should ever wait on an internet connection.

---

## 8. Payments and the internet

Card terminals and M-Pesa need connectivity to authorise. The platform only records
the outcome, so:

- **Cash** and **charge to account** work with the line down, and the check still closes.
- **Card** and **M-Pesa** are recorded against the terminal slip or the M-Pesa code
  after the payment itself has gone through.

M-Pesa via the Daraja API can be wired into the settlement screen later. It is
deliberately not in the ordering path.

---

## 9. Health

- `GET /api/health` returns the server's state and how many checks are open.
- `npm test` runs the test suite.
- Watch the service log for the startup banner and any warnings.
