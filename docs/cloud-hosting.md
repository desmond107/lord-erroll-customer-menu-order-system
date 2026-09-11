# Hosting the platform online

This covers running the platform on a rented server, reachable from anywhere over
HTTPS, rather than on a machine inside the restaurant. The on-premise install in
[deployment.md](./deployment.md) still works and is unchanged; this is a second
way to run the same code.

## Read this part first

Hosting the server off-site puts the internet connection into the ordering path.
When the restaurant's link drops, or the host has an outage, the floor cannot take
orders at all — not slowly, not degraded, not at all. On-premise, an internet
outage is invisible to service.

That is the trade being made here, and it is worth making deliberately:

| | On-premise | Hosted |
|---|---|---|
| Internet down at the restaurant | Service continues | Service stops |
| Reachable from outside | No | Yes |
| Guests on cellular data | Cannot reach it | Can |
| Who maintains the machine | You | The host, mostly |

Two mitigations are worth the money if you go ahead:

- **A second route to the internet** at the restaurant. A 4G or 5G router on
  automatic failover costs little and covers the common case, which is one line
  going down rather than the whole area losing service.
- **Keep the on-premise machine built and current.** It is the fallback. Switching
  back is a DNS change and a restart, which is only true if the box still exists.

---

## 1. What to rent

One small virtual server. The platform is a single Node process and a SQLite file,
so it is not demanding:

| | |
|---|---|
| vCPU | 2 |
| Memory | 2 GB |
| Disk | 40 GB SSD, and it must be persistent |
| OS | Debian 12 or Ubuntu 24.04 |

Pick a region by distance from Nairobi, because every guest tap crosses it. In
rough order of round-trip time: Nairobi or Mombasa local providers, then
Johannesburg, then Europe. A European region adds noticeable delay to every
screen; it works, but the floor will feel it.

You also need a **domain name** you control, and the ability to add a DNS record.

## 2. Point the name at the server

Add an `A` record for the hostname you will use, pointing at the server's public
address:

```
order.lorderroll.com.   A   198.51.100.20
```

Wait until it resolves before going further. Caddy requests the TLS certificate
on first start, and that request fails if the name does not yet point at it.

> The hostname goes into every table QR code. Changing it later means reprinting
> every table card, so settle it now.

## 3. Install Docker

```bash
ssh root@198.51.100.20
curl -fsSL https://get.docker.com | sh
```

## 4. Bring the stack up

```bash
git clone <this repository> /opt/lord-erroll
cd /opt/lord-erroll/deploy/cloud
cp env.example .env
```

Edit `.env`. Every field is described in the file itself. The two that must not
be skipped:

```ini
SITE_ADDRESS=order.lorderroll.com
PUBLIC_BASE_URL=https://order.lorderroll.com
SESSION_SECRET=<paste the output of: openssl rand -base64 48>
```

Then:

```bash
docker compose up -d --build
docker compose logs -f app
```

The server refuses to start if it is set to `EXPOSURE=public` with a weak session
secret or a non-HTTPS base URL, and says which. That refusal is the point: those
two mistakes are what turn a hosted install into an open door.

## 5. Seed the menu and the staff

Once, on a new database:

```bash
docker compose run --rm app npm run seed
```

It prints every staff PIN and password as it creates them. Write them down then,
because they are hashed and cannot be read back.

## 6. Check it

```bash
curl https://order.lorderroll.com/api/health
```

A hosted server answers a public health check with liveness only. The floor
detail is there for signed-in staff and for the LAN, not for anyone who finds the
hostname.

Then open the site, sign in on the PIN pad, and confirm a live order moves between
two devices. If the board does not update, the WebSocket is not getting through;
check that `PUBLIC_BASE_URL` matches `SITE_ADDRESS` exactly, including `https://`.

---

## What the hosted mode changes

Setting `EXPOSURE=public` is not a label. It changes how the server behaves:

- **Session cookies become secure-only.** They stop travelling in clear text, and
  stop working entirely over plain HTTP, which is why this is not the LAN default.
- **Socket origins are pinned** to `PUBLIC_BASE_URL` and anything in
  `ALLOWED_ORIGINS`. On the LAN any origin may open a socket; from the internet
  that would let a page on any website open an authenticated one.
- **HTTP is refused.** Reads redirect to HTTPS, writes are rejected outright
  rather than quietly redirected.
- **HSTS is sent**, so a browser that has been once will not try plain HTTP again.
- **The health endpoint says less** to anyone who is not signed in.
- **A weak session secret stops the server** instead of printing a warning.

Independently of exposure, failed sign-ins are now budgeted per address and per
account, with a lockout after eight failures in ten minutes. Staff PINs are four
digits and the roster endpoint lists staff ids by design, so that budget is the
whole of what stands between the pad and a script. Tune it in `.env` if the floor
finds it tight, but do not remove it on a hosted install.

## Still open

- **The staff roster is public.** `/api/auth/staff` lists names, roles and ids
  without a session, because the PIN pad needs it before anyone has signed in.
  Hosted, that publishes your staff list. Closing it properly means moving staff
  sign-in to email and password, or putting the staff screens behind a second
  gate such as a VPN or an identity proxy.
- **Four-digit PINs are weak for the internet.** They are the right choice for a
  tablet at a station. If the hosted install is permanent, consider PINs for the
  floor on the LAN and passwords for anything reachable from outside.

## Backups

The nightly snapshot still runs, into the `backups` volume. On a rented machine
that volume dies with the machine, so copy it somewhere else:

```bash
docker run --rm -v lord-erroll_backups:/backups -v /opt/offsite:/out \
  alpine tar czf /out/lord-erroll-$(date +%F).tar.gz -C /backups .
```

Put that in a nightly cron, with the destination on a different provider. A backup
on the same machine as the database is not a backup.

## Updating

```bash
cd /opt/lord-erroll && git pull
docker compose -f deploy/cloud/docker-compose.yml up -d --build
```

The database is on a volume and survives the rebuild. Take a backup first anyway.

## Going back to on-premise

The code is the same. Point DNS back at nothing, set `EXPOSURE=lan` and a LAN
`PUBLIC_BASE_URL` on the in-house machine, copy the newest database snapshot into
place, and start it. The only thing that does not follow is the QR codes, which
carry whichever hostname was printed on them.
