# Go-live checklist

Work down it. **Admin → Menu → Needs review** answers most of it and will say
plainly whether the menu is ready for paying guests.

## The week before

- [ ] `SESSION_SECRET` changed in `.env`. The startup banner stops warning.
- [ ] `PUBLIC_BASE_URL` settled and resolving on the restaurant network. Changing it
      later means reprinting every card.
- [ ] Server on a UPS, along with the router. Tested by pulling the mains.
- [ ] Server set to start on boot, and it does after a real restart.
- [ ] `BACKUP_DIR` points somewhere other than the server's own disk, and
      `npm run backup` writes a file there.
- [ ] Sections and tables match the room, including any table numbers that changed.

## The menu

- [ ] Every price entered. No item is in "no price at all".
- [ ] Every bottle and tot priced. No serving is in "servings with no price".
- [ ] "Prices never confirmed" is empty. If demo prices were loaded, run
      `npm run demo:prices:clear` first, then enter real ones.
- [ ] Spirits, beers and house-pour wines imported.
- [ ] Three Course Set Menu priced.
- [ ] Set menu course choices entered for the Sorbet and Starters/Mains/Desserts menus.
- [ ] Ribeye sauce choices confirmed or replaced.
- [ ] **A chef has signed off every allergen list.** "Allergens not signed off" is empty.
- [ ] Descriptions entered, or a deliberate decision made to run without them.
- [ ] Service charge and VAT confirmed with the accountant in **Admin → Settings**,
      including whether menu prices already include VAT.

## Cards and devices

- [ ] Table cards printed at 100% scale on card stock and cut.
- [ ] Every card scanned once and opening the right table. Section and number are
      printed on the card; check them against the room.
- [ ] A tablet signed in per section, plus the kitchen and bar passes.
- [ ] Each tablet set to keep its screen awake and not to sleep on mains power.
- [ ] Wi-Fi tested from the far corner of every section, including Clairmont Side
      and the bar.

## Staff

- [ ] An account per person, with the right role.
- [ ] Every waiter assigned their sections. A waiter sees only their own tables.
- [ ] PINs handed out, and the seed's default accounts deactivated or renamed.
- [ ] Both passes shown the 86 list, and how taking an item off removes it from
      every guest menu at once.
- [ ] Waiters shown **Take an order** — some guests would rather be served than tap
      at a phone, and that path has to be as quick as the pad it replaces.
- [ ] Waiters shown **Fire mains**, and told that mains are held while an earlier
      course is still open.

## A dry run before the doors open

Do this as a real table, not on paper.

- [ ] Scan a card, order a drink and a starter, and send it.
- [ ] The order reaches the right waiter in seconds, tagged with the right table.
- [ ] The drink is on the bar board and not on the kitchen board.
- [ ] Acknowledge it. The guest's screen moves off "sent".
- [ ] Add a main to the same table. It is held.
- [ ] Fire the mains. It appears on the kitchen board.
- [ ] Bump it through start and ready, then serve it from the waiter's screen.
- [ ] Put an item on the bill, ask for the bill from the guest screen, split it, and
      settle it in two payments.
- [ ] Order with an allergy note. Confirm it is impossible to miss on the kitchen ticket.
- [ ] **Pull the internet.** Do the whole thing again. Nothing should change.
- [ ] Take a tablet out of Wi-Fi range mid-order, then walk back. The order sends
      itself, once, and is not duplicated.

## The first week

- [ ] Check **Admin → Reports → Service pace** daily. Guest orders should be
      acknowledged inside a minute.
- [ ] Watch the voids and comps report for lines being rung wrong.
- [ ] Ask the waiters, plainly, whether it beats the pad. If it does not, that is
      the thing to fix first.
