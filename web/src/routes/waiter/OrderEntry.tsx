import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { useToast } from '../../components/Toast';
import { get } from '../../lib/api';
import { money } from '../../lib/format';
import { sendOrQueue } from '../../lib/offline';
import type { MenuCategory, MenuItem } from '../../lib/types';

interface Line {
  uid: string;
  item: MenuItem;
  variantId: number | null;
  variantLabel: string | null;
  qty: number;
  note: string;
  allergyNote: string;
  unitPrice: number;
  manualPrice: boolean;
}

/**
 * A waiter ringing an order in at the table. Some guests here would rather be
 * served than tap at a phone, so this has to be as quick as a pad: search,
 * tap, tap, send.
 */
export function OrderEntry({
  open,
  tableCode,
  onClose,
  onSent,
}: {
  open: boolean;
  tableCode: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<Line | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setQuery('');
    void get<{ categories: MenuCategory[] }>('/api/menu?audience=staff')
      .then((r) => setMenu(r.categories))
      .catch(() => setMenu([]));
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = menu.flatMap((c) => c.items.filter((i) => i.active));
    if (!q) return all.filter((i) => i.available).slice(0, 40);
    return all.filter((i) => i.name.toLowerCase().includes(q) || i.categoryName.toLowerCase().includes(q)).slice(0, 60);
  }, [menu, query]);

  const add = (item: MenuItem) => {
    const variant = item.variants.find((v) => v.available && v.price !== null) ?? null;
    const price = variant?.price ?? item.price;
    setLines((prev) => [
      ...prev,
      {
        uid: `${Date.now()}-${prev.length}`,
        item,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        qty: 1,
        note: '',
        allergyNote: '',
        unitPrice: price ?? 0,
        manualPrice: price === null,
      },
    ]);
  };

  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const needsPrice = lines.filter((l) => l.manualPrice && l.unitPrice <= 0);

  const send = async () => {
    if (!tableCode || !lines.length) return;
    setSending(true);
    try {
      const result = await sendOrQueue('/api/floor/orders', {
        tableCode,
        items: lines.map((l) => ({
          menuItemId: l.item.id,
          variantId: l.variantId,
          qty: l.qty,
          note: l.note || undefined,
          allergyNote: l.allergyNote || undefined,
          unitPrice: l.manualPrice ? l.unitPrice : undefined,
        })),
      }, { label: `Order for ${tableCode}` });

      toast(result ? `Sent to ${tableCode}.` : 'Saved — it will send when the network returns.');
      setLines([]);
      onSent();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not send.', 'warn');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <div>
          <p className="eyebrow">Taking an order</p>
          <h2 className="item-sheet__name">Table {tableCode}</h2>
        </div>
      }
      footer={
        <div className="row row--between">
          <div>
            <p className="eyebrow">{lines.length} line{lines.length === 1 ? '' : 's'}</p>
            <p className="price item-sheet__total">{money(total)}</p>
          </div>
          <button
            className="btn btn--primary"
            disabled={!lines.length || sending || needsPrice.length > 0}
            onClick={() => void send()}
          >
            {sending ? 'Sending…' : 'Send order'}
          </button>
        </div>
      }
    >
      <div className="entry">
        <div className="entry__picker">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the whole menu"
            aria-label="Search the menu"
            autoFocus
          />
          <ul className="entry__results">
            {results.map((item) => (
              <li key={item.id}>
                <button className="entry__result" onClick={() => add(item)} disabled={!item.available}>
                  <span className="grow">
                    <span className="entry__result-name">{item.name}</span>
                    <span className="entry__result-cat">{item.categoryName}</span>
                  </span>
                  <span className="price">
                    {item.variants.length ? 'options' : money(item.price)}
                  </span>
                  {!item.available && <span className="tag tag--off">86</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="empty">Nothing matched.</li>}
          </ul>
        </div>

        <div className="entry__pad">
          {lines.length === 0 && <p className="empty">Tap dishes on the left to build the order.</p>}
          <ul className="entry__lines">
            {lines.map((line) => (
              <li key={line.uid} className="entry__line">
                <div className="grow">
                  <p className="entry__line-name">
                    {line.item.name}
                    {line.variantLabel && <span className="muted"> · {line.variantLabel}</span>}
                  </p>
                  {(line.note || line.allergyNote) && (
                    <p className="entry__line-note">
                      {line.note}
                      {line.allergyNote && <span className="entry__line-allergy"> Allergy: {line.allergyNote}</span>}
                    </p>
                  )}
                  {line.manualPrice && (
                    <p className="entry__line-note italic">
                      No confirmed price — enter one to send.
                    </p>
                  )}
                  <div className="row entry__line-tools">
                    <Stepper
                      value={line.qty}
                      onChange={(n) =>
                        setLines((prev) => prev.map((l) => (l.uid === line.uid ? { ...l, qty: n } : l)))
                      }
                    />
                    <button className="btn btn--ghost btn--sm" onClick={() => setDetail(line)}>Notes</button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setLines((prev) => prev.filter((l) => l.uid !== line.uid))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span className="price">{money(line.unitPrice * line.qty)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={<h2 className="item-sheet__name">{detail?.item.name}</h2>}
      >
        {detail && (
          <>
            {detail.item.variants.length > 0 && (
              <div className="field">
                <span className="field__label">Serving</span>
                <div className="chip-set">
                  {detail.item.variants.map((v) => (
                    <button
                      key={v.id}
                      className={`chip${detail.variantId === v.id ? ' is-on' : ''}`}
                      disabled={!v.available}
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.uid === detail.uid
                              ? { ...l, variantId: v.id, variantLabel: v.label, unitPrice: v.price ?? l.unitPrice, manualPrice: v.price === null }
                              : l
                          )
                        )
                      }
                    >
                      <span>{v.label}</span>
                      <span className="chip__price">{money(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detail.manualPrice && (
              <label className="field">
                <span className="field__label">Price for this line</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  defaultValue={detail.unitPrice || ''}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.uid === detail.uid ? { ...l, unitPrice: Number(e.target.value) || 0 } : l))
                    )
                  }
                />
                <p className="field__hint">Recorded against your name in the audit log.</p>
              </label>
            )}

            <label className="field">
              <span className="field__label">Note for the kitchen</span>
              <textarea
                className="textarea"
                defaultValue={detail.note}
                onChange={(e) =>
                  setLines((prev) => prev.map((l) => (l.uid === detail.uid ? { ...l, note: e.target.value } : l)))
                }
              />
            </label>

            <label className="field field--allergy">
              <span className="field__label field__label--allergy">Allergy</span>
              <textarea
                className="textarea"
                defaultValue={detail.allergyNote}
                onChange={(e) =>
                  setLines((prev) => prev.map((l) => (l.uid === detail.uid ? { ...l, allergyNote: e.target.value } : l)))
                }
              />
            </label>
          </>
        )}
      </Sheet>
    </Sheet>
  );
}
