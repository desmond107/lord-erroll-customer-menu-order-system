import { useCallback, useEffect, useMemo, useState } from 'react';
import { StaffHeader } from '../../components/StaffHeader';
import { useToast } from '../../components/Toast';
import { get, post } from '../../lib/api';
import { ageClass, clock, elapsed, money, pluralise } from '../../lib/format';
import { outbox, watchConnectivity } from '../../lib/offline';
import { useSocketEvent } from '../../lib/socket';
import type { Check, FloorSection, Order, ServiceRequest } from '../../lib/types';
import { OrderEntry } from './OrderEntry';
import { SettleSheet } from './SettleSheet';
import { TableSheet } from './TableSheet';

type View = 'floor' | 'orders' | 'requests';

/**
 * The waiter's home. Everything is one tap from here: which tables need
 * attention, which rounds are unacknowledged, and who has called for service.
 */
export function WaiterApp() {
  const toast = useToast();
  const [view, setView] = useState<View>('floor');
  const [sections, setSections] = useState<FloorSection[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [thresholds, setThresholds] = useState({ amber: 10, red: 20 });
  const [now, setNow] = useState(Date.now());
  const [queued, setQueued] = useState(0);

  const [openTable, setOpenTable] = useState<string | null>(null);
  const [entryTable, setEntryTable] = useState<string | null>(null);
  const [settling, setSettling] = useState<Check | null>(null);

  // One ticking clock for the whole screen, so every timer moves together.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => outbox.subscribe((q) => setQueued(q.length)), []);
  useEffect(() => watchConnectivity((n) => toast(`${pluralise(n, 'saved action')} went through.`)), [toast]);

  const loadFloor = useCallback(async () => {
    try {
      const data = await get<{
        sections: FloorSection[];
        settings: { ageAmberMinutes: number; ageRedMinutes: number };
      }>('/api/floor');
      setSections(data.sections);
      setThresholds({ amber: data.settings.ageAmberMinutes, red: data.settings.ageRedMinutes });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load your sections.', 'warn');
    }
  }, [toast]);

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await get<Order[]>('/api/floor/orders'));
    } catch {
      /* the socket will bring the next change */
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await get<ServiceRequest[]>('/api/floor/requests'));
    } catch {
      /* non-critical */
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadFloor();
    void loadOrders();
    void loadRequests();
  }, [loadFloor, loadOrders, loadRequests]);

  useEffect(() => {
    refreshAll();
    // A slow poll behind the socket: if a tablet's socket dies quietly, the
    // board is still never more than half a minute stale.
    const id = window.setInterval(refreshAll, 30000);
    return () => window.clearInterval(id);
  }, [refreshAll]);

  useSocketEvent<Order>('order:new', (order) => {
    toast(`New order · Table ${order.tableCode}${order.hasAllergyNote ? ' · allergy noted' : ''}`);
    refreshAll();
  });
  useSocketEvent('order:updated', () => refreshAll());
  useSocketEvent<ServiceRequest>('request:new', (request) => {
    toast(
      request.type === 'bill'
        ? `Table ${request.tableCode} has asked for the bill.`
        : `Table ${request.tableCode} has called for a waiter.`
    );
    refreshAll();
  });
  useSocketEvent('request:updated', () => void loadRequests());

  const attention = useMemo(() => {
    const pending = orders.filter((o) => !o.acknowledgedAt).length;
    const ready = sections.flatMap((s) => s.tables).filter((t) => (t.check?.ready ?? 0) > 0).length;
    return { pending, ready, requests: requests.filter((r) => r.status === 'open').length };
  }, [orders, sections, requests]);

  return (
    <div className="staff">
      <StaffHeader
        title="Floor"
        subtitle={sections.map((s) => s.name).join(' · ') || 'No sections assigned'}
      >
        <nav className="staff-tabs">
          {(['floor', 'orders', 'requests'] as View[]).map((v) => (
            <button key={v} className={`staff-tab${view === v ? ' is-on' : ''}`} onClick={() => setView(v)}>
              {v === 'floor' ? 'Tables' : v === 'orders' ? 'Orders' : 'Requests'}
              {v === 'orders' && attention.pending > 0 && <span className="pip">{attention.pending}</span>}
              {v === 'requests' && attention.requests > 0 && <span className="pip">{attention.requests}</span>}
            </button>
          ))}
        </nav>
      </StaffHeader>

      {queued > 0 && (
        <div className="offline-bar">{pluralise(queued, 'action')} saved on this device, waiting for the network</div>
      )}

      <main className="staff__body">
        {view === 'floor' && (
          <>
            {sections.length === 0 && <p className="empty">You have no sections assigned. A manager can set that.</p>}
            {sections.map((section) => (
              <section key={section.id} className="floor-section">
                <div className="section-title">
                  <h2>{section.name}</h2>
                  <span className="muted">{section.tables.filter((t) => t.check).length} of {section.tables.length} occupied</span>
                </div>
                <div className="table-grid">
                  {section.tables.map((table) => {
                    const check = table.check;
                    const age = check?.oldestOpenOrderAt ?? null;
                    return (
                      <button
                        key={table.id}
                        className={`table-card${check ? ' is-open' : ''}${table.requests.length ? ' is-calling' : ''}`}
                        onClick={() => setOpenTable(table.code)}
                      >
                        <span className="table-card__code">{Number(table.number)}</span>
                        {check ? (
                          <>
                            <span className={`table-card__age age ${ageClass(age, thresholds.amber, thresholds.red, now)}`}>
                              {age ? elapsed(age, now) : clock(check.openedAt)}
                            </span>
                            <span className="table-card__total price">{money(check.total)}</span>
                            <span className="table-card__flags">
                              {check.allergies > 0 && <span className="tag tag--allergy">allergy</span>}
                              {check.pending > 0 && <span className="tag">{check.pending} new</span>}
                              {check.held > 0 && <span className="tag tag--gold">{check.held} held</span>}
                              {check.ready > 0 && <span className="tag tag--green">{check.ready} ready</span>}
                            </span>
                          </>
                        ) : (
                          <span className="table-card__free">free</span>
                        )}
                        {table.requests.length > 0 && (
                          <span className="table-card__calling">
                            {table.requests.some((r) => r.type === 'bill') ? 'bill' : 'calling'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {view === 'orders' && (
          <div className="order-feed">
            {orders.length === 0 && <p className="empty">Nothing outstanding. A good place to be.</p>}
            {orders.map((order) => (
              <article key={order.id} className={`panel order-card${order.acknowledgedAt ? '' : ' is-new'}`}>
                <header className="panel__head">
                  <div>
                    <p className="eyebrow">
                      {order.sectionName} · Table {order.tableCode.split('-')[1]} · round {order.round}
                    </p>
                    <h3 className="order-card__title">
                      {order.source === 'guest' ? 'From the table' : `Taken by ${order.staffName}`}
                    </h3>
                  </div>
                  <div className="center">
                    <p className={`age ${ageClass(order.createdAt, thresholds.amber, thresholds.red, now)}`}>
                      {elapsed(order.createdAt, now)}
                    </p>
                    <p className="muted order-card__clock">{clock(order.createdAt)}</p>
                  </div>
                </header>

                <div className="panel__body">
                  {order.hasAllergyNote && (
                    <p className="order-card__allergy">
                      <span className="tag tag--allergy">Allergy</span>{' '}
                      {order.items.filter((i) => i.allergyNote).map((i) => `${i.name}: ${i.allergyNote}`).join(' · ')}
                    </p>
                  )}
                  <ul className="order-card__items">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span className="order-card__qty">{item.qty}</span>
                        <span className="grow">
                          {item.name}
                          {item.variantLabel && <span className="muted"> · {item.variantLabel}</span>}
                          {item.modifiers.length > 0 && (
                            <span className="order-card__mods"> {item.modifiers.map((m) => m.optionName).join(', ')}</span>
                          )}
                          {item.note && <span className="order-card__note"> “{item.note}”</span>}
                        </span>
                        <span className="tag">{item.held ? 'held' : item.status}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="row row--wrap order-card__actions">
                    {!order.acknowledgedAt && (
                      <button
                        className="btn btn--gold btn--sm"
                        onClick={() =>
                          void post(`/api/floor/orders/${order.id}/acknowledge`)
                            .then(() => { toast('Acknowledged.'); refreshAll(); })
                            .catch((e: Error) => toast(e.message, 'warn'))
                        }
                      >
                        Acknowledge
                      </button>
                    )}
                    <button className="btn btn--sm" onClick={() => setOpenTable(order.tableCode)}>
                      Open table
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {view === 'requests' && (
          <div className="requests">
            {requests.length === 0 && <p className="empty">No one is waiting on you.</p>}
            {requests.map((request) => (
              <article key={request.id} className={`panel request-card is-${request.status}`}>
                <div className="panel__body row row--between">
                  <div>
                    <p className="eyebrow">Table {request.tableCode} · {request.sectionCode}</p>
                    <h3 className="request-card__title">
                      {request.type === 'bill' ? 'Asked for the bill' : request.type === 'water' ? 'Asked for water' : 'Called for a waiter'}
                    </h3>
                    {request.note && <p className="muted italic">{request.note}</p>}
                    <p className={`age ${ageClass(request.createdAt, 2, 5, now)}`}>
                      waiting {elapsed(request.createdAt, now)}
                    </p>
                  </div>
                  <div className="row" style={{ gap: '0.4rem' }}>
                    {request.status === 'open' && (
                      <button
                        className="btn btn--gold btn--sm"
                        onClick={() =>
                          void post(`/api/floor/requests/${request.id}/acknowledge`)
                            .then(() => { toast('The table has been told you are coming.'); void loadRequests(); })
                            .catch((e: Error) => toast(e.message, 'warn'))
                        }
                      >
                        On my way
                      </button>
                    )}
                    <button
                      className="btn btn--sm"
                      onClick={() =>
                        void post(`/api/floor/requests/${request.id}/resolve`)
                          .then(() => { toast('Cleared.'); void loadRequests(); })
                          .catch((e: Error) => toast(e.message, 'warn'))
                      }
                    >
                      Done
                    </button>
                    <button className="btn btn--sm" onClick={() => request.tableCode && setOpenTable(request.tableCode)}>
                      Table
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <TableSheet
        tableCode={openTable}
        open={!!openTable}
        now={now}
        onClose={() => setOpenTable(null)}
        onChanged={refreshAll}
        onTakeOrder={(code) => {
          setOpenTable(null);
          setEntryTable(code);
        }}
        onSettle={(check) => {
          setOpenTable(null);
          setSettling(check);
        }}
      />

      <OrderEntry
        open={!!entryTable}
        tableCode={entryTable}
        onClose={() => setEntryTable(null)}
        onSent={refreshAll}
      />

      <SettleSheet
        check={settling}
        open={!!settling}
        onClose={() => setSettling(null)}
        onSettled={refreshAll}
      />
    </div>
  );
}
