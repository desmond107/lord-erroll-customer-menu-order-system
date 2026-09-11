import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffHeader } from '../../components/StaffHeader';
import { useToast } from '../../components/Toast';
import { get, post } from '../../lib/api';

interface Item {
  id: number;
  name: string;
  category: string;
  description: string | null;
  allergens: string[];
  dietary: string[];
  signedOff: boolean;
  signedBy: string | null;
  signedAt: string | null;
}

interface Category {
  id: number;
  name: string;
  items: Item[];
}

/**
 * The fourteen allergens a Kenyan kitchen is normally asked about. Typing is
 * still allowed, because this list is a convenience and not a limit.
 */
const COMMON = [
  'gluten', 'dairy', 'egg', 'fish', 'shellfish', 'nuts', 'peanuts',
  'soy', 'sesame', 'mustard', 'celery', 'lupin', 'sulphites', 'molluscs',
];

/**
 * The chef's screen. Every item on the menu carries a proposed allergen list,
 * transcribed from the printed menu. Nothing here is certified until a chef
 * looks at it and signs, and their name and the time are recorded against it.
 */
export function AllergenSignOff() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [total, setTotal] = useState(0);
  const [onlyPending, setOnlyPending] = useState(true);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Record<number, string[]>>({});
  const [busy, setBusy] = useState<number | 'bulk' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await get<{ categories: Category[]; outstanding: number; total: number }>('/api/allergens');
      setCategories(data.categories);
      setOutstanding(data.outstanding);
      setTotal(data.total);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the menu.', 'warn');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const listFor = (item: Item) => draft[item.id] ?? item.allergens;

  const toggle = (item: Item, allergen: string) => {
    const current = listFor(item);
    const next = current.includes(allergen)
      ? current.filter((a) => a !== allergen)
      : [...current, allergen];
    setDraft((d) => ({ ...d, [item.id]: next }));
  };

  const signOff = async (item: Item) => {
    setBusy(item.id);
    try {
      await post(`/api/allergens/items/${item.id}`, { allergens: listFor(item) });
      setDraft((d) => {
        const next = { ...d };
        delete next[item.id];
        return next;
      });
      await load();
      toast(`${item.name} signed off.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not sign that off.', 'warn');
    } finally {
      setBusy(null);
    }
  };

  const reopen = async (item: Item) => {
    try {
      await post(`/api/allergens/items/${item.id}/reopen`, {});
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reopen that.', 'warn');
    }
  };

  const signOffCategory = async (category: Category) => {
    const pending = category.items.filter((i) => !i.signedOff);
    if (!pending.length) return;
    const ok = window.confirm(
      `Sign off all ${pending.length} outstanding item(s) in ${category.name} with the allergen lists exactly as they stand?`
    );
    if (!ok) return;
    setBusy('bulk');
    try {
      await post('/api/allergens/bulk', { itemIds: pending.map((i) => i.id) });
      await load();
      toast(`${category.name} signed off.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not sign those off.', 'warn');
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) => (!onlyPending || !i.signedOff) && (!q || i.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, onlyPending, filter]);

  const done = total - outstanding;

  return (
    <div className="staff admin">
      <StaffHeader
        title="Allergen sign-off"
        subtitle={
          outstanding === 0
            ? `All ${total} items signed off`
            : `${done} of ${total} signed off · ${outstanding} still to check`
        }
      />

      <main className="staff__body admin__body">
        <div className="admin-page">
          <div className="admin-filter">
            <input
              className="input"
              placeholder="Find a dish or a category"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
              />
              Only items still to check
            </label>
          </div>

          <p className="section-note">
            These lists were transcribed from the printed menu as a starting point. They are not
            certified until you sign them off, and your name is recorded against each one.
          </p>

          {shown.length === 0 && (
            <p className="empty">{onlyPending ? 'Nothing left to check.' : 'No items match that search.'}</p>
          )}

          {shown.map((category) => {
            const pending = category.items.filter((i) => !i.signedOff);
            return (
              <section key={category.id} className="panel admin-cat">
                <div className="row row--between">
                  <h2 className="section-title">{category.name}</h2>
                  {pending.length > 0 && (
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={busy === 'bulk'}
                      onClick={() => void signOffCategory(category)}
                    >
                      Sign off all {pending.length}
                    </button>
                  )}
                </div>

                {category.items.map((item) => {
                  const list = listFor(item);
                  const edited = draft[item.id] !== undefined;
                  const extra = list.filter((a) => !COMMON.includes(a));
                  return (
                    <article key={item.id} className={`admin-item allergen-item${item.signedOff ? ' allergen-item--signed' : ''}`}>
                      <div className="row row--between row--wrap">
                        <strong>{item.name}</strong>
                        {item.signedOff && (
                          <span className="tag tag--green">
                            signed off by {item.signedBy}
                            {item.signedAt ? ` · ${new Date(item.signedAt).toLocaleDateString()}` : ''}
                          </span>
                        )}
                      </div>
                      {item.description && <p className="italic muted">{item.description}</p>}

                      <div className="chip-set">
                        {COMMON.map((a) => (
                          <button
                            key={a}
                            type="button"
                            className={`chip${list.includes(a) ? ' is-on' : ''}`}
                            onClick={() => toggle(item, a)}
                          >
                            {a}
                          </button>
                        ))}
                      </div>

                      {extra.length > 0 && <p className="muted">Also listed: {extra.join(', ')}</p>}

                      <div className="row row--wrap">
                        {item.signedOff ? (
                          <button className="btn btn--ghost btn--sm" onClick={() => void reopen(item)}>
                            Reopen for rechecking
                          </button>
                        ) : (
                          <button
                            className="btn btn--primary btn--sm"
                            disabled={busy === item.id}
                            onClick={() => void signOff(item)}
                          >
                            {list.length === 0 ? 'Sign off — no allergens' : `Sign off ${list.length} allergen(s)`}
                          </button>
                        )}
                        {edited && <span className="muted">unsaved changes</span>}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
