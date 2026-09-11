# What the client still needs to supply

Nothing in this system carries a guessed price. Where the supplied menus were
faint, cut off, or not machine-readable, the item ships with **no price** — and an
item with no price is hidden from the guest menu, so it cannot be ordered or
mis-billed.

Everything below appears in **Admin → Menu → Needs review**, which is the working
list. This document explains what each gap is and where it came from.

---

## 1. Prices

**The whole à la carte, the wine list and the cocktail list.** The brief supplied
dish and drink names but only a handful of prices. Those few are loaded as given:

| Confirmed from the source menus | Price |
|---|---|
| Sorbet Starter Set Menu | KES 6,500 (USD 50) |
| Starters, Mains & Desserts Set Menu | KES 6,500 |
| Regular Buffet | KES 6,500 per person |
| Gold Buffet | KES 6,850 per person |
| Buffet Menu | KES 6,850 per person |
| All mocktails | KES 800 |

Everything else needs entering. Two rows were explicitly noted as cut off in the
supplied scan and are flagged separately:

- Chateau Ste. Michelle Riesling — bottle and glass
- Snow Mountain Chenin Blanc — bottle and glass

The **Three Course Set Menu** has its courses and choices but no price.

## 2. Lists not supplied in machine-readable form

These categories exist, correctly routed to the bar, but hold no items yet:

Beers · Aperitifs · Tequila · Rum · Vodka · Gin · Bourbon · Single Malt Whisky ·
Blended Scotch, American & Irish Whisky · Liqueurs · Cognac & Brandy ·
White Wine House Pour · Red Wine House Pour

Use **Admin → Menu → Import** rather than typing them in. One row per orderable
line; a bottle and a tot of the same label are two rows sharing an item name, and
arrive as two separate SKUs:

```csv
category,item,variant,price,description,station,course
Gin,Tanqueray,Bottle,14000,,bar,0
Gin,Tanqueray,Tot,650,,bar,0
Beers,Tusker Lager,,450,,bar,0
```

Existing items are updated rather than duplicated, so the file can be re-imported
after corrections.

## 3. Dish descriptions

No descriptions were supplied, so none were invented. Dishes currently show as name
and price, which reads cleanly, but the printed menu's own wording is better. Enter
it per item, or import it in the `description` column.

## 4. Allergens — the one that matters most

Allergen tags were inferred only where the dish name makes them certain: oysters and
prawns as shellfish, cheesecake as dairy, gluten and egg. **Every item is marked
"allergens unchecked" until a chef signs it off** in the back office, because an
allergen list that is merely plausible is worse than none.

This is the item on the go-live checklist not to wave through. The guest app asks
about allergies on every dish regardless, and anything a guest writes is flagged in
oxblood to the waiter and across the top of the kitchen ticket.

## 5. Two details to confirm

- **"Clairmont Side"** — the brief asks for the exact name and spelling to be
  confirmed. It is loaded as *Clairmont Side*, code `CLM`. Renaming it in
  **Admin → Floor & QR** does not change the table codes, so printed cards stay valid.
- **The dry aged ribeye's sauces** — the menu says "with sauce choice" without
  listing them. Five plausible options are loaded as placeholders and flagged in the
  review list under "choices with no options" logic. Confirm or replace them.

## 6. The crest

`web/public/crest.svg` is a placeholder drawn in the restaurant's colours: a
quartered shield, gold fleur-de-lis, crown and ribbon. Replace that one file with
the official artwork and it flows through the app, the sign-in screens and the
printed table cards. Nothing else needs changing.
