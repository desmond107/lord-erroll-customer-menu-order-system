# Original build brief

The client brief this platform was built from, kept verbatim so the requirements
stay with the code. Where a requirement was met differently from the suggestion
here, or deliberately left for the client, it is noted in
[data-gaps.md](data-gaps.md) and [go-live.md](go-live.md).

---

# BUILD PROMPT: The Lord Erroll — Digital Ordering & Service Platform

## 1. PROJECT SUMMARY

Build a **classy, fast, and reliable digital ordering platform** for **The Lord Erroll
Gourmet Restaurant**, Nairobi — a 1920s "Happy Valley" era colonial-themed fine-dining
establishment (est. history tied to Josslyn Hay, Earl of Erroll). The platform must let
**seated guests order directly from their table** and let **waiters instantly receive each
order tagged with the correct table number and section**, so food and drinks move from
kitchen/bar to guest with minimal friction and zero miscommunication.

**Core goal:** replace slow, error-prone paper/verbal ordering with a seamless digital
flow that feels as elegant as the restaurant itself — think "1920s safari-lodge luxury
meets modern efficiency," not a generic food-delivery app.

## 2. RESTAURANT LAYOUT & TABLE STRUCTURE

The venue is divided into four ordering **sections/zones**, each with its own numbered tables:

| Section | Description |
|---|---|
| **Bar Side** | Bar seating and lounge tables — heavy drinks/cocktail traffic |
| **West Wing** | Dining room, west side |
| **East Wing** | Dining room, east side |
| **Clairmont Side** | Additional dining/lounge area (named after "Claremont" mocktail-adjacent branding — confirm exact name/spelling with the client) |

Every table must have a **unique ID** in the format `SECTION-TABLE#` (e.g. `WW-12`, `EW-04`,
`BAR-03`, `CLM-07`). This ID is the anchor that connects every order to a physical location
and a specific waiter/section head.

## 3. USER ROLES & FLOWS

### A. Guest / Client
- Scans a **table-specific QR code** (printed discreetly on a branded table card matching the
  crest/heraldry design) → opens a mobile web app (no download required) pre-loaded with their
  exact table ID and section.
- Browses the digital menu, grouped exactly as the physical menu is (see Section 5).
- Can build an order across multiple courses in one session (starters, soups, mains, sides,
  drinks, desserts) or send items in rounds (e.g., drinks first, food after).
- Can add notes per item (allergies, spice level, cooking temperature, "no onions," etc.) — the
  physical buffet/à la carte menus explicitly instruct staff to flag allergies, so this must be
  a first-class field, not an afterthought.
- Sees live order status: **Sent → Acknowledged by waiter → Preparing (kitchen/bar) → Ready → Served**.
- Can call the waiter with one tap ("Request Waiter") for anything not covered by ordering
  (extra napkins, the bill, a question).
- Can request the bill digitally, see a running total, and (optionally) split the bill.
- No prices or friction hidden — pricing shown exactly as menu (KES, with USD equivalent shown
  for the set/degustation menu where applicable).

### B. Waiter
- Logs into a **waiter app/dashboard** (tablet or phone) assigned to one or more sections
  (Bar, West Wing, East Wing, Clairmont).
- Receives **instant push notifications** for every new order from their assigned tables,
  showing: table number, section, items, quantities, special notes, and time sent.
- Can acknowledge an order (stops the guest-facing "waiting" state), mark items as served, and
  flag issues (item unavailable, guest changed mind) back to the kitchen/bar and guest in real time.
- Sees a live section overview: all active tables, open orders, order age (with a colour-coded
  timer — e.g. green under 10 min, amber 10–20 min, red over 20 min — to protect the fine-dining pace).
- Can manually key in an order on behalf of a guest (for guests who prefer not to use their phone) —
  this is essential for a high-end venue where some clientele expect full table service, not a
  "type it yourself" experience.

### C. Kitchen & Bar (Kitchen Display System / Bar Display System)
- Two separate live queues: **Kitchen** (food) and **Bar** (drinks/cocktails/wine) — since drink
  orders need to fire faster than a 500g dry-aged porterhouse.
- Orders auto-route by category (e.g., Cocktails/Wine/Beer/Spirits → Bar screen;
  Starters/Mains/Desserts → Kitchen screen), but a single guest order can split across both
  screens simultaneously.
- Course-fire logic: starters/soups fire immediately; mains can be set to fire on a timer or on
  waiter trigger ("fire mains") so courses don't collide — standard fine-dining pacing.
- Each screen shows table, section, item, modifiers/notes, and elapsed time; staff mark items
  "in progress" → "ready for pickup."

### D. Manager / Admin (Back Office)
- Full menu management: add/edit/remove items, prices, categories, 86 (mark unavailable) items
  in real time across all devices instantly.
- Section & table management: add/rename tables and sections, generate/print QR codes.
- Staff management: create waiter accounts, assign sections/shifts.
- Live floor view: every table, its status, order value, time seated.
- Reporting: sales by item/category/section/shift, average table turn time, best sellers,
  void/comp tracking, end-of-day reconciliation.
- Bill/payment settlement, discounts, comps, and split-bill approval.

## 4. TONE, BRAND & DESIGN DIRECTION

This is the single most important differentiator from a generic ordering app — **it must look
and feel like the restaurant, not like a food-delivery product.**

- **Visual identity:** Use the Lord Erroll crest (quartered shield — red/green with gold
  fleur-de-lis, crown, and ribbon banner) as the anchor mark. Pair with the restaurant's serif
  blackletter/Old-English wordmark ("The Lord Erroll") for headers, and a clean elegant serif
  (e.g., Playfair Display, Cormorant, or similar) for body/menu text — never a default sans-serif app font.
- **Colour palette:** deep forest green, oxblood/burgundy red, antique gold, cream/parchment
  background — pulled directly from the crest. Avoid bright, "app-like" primary colours entirely.
- **Motifs:** 1920s "Happy Valley" era safari-colonial illustration style seen in the à la carte
  menu (hand-painted vintage cars, gazelles, cranes, acacia trees) can be used sparingly as
  section dividers or empty-state illustrations — elegant, not cartoonish.
- **Interaction feel:** slow, deliberate transitions (no jarring animations), generous white
  space, understated micro-interactions — the digital equivalent of white-glove service. Every
  screen should feel like it belongs on embossed cream cardstock.
- **Typography hierarchy:** category names in small-caps gold, item names in serif bold,
  descriptions in italic serif (mirroring the actual printed menu's style), price right-aligned in bold.
- **No visible "tech":** no loud iconography, no gamified badges/streaks, no discount pop-ups.
  Confidence and restraint = luxury.

## 5. MENU DATA MODEL (from provided source menus)

Structure the menu as categories → subcategories → items →
{name, description, price (KES), currency notes, dietary/allergen tags, image (optional), 86'd flag}.
Use the following exact structure and content pulled from the restaurant's existing PDFs/menus:

### 5.1 Food — À La Carte
- **Fresh Indian Ocean Oysters** (6pc / 12pc, or Rockefeller style)
- **Starters** (Tuna Tartare, Beetroot & Goat Cheese, Beef Carpaccio, Tempura Prawns, Octopus Carpaccio)
- **Soups** (Seafood Bisque, Clear Chicken Broth, Roasted Butternut, Tomato & Bell Pepper)
- **Salads** (Classic Caesar, Fig/Burrata & Arugula, Niçoise, Hummus with pita)
- **Main Course — Meat/Grill** (Dry Aged Porterhouse 500g, Dry Aged Ribeye 300g w/ sauce choice,
  Ostrich Steak, Tea-smoked BBQ Lamb Chops, Chicken Marbella, Five Spice Duck Breast,
  Beef Short Ribs, Ossobuco Milanese)
- **From the Ocean** (Grilled Lobster, Thermidor, King Prawns, Crispy Skin Salmon Fillet,
  Fillet de Poisson, Tuna Steak, Grilled Octopus)
- **Sides** (Champ Mashed Potato, Matchstick Fries, Sweet Mashed Potato, Mediterranean Rice,
  Creamy Spinach, Organic Leaf Salad, Chilly Garlic Broccoli, Onion Rings)
- **Green Fire (Vegetarian/Pasta)** (Gnocchi, Four Cheese Ravioli, Beetroot & Feta Risotto
  [vegan option] / Mushroom & Parmigiano, Spaghetti Aglio Olio, Wild Mushroom Ragout)
- **Desserts** (Lords Cheesecake, Molten Lava Cake, Lemon Meringue Pie, Affogato,
  Sticky Toffee Pudding, Sweet Banana Flambé, Crème Brûlée, Tropical Fruit Selection,
  Home-made Sorbet/Ice Cream)

### 5.2 Food — Set / Degustation & Buffet Menus
(flag as separate "Set Menus" ordering mode, since these are fixed multi-course prix-fixe,
not à la carte item-by-item)
- **Sorbet Starter Set Menu** — USD 50 / KES 6,500 (Starter choice → Soup → Mains choice)
- **Starters/Mains/Desserts Set Menu** — KES 6,500
- **3-Course Set Menu** (Roasted Butter Soup/Pear Salad → Beef Medallions/Fish Fillet/Chicken
  Breast → Black Forest Slice/Tropical Fruit)
- **Regular Buffet** — KES 6,500 pp
- **Gold Buffet** — KES 6,850 pp
- **Buffet Menu (standard)** — KES 6,850 pp

*(Set/buffet menus should support "per guest" quantity selection rather than per-item
add-to-cart, and should let the guest pick their course choices per person.)*

### 5.3 Drinks — Wine List
- Champagne & Sparkling (Veuve Clicquot, Dom Pérignon, Genevieve Blanc de Blancs,
  Genevieve Rosé, Valdo Etichetta Nera)
- White Wine — House Pour + Connoisseurs Selection
- Rosé Wine (Tokara, Laurensford The Dome)
- Red Wine — House Pour + Connoisseur Red (Khorhoek, Asara Passione Pinotage, Amarone,
  Tokara Director's Reserve, Rupert & Rothschild)

### 5.4 Drinks — Spirits & Beer
- Beers, Aperitifs, Tequila, Rum, Vodka, Gin, Bourbon, Single Malt Whisky, Blended
  Scotch/American/Irish Whisky, Liqueurs, Cognac/Brandy — each with **bottle (BTL) price and
  tot (single serve) price** as two distinct orderable SKUs.
- Sodas, Water (still/sparkling), Energy Drink.

### 5.5 Drinks — Cocktails
- **Signatures** (Highlander, Daddy Issues, Farm of Berries, Passion Caiproska, Hawaiian Martini,
  Empress Elderflower, Blood Orange Sour, In the Beginning)
- **Classics** (Long Island, Bullfrog, Whiskey Sour, Old Fashioned, Negroni, Margarita, Martini,
  Cosmopolitan, Moscow Mule, Espresso Martini, Pornstar Martini, Caipirinha)
- **Bubbles** (Mimosa, French 75)
- **Mocktails** (flat KES 800 — Claremont, Passionately Fizzy, Batman, Berry Coals, Virgin Mojito)

**Important data-entry note:** several scanned prices are faint/ambiguous (e.g., Chateau Ste.
Michelle Riesling, Snow Mountain Chenin Blanc rows were partially cut off in the source scan).
Build the menu CMS so managers can quickly correct/complete these once digitized — do not
hardcode guessed prices.

## 6. KEY FUNCTIONAL REQUIREMENTS

1. **Real-time sync** — order placed by guest must appear on the correct waiter's device and the
   correct kitchen/bar screen within 1–2 seconds (use WebSockets or a managed real-time backend,
   e.g. Firebase, Supabase Realtime, or Pusher).
2. **Table/section-aware routing** — every order is automatically tagged and routed based on the
   QR code scanned; no manual table entry needed for guest orders.
3. **Order status pipeline** visible to guest, waiter, and kitchen/bar simultaneously:
   `Sent → Acknowledged → Preparing → Ready → Served → Billed`.
4. **Course-fire / hold-and-fire** control for waiters (don't send mains to kitchen until starters
   are cleared, unless guest requests otherwise).
5. **86/unavailable items** sync instantly across all guest-facing menus the moment kitchen/bar
   marks something out of stock.
6. **Multi-round ordering** — guests (or waiters on their behalf) can add to an existing open
   table order at any time before the bill is closed.
7. **Bill management** — itemized running bill per table, split-by-item or split-evenly, service
   charge/VAT handling per Kenyan regulations, multiple payment methods (cash, card, M-Pesa).
8. **Offline-first by design** — this is not a cloud app with an offline fallback; it is a
   **local system that runs entirely on the restaurant's own premises**, with no dependency on the
   internet for core service. Guest, waiter, kitchen, bar, and admin devices all communicate over
   the restaurant's local Wi-Fi/LAN, talking to an on-premise server. Internet is only used, if
   ever, for non-critical extras (e.g. nightly backup upload, remote reporting for the owner) —
   never for placing, routing, or serving an order. If the internet is down, service continues
   exactly as normal.
9. **Allergy/notes field** mandatory prompt-friendly, flagged clearly and highlighted (red/gold tag)
   on kitchen and waiter screens — matches the physical menus' explicit instruction to "communicate
   any food allergies and intolerances prior to ordering."
10. **Multi-language readiness** (English primary; Swahili as a stretch goal) given the Nairobi
    clientele mix.
11. **Analytics dashboard** for management: revenue by section/table/item, average ticket time,
    peak hours, waiter performance, repeat-guest tracking (if loyalty is added later).
12. **Access control** — PIN/QR-based staff login for waiters; full auth (email/password + role
    permissions) for managers/admin.

## 7. SUGGESTED TECH APPROACH — OFFLINE / LOCAL-NETWORK ARCHITECTURE

The entire platform runs on the restaurant's **own local network**, with no dependency on internet
connectivity for taking, routing, or serving orders. This protects the restaurant from Nairobi's
variable internet/power reliability affecting live service, and keeps guest data on-premise.

- **On-premise server ("the brain"):** a small dedicated machine on-site (e.g. a mini PC, NUC, or a
  Raspberry Pi 4/5 for a lighter footprint) running the backend — Node.js + a local database
  (PostgreSQL or SQLite) with a `sections → tables → orders → order_items → menu_items` schema.
  This server hosts the app for every device on the property.
- **Local Wi-Fi/LAN:** a dedicated restaurant Wi-Fi network (separate from any guest/public Wi-Fi)
  that all ordering devices join. No external internet route is required for this network to
  function — it only needs to reach the on-premise server.
- **Frontend (guest):** mobile-first web app, served locally by the on-premise server, opened via
  the table QR code (QR points to a local IP/hostname, e.g. `order.lorderroll.local/table/WW-12`) —
  no app-store download, no data leaving the building. Next.js works well here running in a local
  Node process rather than deployed to the cloud.
- **Frontend (waiter, kitchen, bar, admin):** same local web app pattern, tablet-optimized,
  connecting to the same on-premise server over LAN.
- **Real-time sync without the cloud:** use a local WebSocket server (built into the Node backend,
  e.g. Socket.IO or native `ws`) running on the same on-premise machine — orders push instantly to
  waiter/kitchen/bar screens over the LAN, with zero external dependency.
- **Device-level resilience:** if a single tablet briefly drops Wi-Fi (not the whole network), it
  should queue actions locally and resync automatically the moment it reconnects to the LAN.
- **Power/hardware resilience:** put the on-premise server and Wi-Fi router on a UPS (battery
  backup) so a brief power blip doesn't take down service — this matters more once the paper pad
  is retired.
- **Backups:** automatic local backups of the database (e.g. daily snapshot to an external drive or
  NAS). An optional, clearly-separated sync job can push encrypted backups or sales reports to the
  cloud when internet is available — strictly for reporting/backup, never in the live order path.
- **Payments:** card terminals and M-Pesa (Daraja API) do require internet to authorize — treat
  payment as the one workflow that may need connectivity, and design the bill/settlement screen to
  work standalone (cash, or "charge to room/account") if connectivity is down at that moment.
- **Admin/back office:** same local web dashboard, role-based access, reachable only on the
  restaurant's own network (or via secure VPN if the owner wants remote access off-site).

## 8. SUCCESS METRICS ("make this successful")

- **Order accuracy:** near-zero miscommunication between guest intent and kitchen/bar execution
  (eliminate handwritten order errors).
- **Speed:** average time from "order sent" to "waiter acknowledged" under 60 seconds; drinks fired
  to bar under 2 minutes.
- **Table turn efficiency:** measurable reduction in average table duration without guests feeling rushed.
- **Staff adoption:** waiters actively prefer the app to paper pads within the first week (design
  for minimal taps, not maximal features).
- **Guest experience:** the platform should *enhance* — never replace — the feeling of being
  personally attended to; every screen guests see should reinforce that this is Lord Erroll, not a
  generic ordering kiosk.
- **Revenue insight:** management can, within 30 days, identify top-performing items/sections and
  adjust staffing/menu accordingly.

## 9. DELIVERABLES REQUESTED

1. Guest-facing ordering web app (PWA), branded per Section 4.
2. Waiter dashboard app (section-scoped, real-time).
3. Kitchen Display System + Bar Display System (two separate live queues).
4. Manager/Admin back office (menu CMS, table/section management, staff accounts, reporting).
5. QR-code generator for each table, exportable as print-ready branded cards.
6. Full menu pre-loaded using the structure in Section 5 (flag any price gaps for manager review
   before go-live).

---

*Prepared for The Lord Erroll Gourmet Restaurant, 89 Ruaka Road, Nairobi —
reservations@lord-erroll.com*
