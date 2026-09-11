import { db, getSetting, audit } from '../db.js';

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const serviceSettings = () =>
  getSetting('service', {
    ageAmberMinutes: 10,
    ageRedMinutes: 20,
    hideUnpricedFromGuests: true,
    holdMainsByDefault: true,
  });

export const billingSettings = () =>
  getSetting('billing', { serviceChargePercent: 10, vatPercent: 16, pricesIncludeVat: true, usdRate: 129 });

// ------------------------------------------------------------------ checks
function checkCode(tableCode) {
  const d = new Date();
  const stamp = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = db.prepare("SELECT COUNT(*) c FROM checks WHERE date(opened_at) = date('now')").get().c + 1;
  return `LE-${stamp}-${tableCode}-${String(seq).padStart(3, '0')}`;
}

export function openCheckForTable(table, { guestCount = 1, guestName = null } = {}) {
  const open = db
    .prepare("SELECT * FROM checks WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .get(table.id);
  if (open) return open;

  const billing = billingSettings();
  const info = db
    .prepare(
      `INSERT INTO checks (code, table_id, section_id, guest_count, guest_name, service_charge_percent, vat_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(checkCode(table.code), table.id, table.section_id, guestCount, guestName,
         billing.serviceChargePercent, billing.vatPercent);
  audit('check', info.lastInsertRowid, 'opened', `table:${table.code}`, { guestCount });
  return db.prepare('SELECT * FROM checks WHERE id = ?').get(info.lastInsertRowid);
}

// ------------------------------------------------------------- price lookup
/**
 * Resolves what an item actually costs. The client never sets prices — a guest
 * device sending its own number would be the obvious way to under-ring a bill.
 *
 * A missing price blocks the sale. `price_review` is only a manager's to-do
 * marker ("this was never checked against the printed menu") and does not, on
 * its own, stop an item being ordered.
 */
function resolvePrice(menuItem, variant) {
  if (variant) return { price: variant.price_kes, review: variant.price_kes === null };
  return { price: menuItem.price_kes, review: menuItem.price_kes === null };
}

// ------------------------------------------------------------------ orders
/**
 * Creates one round of ordering against a table's open check.
 * `clientOpId` makes the call idempotent so a tablet that resynced after a
 * Wi-Fi drop cannot ring the same round twice.
 */
export const createOrder = db.transaction(
  ({ table, items, note = null, source = 'guest', staffId = null, clientOpId = null, guestCount }) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw Object.assign(new Error('An order needs at least one item.'), { status: 400 });
    }

    if (clientOpId) {
      const dupe = db.prepare('SELECT id FROM orders WHERE client_op_id = ?').get(clientOpId);
      if (dupe) return { orderId: dupe.id, duplicate: true };
    }

    const check = openCheckForTable(table, { guestCount });
    const settings = serviceSettings();
    const round =
      db.prepare('SELECT COALESCE(MAX(round), 0) r FROM orders WHERE check_id = ?').get(check.id).r + 1;

    const orderInfo = db
      .prepare(
        `INSERT INTO orders (check_id, table_id, section_id, round, source, staff_id, note, client_op_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(check.id, table.id, table.section_id, round, source, staffId, note, clientOpId);
    const orderId = orderInfo.lastInsertRowid;

    // Mains wait for the waiter to fire only when an earlier course is still in
    // play — either already on the check, or arriving in this same round.
    const openStarters = db
      .prepare(
        `SELECT COUNT(*) c FROM order_items
         WHERE check_id = ? AND course = 1 AND status NOT IN ('served','void','unavailable')`
      )
      .get(check.id).c;
    const courseLookup = db.prepare('SELECT course FROM menu_items WHERE id = ?');
    const incomingStarters = items.some((i) => courseLookup.get(i.menuItemId)?.course === 1);
    const earlierCourseOpen = openStarters > 0 || incomingStarters;

    const insItem = db.prepare(
      `INSERT INTO order_items
         (order_id, check_id, menu_item_id, variant_id, name, variant_label, qty, unit_price,
          station, course, note, allergy_note, held, fired_at)
       VALUES (@order_id, @check_id, @menu_item_id, @variant_id, @name, @variant_label, @qty, @unit_price,
               @station, @course, @note, @allergy_note, @held, @fired_at)`
    );
    const insMod = db.prepare(
      `INSERT INTO order_item_modifiers (order_item_id, group_name, option_name, price_delta, cover)
       VALUES (?, ?, ?, ?, ?)`
    );

    const created = [];
    for (const raw of items) {
      const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND active = 1').get(raw.menuItemId);
      if (!menuItem) throw Object.assign(new Error('That dish is no longer on the menu.'), { status: 400 });
      if (!menuItem.available) {
        throw Object.assign(new Error(`${menuItem.name} has just come off the menu.`), { status: 409 });
      }

      let variant = null;
      if (raw.variantId) {
        variant = db.prepare('SELECT * FROM menu_item_variants WHERE id = ? AND item_id = ?').get(raw.variantId, menuItem.id);
        if (!variant) throw Object.assign(new Error('That serving size is unavailable.'), { status: 400 });
        if (!variant.available) {
          throw Object.assign(new Error(`${menuItem.name} (${variant.label}) is unavailable.`), { status: 409 });
        }
      }

      const { price, review } = resolvePrice(menuItem, variant);
      let unitPrice = price;
      if (review || unitPrice === null) {
        // Unpriced items never reach a guest menu. A waiter may still ring one in,
        // but only with an explicit price, and the override is written to the audit log.
        if (source !== 'waiter' || typeof raw.unitPrice !== 'number') {
          throw Object.assign(
            new Error(`${menuItem.name} has no confirmed price yet. Please ask your waiter.`),
            { status: 409 }
          );
        }
        unitPrice = raw.unitPrice;
        audit('menu_item', menuItem.id, 'manual_price', `staff:${staffId}`, { unitPrice });
      }

      const qty = Math.max(1, Math.min(99, Number(raw.qty) || 1));
      const course = menuItem.course;
      const held =
        settings.holdMainsByDefault && course >= 2 && menuItem.station === 'kitchen' && earlierCourseOpen ? 1 : 0;

      const info = insItem.run({
        order_id: orderId,
        check_id: check.id,
        menu_item_id: menuItem.id,
        variant_id: variant?.id ?? null,
        name: menuItem.name,
        variant_label: variant?.label ?? null,
        qty,
        unit_price: unitPrice,
        station: menuItem.station,
        course,
        note: raw.note?.trim() || null,
        allergy_note: raw.allergyNote?.trim() || null,
        held,
        fired_at: held ? null : nowIso(),
      });
      const orderItemId = info.lastInsertRowid;

      for (const mod of raw.modifiers ?? []) {
        const option = db
          .prepare(
            `SELECT o.*, g.name AS group_name, g.item_id
             FROM modifier_options o JOIN modifier_groups g ON g.id = o.group_id
             WHERE o.id = ?`
          )
          .get(mod.optionId);
        if (!option || option.item_id !== menuItem.id) continue;
        insMod.run(orderItemId, option.group_name, option.name, option.price_delta, mod.cover ?? null);
      }
      created.push(orderItemId);
    }

    audit('order', orderId, 'created', source === 'guest' ? `guest:${table.code}` : `staff:${staffId}`, {
      table: table.code,
      items: created.length,
    });

    return { orderId, checkId: check.id, duplicate: false };
  }
);

// ------------------------------------------------------------ serialisation
const ITEM_SQL = `
  SELECT oi.*, o.round, o.source, o.created_at AS order_created_at
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.order_id = ? ORDER BY oi.course, oi.id`;

function itemModifiers(itemId) {
  return db
    .prepare('SELECT group_name AS groupName, option_name AS optionName, price_delta AS priceDelta, cover FROM order_item_modifiers WHERE order_item_id = ? ORDER BY id')
    .all(itemId);
}

export function serializeItem(row) {
  const modifiers = itemModifiers(row.id);
  const modTotal = modifiers.reduce((s, m) => s + (m.priceDelta || 0), 0);
  return {
    id: row.id,
    orderId: row.order_id,
    checkId: row.check_id,
    menuItemId: row.menu_item_id,
    name: row.name,
    variantLabel: row.variant_label,
    qty: row.qty,
    unitPrice: row.unit_price,
    lineTotal: row.status === 'void' || row.comped ? 0 : (row.unit_price + modTotal) * row.qty,
    station: row.station,
    course: row.course,
    note: row.note,
    allergyNote: row.allergy_note,
    held: !!row.held,
    status: row.status,
    comped: !!row.comped,
    voidReason: row.void_reason,
    splitGroup: row.split_group,
    firedAt: row.fired_at,
    readyAt: row.ready_at,
    servedAt: row.served_at,
    createdAt: row.created_at,
    modifiers,
  };
}

export function serializeOrder(orderId) {
  const order = db
    .prepare(
      `SELECT o.*, t.code AS table_code, t.label AS table_label, s.code AS section_code, s.name AS section_name,
              st.name AS staff_name
       FROM orders o
       JOIN dining_tables t ON t.id = o.table_id
       JOIN sections s ON s.id = o.section_id
       LEFT JOIN staff st ON st.id = o.staff_id
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) return null;
  const items = db.prepare(ITEM_SQL).all(orderId).map(serializeItem);
  return {
    id: order.id,
    checkId: order.check_id,
    tableId: order.table_id,
    tableCode: order.table_code,
    tableLabel: order.table_label,
    sectionCode: order.section_code,
    sectionName: order.section_name,
    round: order.round,
    source: order.source,
    staffName: order.staff_name,
    status: order.status,
    note: order.note,
    createdAt: order.created_at,
    acknowledgedAt: order.acknowledged_at,
    servedAt: order.served_at,
    hasAllergyNote: items.some((i) => i.allergyNote),
    items,
  };
}

/** Order status is the least-advanced state of its live items. */
export function recomputeOrderStatus(orderId) {
  const rows = db
    .prepare("SELECT status, held FROM order_items WHERE order_id = ? AND status NOT IN ('void','unavailable')")
    .all(orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return;

  // The order sits at the least-advanced state its live items are in, but any
  // item that has reached the pass counts as work in progress. Without that,
  // a round whose food is ready and whose drinks are still queued would drop
  // back to "acknowledged" and read to the guest as a step backwards.
  let status;
  if (rows.length === 0) status = 'void';
  else if (rows.every((r) => r.status === 'served')) status = 'served';
  else if (rows.every((r) => r.status === 'ready' || r.status === 'served')) status = 'ready';
  else if (rows.some((r) => r.status === 'preparing' || r.status === 'ready')) status = 'preparing';
  else status = order.acknowledged_at ? 'acknowledged' : 'sent';

  const servedAt = status === 'served' ? order.served_at ?? nowIso() : null;
  db.prepare('UPDATE orders SET status = ?, served_at = ? WHERE id = ?').run(status, servedAt, orderId);
  return status;
}

// ------------------------------------------------------------------- bills
export function computeCheckTotals(checkId) {
  const check = db.prepare('SELECT * FROM checks WHERE id = ?').get(checkId);
  if (!check) return null;

  const items = db
    .prepare(
      `SELECT oi.* FROM order_items oi
       WHERE oi.check_id = ? AND oi.status NOT IN ('void','unavailable')
       ORDER BY oi.course, oi.id`
    )
    .all(checkId);

  let subtotal = 0;
  const lines = items.map((row) => {
    const s = serializeItem(row);
    subtotal += s.lineTotal;
    return s;
  });

  const billing = billingSettings();
  const servicePct = check.service_charge_percent ?? billing.serviceChargePercent;
  const vatPct = check.vat_percent ?? billing.vatPercent;
  const discount = +(subtotal * (check.discount_percent / 100)).toFixed(2);
  const net = subtotal - discount;
  const serviceCharge = +(net * (servicePct / 100)).toFixed(2);

  let vat;
  let total;
  if (billing.pricesIncludeVat) {
    total = +(net + serviceCharge).toFixed(2);
    vat = +((total * vatPct) / (100 + vatPct)).toFixed(2); // shown as already included
  } else {
    vat = +((net + serviceCharge) * (vatPct / 100)).toFixed(2);
    total = +(net + serviceCharge + vat).toFixed(2);
  }

  const paid = db
    .prepare("SELECT COALESCE(SUM(amount), 0) p FROM payments WHERE check_id = ?")
    .get(checkId).p;

  return {
    checkId,
    lines,
    subtotal: +subtotal.toFixed(2),
    discount,
    discountPercent: check.discount_percent,
    serviceChargePercent: servicePct,
    serviceCharge,
    vatPercent: vatPct,
    vat,
    vatIncluded: billing.pricesIncludeVat,
    total,
    paid: +paid.toFixed(2),
    balance: +(total - paid).toFixed(2),
    usdRate: billing.usdRate,
  };
}

export function serializeCheck(checkId) {
  const check = db
    .prepare(
      `SELECT c.*, t.code AS table_code, t.label AS table_label, s.code AS section_code, s.name AS section_name
       FROM checks c JOIN dining_tables t ON t.id = c.table_id JOIN sections s ON s.id = c.section_id
       WHERE c.id = ?`
    )
    .get(checkId);
  if (!check) return null;

  const orders = db
    .prepare('SELECT id FROM orders WHERE check_id = ? ORDER BY id')
    .all(checkId)
    .map((r) => serializeOrder(r.id));

  return {
    id: check.id,
    code: check.code,
    tableCode: check.table_code,
    tableLabel: check.table_label,
    sectionCode: check.section_code,
    sectionName: check.section_name,
    status: check.status,
    guestCount: check.guest_count,
    guestName: check.guest_name,
    openedAt: check.opened_at,
    billedAt: check.billed_at,
    closedAt: check.closed_at,
    splitMode: check.split_mode,
    splitWays: check.split_ways,
    discountPercent: check.discount_percent,
    orders,
    totals: computeCheckTotals(checkId),
    payments: db
      .prepare('SELECT id, method, amount, reference, split_group AS splitGroup, created_at AS createdAt FROM payments WHERE check_id = ? ORDER BY id')
      .all(checkId),
  };
}

export { nowIso };
