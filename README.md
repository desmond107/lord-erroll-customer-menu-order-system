# The Lord Erroll — digital ordering & service platform

An on-premise ordering and service system for The Lord Erroll Gourmet Restaurant,
89 Ruaka Road, Nairobi.

A guest scans the card on their table, browses the menu, and sends an order that
arrives on their waiter's device already tagged with the right table and section.
Drinks route to the bar, food to the kitchen, and mains wait until the waiter
fires them.

**Everything runs inside the building.** One small machine on the restaurant's own
network serves the guest app, the waiter dashboard, both pass displays and the back
office. If the internet goes down, service carries on exactly as normal.

---

## What is here

| Surface | Address | Who signs in |
|---|---|---|
| Guest ordering | `/t/<table code>` — the QR card | Nobody. The card is the credential |
| Waiter dashboard | `/waiter` | Name and 4-digit PIN |
| Kitchen display | `/kitchen` | Name and 4-digit PIN |
| Bar display | `/bar` | Name and 4-digit PIN |
| Back office | `/admin` | Email and password |

Plus a printable QR table-card generator at `/api/qr/cards`, in the restaurant's
own livery, two cards to an A4 page.

---

## Running it

```bash
npm install
cp .env.example .env        # then edit it — see below
npm run seed                # floor, menu and staff accounts; prints PINs once
npm run build               # builds the guest and staff app
npm start                   # serves everything on http://<this machine>:4000
```

The seed prints every PIN and password once. Write them down; they are stored
hashed and are not shown again. A manager can reset any of them later.

For development, `npm run dev` runs the API and a hot-reloading front end together.

### Before anything else, edit `.env`

- `SESSION_SECRET` — change it. The server prints a warning at startup until you do.
- `PUBLIC_BASE_URL` — the address printed into every QR code. It must resolve on
  the restaurant's network. Use the server's static LAN IP if you have no local DNS,
  for example `http://192.168.1.50:4000`.

Full installation, network and hardware guidance is in
[docs/deployment.md](docs/deployment.md). The client brief this was built from is kept
verbatim in [docs/brief.md](docs/brief.md).

---

## The menu, and what is still missing

The menu ships pre-loaded with the structure and content of the restaurant's own
menus: 32 categories and 104 items across the à la carte, the set and buffet menus,
the wine list and the cocktail list.

**No price has been guessed.** Where the supplied menus were faint, cut off, or not
supplied in machine-readable form, the item ships with no price. An item with no
price is hidden from the guest menu entirely, so nobody can order something the
system cannot bill. Every gap is listed in **Admin → Menu → Needs review**, which
also tells a manager whether the menu is ready for paying guests.

[docs/data-gaps.md](docs/data-gaps.md) lists exactly what the client still needs to
supply, and [docs/go-live.md](docs/go-live.md) is the checklist for the day.

To walk through the whole system before those prices arrive:

```bash
npm run demo:prices          # placeholder prices, every one flagged unconfirmed
npm run demo:prices:clear    # take them out again
```

Demo prices stay flagged in the review list, so they can never be mistaken for
real ones.

---

## How it is built

```
lord-erroll-customer-menu-order-system/
server/          Node.js + Express + Socket.IO, one process
  src/schema.sql SQLite schema: sections → tables → checks → orders → order_items
  src/lib/       orders and billing, auth, realtime, backup
  src/routes/    guest, floor (waiter), station (kitchen/bar), bills, admin, reports, qr
  test/          22 tests over pricing, course firing, billing and access control
web/             React + TypeScript, built by Vite, served by the same process
  src/routes/    guest, waiter, display, admin
  src/styles/    the design system
scripts/         demo price loader
docs/            the original brief, deployment, data gaps, go-live checklist
data/            the database and its local backups (never committed)
```

**SQLite** rather than a server database: it is one file, it survives power cuts in
WAL mode, and it backs up by copying. **Socket.IO** over the LAN carries orders to
the passes in well under a second, with polling as a fallback for tablets that roam
between access points.

### Choices worth knowing about

- **The client never sets a price.** Prices are resolved from the menu on the
  server. A guest device sending its own number is the obvious way to under-ring a bill.
- **Every order carries a `clientOpId`.** A tablet that loses Wi-Fi mid-tap queues
  the action in the browser and replays it on reconnect; the server recognises the
  replay and does not ring it twice.
- **Menu items are retired, never deleted.** Closed checks still refer to them, and
  each order line snapshots its own name and price.
- **Discounts, comps, voids and manual prices are written to an audit log**, with
  who did it and when.

---

## Day to day

```bash
npm run backup          # snapshot the database now
npm test                # run the test suite
npm run seed            # safe to re-run; it never overwrites manager edits
```

A snapshot runs automatically at 04:00 into `BACKUP_DIR`, keeping 30 days.
Point that at an external drive or a NAS mount — see the deployment guide.

---

## What still needs the client

1. The real prices, and the spirits and house-pour wine lists (see the data gaps doc).
2. The official crest artwork, to replace `web/public/crest.svg`. Nothing else changes.
3. Confirmation of the exact spelling of **Clairmont Side**, and of the sauce choices
   for the dry aged ribeye.
4. The chef's sign-off on every allergen list, item by item, in the back office.
# lord-erroll-customer-menu-order-system
