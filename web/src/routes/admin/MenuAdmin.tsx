import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { del, get, patch, post } from '../../lib/api';
import { money } from '../../lib/format';
import type { MenuCategory, MenuItem } from '../../lib/types';

interface Review {
  missingPrice: { id: number; name: string; category: string }[];
  missingVariantPrice: { id: number; name: string; category: string }[];
  unconfirmedPrice: { id: number; name: string; category: string; price: number }[];
  missingDescription: { id: number; name: string; category: string }[];
  allergensUnverified: { id: number; name: string; category: string }[];
  emptyCategories: { id: number; name: string; note: string | null }[];
  emptyChoiceGroups: { id: number; item: string; name: string }[];
  readyForGoLive: boolean;
}

const CSV_TEMPLATE = `category,item,variant,price,description,station,course
Gin,Tanqueray,Bottle,14000,,bar,0
Gin,Tanqueray,Tot,650,,bar,0
Beers,Tusker Lager,,450,,bar,0`;

/** Menu CMS: prices, availability, the go-live checklist, and bulk import. */
export function MenuAdmin() {
  const toast = useToast();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [tab, setTab] = useState<'items' | 'review' | 'import'>('items');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [filter, setFilter] = useState('');
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [menu, checklist] = await Promise.all([
        get<{ categories: MenuCategory[] }>('/api/admin/menu'),
        get<Review>('/api/admin/menu/review'),
      ]);
      setCategories(menu.categories);
      setReview(checklist);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the menu.', 'warn');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0 || c.name.toLowerCase().includes(q));
  }, [categories, filter]);

  const save = async (item: MenuItem, changes: Record<string, unknown>) => {
    try {
      await patch(`/api/admin/menu/items/${item.id}`, changes);
      toast(`${item.name} updated.`);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not save.', 'warn');
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const result = await post<{ categories: number; items: number; variants: number; errors: string[] }>(
        '/api/admin/menu/import',
        { csv }
      );
      toast(`Imported ${result.items} items and ${result.variants} servings.`);
      if (result.errors.length) toast(`${result.errors.length} rows had problems.`, 'warn');
      setCsv('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The import failed.', 'warn');
    } finally {
      setImporting(false);
    }
  };

  const gaps =
    (review?.missingPrice.length ?? 0) +
    (review?.missingVariantPrice.length ?? 0) +
    (review?.unconfirmedPrice.length ?? 0);

  return (
    <div className="admin-page">
      <nav className="staff-tabs admin-subtabs">
        {(['items', 'review', 'import'] as const).map((t) => (
          <button key={t} className={`staff-tab${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
            {t === 'items' ? 'Dishes & drinks' : t === 'review' ? 'Needs review' : 'Import'}
            {t === 'review' && gaps > 0 && <span className="pip">{gaps}</span>}
          </button>
        ))}
      </nav>

      {tab === 'items' && (
        <>
          <input
            className="input admin-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a dish or a drink"
          />
          {shown.map((category) => (
            <section key={category.id} className="panel admin-cat">
              <header className="panel__head">
                <div>
                  <h3>{category.name}</h3>
                  <p className="muted">
                    {category.kind} · {category.station} · {category.items.length} items
                  </p>
                </div>
                {category.note && <p className="section-note">{category.note}</p>}
              </header>
              <div className="panel__body">
                {category.items.length === 0 && <p className="empty">Nothing here yet.</p>}
                <ul className="admin-items">
                  {category.items.map((item) => (
                    <li key={item.id} className={`admin-item${item.active ? '' : ' is-retired'}`}>
                      <span className="grow">
                        <span className="admin-item__name">{item.name}</span>
                        <span className="admin-item__flags">
                          {!item.priced && <span className="tag tag--allergy">no price</span>}
                          {item.priceReview && item.priced && <span className="tag tag--gold">price unconfirmed</span>}
                          {item.allergenReview && <span className="tag">allergens unchecked</span>}
                          {!item.available && <span className="tag tag--off">86</span>}
                          {item.variants.length > 0 && <span className="tag">{item.variants.length} servings</span>}
                        </span>
                      </span>
                      <span className="price">
                        {item.variants.length ? '—' : money(item.price)}
                      </span>
                      <span className="row" style={{ gap: '0.3rem' }}>
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => void save(item, { available: !item.available })}
                        >
                          {item.available ? '86' : 'Back on'}
                        </button>
                        <button className="btn btn--sm" onClick={() => setEditing(item)}>Edit</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </>
      )}

      {tab === 'review' && review && (
        <div className="stack">
          <div className={`panel golive${review.readyForGoLive ? ' golive--ready' : ''}`}>
            <div className="panel__body">
              <p className="eyebrow">Before go-live</p>
              <h3>
                {review.readyForGoLive
                  ? 'The menu is ready for service.'
                  : 'The menu is not yet ready for paying guests.'}
              </h3>
              <p className="muted">
                Items with no price are hidden from the guest menu, so nobody can order something
                that cannot be billed. Everything below needs a manager's eye.
              </p>
            </div>
          </div>

          <ReviewList
            title="No price at all"
            note="Hidden from the guest menu until priced."
            rows={review.missingPrice.map((r) => `${r.category} · ${r.name}`)}
          />
          <ReviewList
            title="Servings with no price"
            note="Bottle or tot rows that were blank or cut off in the source menu."
            rows={review.missingVariantPrice.map((r) => `${r.category} · ${r.name}`)}
          />
          <ReviewList
            title="Prices never confirmed"
            note="A price exists but was not checked against the printed menu. Demo prices land here."
            rows={review.unconfirmedPrice.map((r) => `${r.category} · ${r.name} — ${money(r.price)}`)}
          />
          <ReviewList
            title="Allergens not signed off by the chef"
            note="Guests are told to declare allergies, so this list matters more than the rest. A chef signs these off in Allergen sign-off; a manager editing an item here cannot."
            rows={review.allergensUnverified.map((r) => `${r.category} · ${r.name}`)}
          />
          {review.allergensUnverified.length > 0 && (
            <p className="section-note">
              <a className="btn btn--ghost btn--sm" href="/allergens">Open allergen sign-off</a>
            </p>
          )}
          <ReviewList
            title="No description"
            note="The dish shows with its name and price only."
            rows={review.missingDescription.map((r) => `${r.category} · ${r.name}`)}
          />
          <ReviewList
            title="Empty categories"
            note="Usually a printed list that has not been typed in or imported yet."
            rows={review.emptyCategories.map((r) => `${r.name}${r.note ? ` — ${r.note}` : ''}`)}
          />
          <ReviewList
            title="Choices with no options"
            note="A set menu course or a sauce choice that still needs its options."
            rows={review.emptyChoiceGroups.map((r) => `${r.item} · ${r.name}`)}
          />
        </div>
      )}

      {tab === 'import' && (
        <div className="panel">
          <div className="panel__body">
            <p className="eyebrow">Bulk import</p>
            <h3>Paste the spirits list, or any spreadsheet export</h3>
            <p className="muted">
              One row per orderable line. A bottle and a tot of the same label are two rows sharing
              an item name, and arrive as two SKUs. Existing items are updated, never duplicated.
            </p>
            <pre className="csv-template">{CSV_TEMPLATE}</pre>
            <textarea
              className="textarea csv-input"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="category,item,variant,price,description,station,course"
            />
            <button className="btn btn--primary" disabled={!csv.trim() || importing} onClick={() => void runImport()}>
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      )}

      <ItemEditor item={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function ReviewList({ title, note, rows }: { title: string; note: string; rows: string[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h3>{title}</h3>
          <p className="muted">{note}</p>
        </div>
        <span className="tag tag--gold">{rows.length}</span>
      </header>
      <div className="panel__body">
        <ul className="review-list">
          {rows.map((row, i) => (
            <li key={i}>{row}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ItemEditor({
  item,
  onClose,
  onSaved,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', price: '', allergens: '', dietary: '' });
  const [variants, setVariants] = useState<{ id: number; label: string; price: number | null }[]>([]);

  useEffect(() => {
    if (!item) return;
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price === null ? '' : String(item.price),
      allergens: item.allergens.join(', '),
      dietary: item.dietary.join(', '),
    });
    setVariants(item.variants.map((v) => ({ id: v.id, label: v.label, price: v.price })));
  }, [item]);

  if (!item) return null;

  const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

  const submit = async () => {
    try {
      await patch(`/api/admin/menu/items/${item.id}`, {
        name: form.name,
        description: form.description || null,
        price: item.variants.length ? undefined : form.price === '' ? null : Number(form.price),
        allergens: list(form.allergens),
        dietary: list(form.dietary),
        // Deliberately not signing off here. Saving a menu sheet is a manager
        // editing an item; certifying its allergens is a chef's separate act,
        // in Allergen sign-off.
      });
      await Promise.all(
        variants.map((v) =>
          patch(`/api/admin/menu/variants/${v.id}`, { label: v.label, price: v.price === null ? null : v.price })
        )
      );
      toast(`${form.name} saved.`);
      await onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not save.', 'warn');
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <div>
          <p className="eyebrow">{item.categoryName}</p>
          <h2 className="item-sheet__name">{item.name}</h2>
        </div>
      }
      footer={
        <div className="row row--between">
          <button
            className="btn btn--danger btn--sm"
            onClick={() =>
              void del(`/api/admin/menu/items/${item.id}`)
                .then(() => { toast('Retired. Past bills keep it.'); return onSaved(); })
                .then(onClose)
                .catch((e: Error) => toast(e.message, 'warn'))
            }
          >
            Retire
          </button>
          <button className="btn btn--primary" onClick={() => void submit()}>Save</button>
        </div>
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="textarea"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="As it reads on the printed menu."
        />
      </label>

      {item.variants.length === 0 ? (
        <label className="field">
          <span className="field__label">Price (KES)</span>
          <input
            className="input"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <p className="field__hint">Leave blank to keep it off the guest menu.</p>
        </label>
      ) : (
        <div className="field">
          <span className="field__label">Servings</span>
          {variants.map((v, i) => (
            <div className="row variant-row" key={v.id}>
              <input
                className="input"
                value={v.label}
                onChange={(e) =>
                  setVariants((prev) => prev.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
                }
              />
              <input
                className="input"
                type="number"
                value={v.price ?? ''}
                placeholder="price"
                onChange={(e) =>
                  setVariants((prev) =>
                    prev.map((x, j) => (i === j ? { ...x, price: e.target.value === '' ? null : Number(e.target.value) } : x))
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      <label className="field">
        <span className="field__label">Allergens</span>
        <input
          className="input"
          value={form.allergens}
          onChange={(e) => setForm({ ...form, allergens: e.target.value })}
          placeholder="shellfish, dairy, gluten"
        />
        <p className="field__hint">Comma separated. Saving marks them as checked by you.</p>
      </label>

      <label className="field">
        <span className="field__label">Dietary</span>
        <input
          className="input"
          value={form.dietary}
          onChange={(e) => setForm({ ...form, dietary: e.target.value })}
          placeholder="vegetarian, vegan"
        />
      </label>
    </Sheet>
  );
}
