import { useCallback, useEffect, useState } from 'react';
import { StaffHeader } from '../../components/StaffHeader';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { get, post } from '../../lib/api';
import { ageClass, clock, elapsed } from '../../lib/format';
import { useSocketEvent } from '../../lib/socket';
import type { MenuCategory, Station, StationTicket } from '../../lib/types';

const COPY: Record<Station, { title: string; sub: string; empty: string }> = {
  kitchen: {
    title: 'Kitchen',
    sub: 'Food tickets in fire order',
    empty: 'The pass is clear.',
  },
  bar: {
    title: 'Bar',
    sub: 'Drinks, poured first',
    empty: 'No drinks waiting.',
  },
};

/**
 * The display system. Kitchen and bar run the same board on purpose — one
 * muscle memory for both passes — but they are separate queues, so a round of
 * cocktails never sits behind a dry-aged porterhouse.
 */
export function StationApp({ station }: { station: Station }) {
  const toast = useToast();
  const [tickets, setTickets] = useState<StationTicket[]>([]);
  const [now, setNow] = useState(Date.now());
  const [eightySix, setEightySix] = useState(false);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await get<{ tickets: StationTicket[] }>(`/api/station/${station}/queue`);
      setTickets(data.tickets);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the board.', 'warn');
    }
  }, [station, toast]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  useSocketEvent<{ tableCode: string; hasAllergyNote?: boolean }>('order:new', (order) => {
    void load();
    toast(`Table ${order.tableCode}${order.hasAllergyNote ? ' — ALLERGY' : ''}`, order.hasAllergyNote ? 'warn' : 'default');
  });
  useSocketEvent('order:updated', () => void load());
  useSocketEvent('menu:updated', () => { if (eightySix) void loadMenu(); });

  const loadMenu = useCallback(async () => {
    try {
      const data = await get<{ categories: MenuCategory[] }>('/api/menu?audience=staff');
      setMenu(data.categories);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    if (eightySix) void loadMenu();
  }, [eightySix, loadMenu]);

  const bump = async (ticket: StationTicket, action: 'start' | 'ready') => {
    setBusy(ticket.orderId);
    try {
      await post(`/api/station/tickets/${ticket.orderId}/${action}`, { station });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not register.', 'warn');
    } finally {
      setBusy(null);
    }
  };

  const setAvailability = async (itemId: number, available: boolean, name: string) => {
    try {
      const reason = available ? undefined : window.prompt(`Why is ${name} off? Guests see this.`) || 'Finished for this evening';
      await post(`/api/station/menu/${itemId}/availability`, { available, reason });
      toast(available ? `${name} is back on.` : `${name} is off every menu now.`);
      await loadMenu();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not change that.', 'warn');
    }
  };

  const copy = COPY[station];

  return (
    <div className={`staff station station--${station}`}>
      <StaffHeader title={copy.title} subtitle={copy.sub}>
        <button className="btn btn--sm" onClick={() => setEightySix(true)}>
          86 an item
        </button>
      </StaffHeader>

      <main className="station__board">
        {tickets.length === 0 && (
          <div className="empty station__empty">
            <img src="/crest.svg" alt="" className="empty__mark" />
            <p>{copy.empty}</p>
          </div>
        )}

        {tickets.map((ticket) => {
          const started = ticket.items.some((i) => i.status === 'preparing');
          return (
            <article
              key={ticket.key}
              className={`ticket${ticket.hasAllergyNote ? ' ticket--allergy' : ''}${started ? ' ticket--working' : ''}`}
            >
              <header className="ticket__head">
                <div>
                  <p className="ticket__table">{ticket.tableCode}</p>
                  <p className="ticket__section">{ticket.sectionName} · round {ticket.round}</p>
                </div>
                <div className="center">
                  <p className={`ticket__age age ${ageClass(ticket.firedAt, 8, 16, now)}`}>
                    {elapsed(ticket.firedAt, now)}
                  </p>
                  <p className="ticket__clock">{clock(ticket.firedAt)}</p>
                </div>
              </header>

              {ticket.hasAllergyNote && (
                <p className="ticket__allergy-banner">
                  Allergy on this ticket — check every line before it leaves the pass.
                </p>
              )}

              <ul className="ticket__items">
                {ticket.items.map((item) => (
                  <li key={item.id} className={`ticket__item is-${item.status}`}>
                    <span className="ticket__qty">{item.qty}</span>
                    <span className="grow">
                      <span className="ticket__name">
                        {item.name}
                        {item.variantLabel && <span className="ticket__variant"> · {item.variantLabel}</span>}
                      </span>
                      {item.modifiers.length > 0 && (
                        <span className="ticket__mods">
                          {item.modifiers
                            .map((m) => (m.cover ? `G${m.cover}: ${m.optionName}` : m.optionName))
                            .join(' · ')}
                        </span>
                      )}
                      {item.note && <span className="ticket__note">{item.note}</span>}
                      {item.allergyNote && <span className="ticket__allergy">ALLERGY — {item.allergyNote}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              {ticket.orderNote && <p className="ticket__order-note">{ticket.orderNote}</p>}

              <footer className="ticket__foot">
                <button
                  className="btn btn--sm"
                  disabled={busy === ticket.orderId || started}
                  onClick={() => void bump(ticket, 'start')}
                >
                  {started ? 'Working' : 'Start'}
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={busy === ticket.orderId}
                  onClick={() => void bump(ticket, 'ready')}
                >
                  Ready
                </button>
              </footer>
            </article>
          );
        })}
      </main>

      <Sheet
        open={eightySix}
        onClose={() => setEightySix(false)}
        wide
        title={
          <div>
            <p className="eyebrow">{copy.title}</p>
            <h2 className="item-sheet__name">What is off tonight</h2>
          </div>
        }
      >
        <p className="muted italic">
          Taking something off here removes it from every guest menu in the building at once.
        </p>
        {menu
          .filter((c) => c.station === station)
          .map((category) => (
            <section key={category.id} className="eightysix__group">
              <p className="eyebrow">{category.name}</p>
              <div className="eightysix__items">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    className={`chip${item.available ? '' : ' is-on'}`}
                    onClick={() => void setAvailability(item.id, !item.available, item.name)}
                  >
                    {item.name}
                    {!item.available && <span className="chip__price">86</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
      </Sheet>
    </div>
  );
}
