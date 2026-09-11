import { Router } from 'express';
import { db } from '../db.js';
import { serviceSettings } from '../lib/orders.js';

export const menuRouter = Router();

/**
 * The one menu query everyone reads.
 * `audience=guest` drops anything a guest must not see: inactive items, and
 * unpriced items, which would otherwise land on a bill at zero.
 */
export function buildMenu({ audience = 'guest' } = {}) {
  const forGuest = audience === 'guest';
  const hideUnpriced = serviceSettings().hideUnpricedFromGuests;

  const categories = db
    .prepare(
      `SELECT id, code, name, kind, station, course, note, sort_order
       FROM menu_categories WHERE active = 1 ORDER BY sort_order, id`
    )
    .all();

  const items = db
    .prepare(
      `SELECT * FROM menu_items ${forGuest ? 'WHERE active = 1' : ''} ORDER BY sort_order, id`
    )
    .all();

  const variants = db.prepare('SELECT * FROM menu_item_variants ORDER BY sort_order, id').all();
  const groups = db.prepare('SELECT * FROM modifier_groups ORDER BY sort_order, id').all();
  const options = db.prepare('SELECT * FROM modifier_options ORDER BY sort_order, id').all();

  const variantsByItem = groupBy(variants, 'item_id');
  const groupsByItem = groupBy(groups, 'item_id');
  const optionsByGroup = groupBy(options, 'group_id');

  const shaped = categories.map((cat) => {
    const catItems = items
      .filter((i) => i.category_id === cat.id)
      .map((item) => {
        const itemVariants = (variantsByItem[item.id] ?? []).map((v) => ({
          id: v.id,
          label: v.label,
          price: v.price_kes,
          priceReview: !!v.price_review,
          available: !!v.available,
        }));
        const priced = itemVariants.length
          ? itemVariants.some((v) => v.price !== null)
          : item.price_kes !== null;

        return {
          id: item.id,
          categoryId: item.category_id,
          categoryCode: cat.code,
          categoryName: cat.name,
          name: item.name,
          description: item.description,
          price: item.price_kes,
          priceUsd: item.price_usd,
          station: item.station,
          course: item.course,
          dietary: safeJson(item.dietary),
          allergens: safeJson(item.allergens),
          isSetMenu: !!item.is_set_menu,
          priceReview: !!item.price_review,
          allergenReview: !!item.allergen_review,
          available: !!item.available,
          unavailableReason: item.unavailable_reason,
          active: !!item.active,
          priced,
          variants: itemVariants,
          modifierGroups: (groupsByItem[item.id] ?? []).map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.min_select,
            maxSelect: g.max_select,
            course: g.course,
            options: (optionsByGroup[g.id] ?? [])
              .filter((o) => (forGuest ? o.available : true))
              .map((o) => ({ id: o.id, name: o.name, description: o.description, priceDelta: o.price_delta, available: !!o.available })),
          })),
        };
      })
      .filter((item) => (forGuest && hideUnpriced ? item.priced : true));

    return {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      kind: cat.kind,
      station: cat.station,
      course: cat.course,
      note: cat.note,
      items: catItems,
    };
  });

  return forGuest ? shaped.filter((c) => c.items.length > 0) : shaped;
}

menuRouter.get('/', (req, res) => {
  const audience = req.staff ? req.query.audience ?? 'staff' : 'guest';
  res.json({
    categories: buildMenu({ audience }),
    updatedAt: db.prepare('SELECT MAX(updated_at) m FROM menu_items').get().m,
  });
});

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    (acc[row[key]] ??= []).push(row);
    return acc;
  }, {});
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return []; }
}
