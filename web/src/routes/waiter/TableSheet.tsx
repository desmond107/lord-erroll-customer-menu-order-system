import { useCallback, useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { get, post } from '../../lib/api';
import { ageClass, clock, courseName, elapsed, money } from '../../lib/format';
import type { Check, OrderItem } from '../../lib/types';

/** Everything a waiter needs for one table, without leaving the table. */
export function TableSheet({
  tableCode,
  open,
  onClose,
  onChanged,
  onTakeOrder,
  onSettle,
  now,
}: {
  tableCode: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onTakeOrder: (tableCode: string) => void;
  onSettle: (check: Check) => void;
  now: number;
}) {
  const toast = useToast();
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tableCode) return;
    try {
      setCheck(await get<Check | null>(`/api/floor/tables/${tableCode}/check`));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load that table.', 'warn');
    }
  }, [tableCode, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast(success);
      await load();
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not work.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const heldItems = check?.orders.flatMap((o) => o.items).filter((i) => i.held && i.status === 'sent') ?? [];
  const readyItems = check?.orders.flatMap((o) => o.items).filter((i) => i.status === 'ready') ?? [];
  const unacknowledged = check?.orders.filter((o) => !o.acknowledgedAt) ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <div>
          <p className="eyebrow">{check?.sectionName ?? ''}</p>
          <h2 className="item-sheet__name">Table {tableCode}</h2>
          {check && (
            <p className="muted">
              {check.code} · opened {clock(check.openedAt)} · {check.guestCount} covers
            </p>
          )}
        </div>
      }
      footer={
        <div className="row row--wrap" style={{ gap: '0.5rem' }}>
          <button className="btn btn--primary" onClick={() => tableCode && onTakeOrder(tableCode)}>
            Take an order
          </button>
          {unacknowledged.length > 0 && (
            <button
              className="btn btn--gold"
              disabled={busy}
              onClick={() =>
                void act(
                  () => Promise.all(unacknowledged.map((o) => post(`/api/floor/orders/${o.id}/acknowledge`))),
                  'Acknowledged.'
                )
              }
            >
              Acknowledge {unacknowledged.length}
            </button>
          )}
          {heldItems.length > 0 && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void act(() => post(`/api/floor/checks/${check!.id}/fire`, {}), 'Fired to the kitchen.')}
            >
              Fire {heldItems.length} held
            </button>
          )}
          {readyItems.length > 0 && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void act(() => post(`/api/floor/checks/${check!.id}/serve-ready`), 'Marked served.')}
            >
              Serve {readyItems.length} ready
            </button>
          )}
          {check && check.totals.total > 0 && (
            <button className="btn btn--ghost" onClick={() => onSettle(check)}>
              Bill &amp; settle
            </button>
          )}
        </div>
      }
    >
      {!check && <p className="empty">This table has no open check. Take an order to start one.</p>}

      {check && (
        <>
          {check.orders.length === 0 && <p className="empty">No rounds on this check yet.</p>}

          {[...check.orders].reverse().map((order) => (
            <section key={order.id} className="tsheet__round">
              <header className="row row--between tsheet__round-head">
                <div>
                  <p className="eyebrow">
                    Round {order.round} · {order.source === 'guest' ? 'from the table' : `by ${order.staffName}`}
                  </p>
                  <p className="muted">
                    sent {clock(order.createdAt)} ·{' '}
                    <span className={`age ${ageClass(order.createdAt, 10, 20, now)}`}>
                      {elapsed(order.createdAt, now)}
                    </span>
                  </p>
                </div>
                <div className="row" style={{ gap: '0.4rem' }}>
                  <span className="tag">{order.status}</span>
                  {!order.acknowledgedAt && (
                    <button
                      className="btn btn--gold btn--sm"
                      disabled={busy}
                      onClick={() => void act(() => post(`/api/floor/orders/${order.id}/acknowledge`), 'Acknowledged.')}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </header>

              <ul className="tsheet__items">
                {order.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    busy={busy}
                    onStatus={(status, reason) =>
                      void act(
                        () => post(`/api/floor/items/${item.id}/status`, { status, reason }),
                        status === 'served' ? 'Served.' : status === 'unavailable' ? 'Guest and kitchen told.' : 'Updated.'
                      )
                    }
                  />
                ))}
              </ul>
            </section>
          ))}

          <hr className="rule rule--tight" />

          <div className="tsheet__totals">
            <div className="row row--between">
              <span className="muted">Subtotal</span>
              <span className="price">{money(check.totals.subtotal)}</span>
            </div>
            <div className="row row--between">
              <span className="muted">Service {check.totals.serviceChargePercent}%</span>
              <span className="price">{money(check.totals.serviceCharge)}</span>
            </div>
            <div className="row row--between tsheet__grand">
              <span>Total</span>
              <span className="price">{money(check.totals.total)}</span>
            </div>
            {check.totals.paid > 0 && (
              <div className="row row--between">
                <span className="muted">Outstanding</span>
                <span className="price">{money(check.totals.balance)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function ItemRow({
  item,
  busy,
  onStatus,
}: {
  item: OrderItem;
  busy: boolean;
  onStatus: (status: string, reason?: string) => void;
}) {
  const done = item.status === 'served' || item.status === 'void' || item.status === 'unavailable';
  return (
    <li className={`tsheet__item is-${item.status}`}>
      <span className="tsheet__qty">{item.qty}</span>
      <span className="grow">
        <span className="tsheet__name">
          {item.name}
          {item.variantLabel && <span className="muted"> · {item.variantLabel}</span>}
        </span>
        {item.modifiers.length > 0 && (
          <span className="tsheet__mods">{item.modifiers.map((m) => m.optionName).join(', ')}</span>
        )}
        {item.note && <span className="tsheet__note">“{item.note}”</span>}
        {item.allergyNote && (
          <span className="tsheet__allergy">
            <span className="tag tag--allergy">Allergy</span> {item.allergyNote}
          </span>
        )}
        {item.held && <span className="tag tag--gold">{courseName(item.course)} held</span>}
      </span>

      <span className="tsheet__actions">
        <span className="tag">{item.status}</span>
        {!done && item.status === 'ready' && (
          <button className="btn btn--sm" disabled={busy} onClick={() => onStatus('served')}>
            Served
          </button>
        )}
        {!done && (
          <button
            className="btn btn--danger btn--sm"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Why is this coming off? The guest and the pass both see this.');
              if (reason !== null) onStatus('unavailable', reason || 'Unavailable');
            }}
          >
            86
          </button>
        )}
      </span>
    </li>
  );
}
