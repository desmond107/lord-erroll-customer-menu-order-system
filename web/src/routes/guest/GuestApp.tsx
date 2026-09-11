import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Crest, Wordmark } from '../../components/Crest';
import { useToast } from '../../components/Toast';
import { get, tableToken } from '../../lib/api';
import { money } from '../../lib/format';
import { flushOutbox, outbox, sendOrQueue, watchConnectivity } from '../../lib/offline';
import { resetSocket, useConnection, useSocketEvent } from '../../lib/socket';
import type { Check, DraftLine, GuestSession, MenuItem, ServiceRequest } from '../../lib/types';
import { BasketSheet } from './BasketSheet';
import { BillSheet } from './BillSheet';
import { ItemSheet } from './ItemSheet';
import { MenuBrowser } from './MenuBrowser';
import { OrderProgress } from './OrderProgress';

type Tab = 'menu' | 'order' | 'bill';

/**
 * The guest app. Reached only by scanning the card on the table, which is what
 * ties every order to the right table and section without anyone typing a number.
 */
export function GuestApp() {
  const { token } = useParams<{ token: string }>();
  const toast = useToast();
  const connected = useConnection();

  const [session, setSession] = useState<GuestSession | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('menu');

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [editing, setEditing] = useState<DraftLine | null>(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [queued, setQueued] = useState(0);

  // The QR token is the guest's whole identity. Store it so a refresh, or a
  // phone that locks mid-meal, comes back to the same table.
  useEffect(() => {
    if (token) {
      tableToken.set(token);
      resetSocket();
    }
  }, [token]);

  const load = useCallback(async () => {
    try {
      const data = await get<GuestSession>('/api/guest/session', true);
      setSession(data);
      setCheck(data.check);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please rescan the card on your table.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, token]);

  useEffect(() => outbox.subscribe((q) => setQueued(q.length)), []);
  useEffect(
    () =>
      watchConnectivity((n) => {
        toast(`${n === 1 ? 'Your order' : `${n} requests`} went through.`);
        void load();
      }),
    [toast, load]
  );

  const refreshCheck = useCallback(async () => {
    try {
      setCheck(await get<Check | null>('/api/guest/check', true));
    } catch {
      /* the socket or the next poll will catch up */
    }
  }, []);

  useSocketEvent<Check>('check:updated', (payload) => setCheck(payload));
  useSocketEvent('order:updated', () => void refreshCheck());
  useSocketEvent('order:new', () => void refreshCheck());
  useSocketEvent<{ name?: string; available?: boolean }>('menu:updated', (payload) => {
    void load();
    if (payload?.name && payload.available === false) {
      toast(`With our apologies, ${payload.name} has just finished.`, 'warn');
    }
  });
  useSocketEvent<{ status: string; type: string }>('request:updated', (payload) => {
    if (payload.status === 'acknowledged') toast('Your waiter is on the way.');
    void loadRequests();
  });

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await get<ServiceRequest[]>('/api/guest/requests', true));
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const basketCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const line of lines) counts[line.item.id] = (counts[line.item.id] ?? 0) + line.qty;
    return counts;
  }, [lines]);

  const basketTotal = lines.reduce(
    (sum, l) => sum + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * l.qty,
    0
  );
  const basketCount = lines.reduce((n, l) => n + l.qty, 0);

  const addLine = (draft: Omit<DraftLine, 'uid'>) => {
    if (editing) {
      setLines((prev) => prev.map((l) => (l.uid === editing.uid ? { ...draft, uid: l.uid } : l)));
      setEditing(null);
      return;
    }
    setLines((prev) => [...prev, { ...draft, uid: `${Date.now()}-${prev.length}` }]);
    toast(`${draft.item.name} added to your order.`);
  };

  const sendOrder = async () => {
    if (!lines.length) return;
    setSending(true);
    try {
      const payload = {
        guestCount: session?.table.seats,
        items: lines.map((l) => ({
          menuItemId: l.item.id,
          variantId: l.variantId,
          qty: l.qty,
          note: l.note || undefined,
          allergyNote: l.allergyNote || undefined,
          modifiers: l.modifiers.map((m) => ({ optionId: m.optionId, cover: m.cover ?? undefined })),
        })),
      };
      const result = await sendOrQueue<{ order: unknown }>('/api/guest/orders', payload, {
        asGuest: true,
        label: 'Your order',
      });

      setLines([]);
      setBasketOpen(false);
      setTab('order');
      toast(
        result
          ? 'Sent. Your waiter has it now.'
          : 'Saved. It will reach your waiter the moment the connection returns.'
      );
      if (result) await refreshCheck();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not go through.', 'warn');
    } finally {
      setSending(false);
    }
  };

  const callWaiter = async (type: 'waiter' | 'water' | 'assistance') => {
    setRequesting(true);
    try {
      const result = await sendOrQueue('/api/guest/requests', { type }, { asGuest: true, label: 'Waiter request' });
      toast(result ? 'Your waiter has been called.' : 'Saved — your waiter will be called shortly.');
      await loadRequests();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not call your waiter.', 'warn');
    } finally {
      setRequesting(false);
    }
  };

  const askForBill = async (splitMode: 'single' | 'even', splitWays: number) => {
    setRequesting(true);
    try {
      const updated = await sendOrQueue<Check>('/api/guest/bill', { splitMode, splitWays }, {
        asGuest: true,
        label: 'The bill',
      });
      if (updated) setCheck(updated);
      setBillOpen(false);
      toast('Your waiter is bringing the bill.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not ask for the bill.', 'warn');
    } finally {
      setRequesting(false);
    }
  };

  if (error) {
    return (
      <div className="guest-error">
        <Crest size={92} />
        <Wordmark />
        <hr className="rule" />
        <p className="italic">{error}</p>
        <button className="btn" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="guest-loading">
        <Crest size={78} />
        <p className="tagline">Setting your table</p>
      </div>
    );
  }

  const openRequest = requests.find((r) => r.status !== 'resolved');

  return (
    <div className="guest">
      {!connected && (
        <div className="offline-bar">
          Reconnecting{queued > 0 ? ` · ${queued} saved to send` : ''}
        </div>
      )}

      <header className="guest__head">
        <Crest size={46} />
        <div className="guest__masthead">
          <p className="wordmark wordmark--sm">The Lord Erroll</p>
          <p className="guest__table">
            {session.table.sectionName} · Table {Number(session.table.number)}
          </p>
        </div>
        <button
          className="btn btn--ghost btn--sm guest__call"
          onClick={() => void callWaiter('waiter')}
          disabled={requesting}
        >
          {openRequest ? 'Waiter called' : 'Call waiter'}
        </button>
      </header>

      <nav className="guest__tabs">
        {(['menu', 'order', 'bill'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`guest__tab${tab === t ? ' is-on' : ''}`}
            onClick={() => {
              setTab(t);
              if (t === 'bill') setBillOpen(true);
            }}
          >
            {t === 'menu' ? 'Menu' : t === 'order' ? 'Your order' : 'Bill'}
          </button>
        ))}
      </nav>

      <main className="guest__body">
        {tab === 'menu' && (
          <MenuBrowser
            categories={session.menu}
            basketCounts={basketCounts}
            onPick={(item) => {
              setEditing(null);
              setPicked(item);
            }}
          />
        )}
        {tab === 'order' && <OrderProgress check={check} />}
        {tab === 'bill' && (
          <div className="guest__bill-placeholder">
            <button className="btn btn--primary" onClick={() => setBillOpen(true)}>
              Open the bill
            </button>
          </div>
        )}
      </main>

      {basketCount > 0 && tab === 'menu' && (
        <button className="basket-bar" onClick={() => setBasketOpen(true)}>
          <span className="basket-bar__count">{basketCount}</span>
          <span className="grow">Review your order</span>
          <span className="price basket-bar__total">{money(basketTotal)}</span>
        </button>
      )}

      <ItemSheet
        item={picked ?? editing?.item ?? null}
        open={!!picked || !!editing}
        editing={editing}
        onClose={() => {
          setPicked(null);
          setEditing(null);
        }}
        onAdd={addLine}
      />

      <BasketSheet
        open={basketOpen}
        lines={lines}
        sending={sending}
        onClose={() => setBasketOpen(false)}
        onEdit={(line) => {
          setBasketOpen(false);
          setEditing(line);
        }}
        onRemove={(uid) => setLines((prev) => prev.filter((l) => l.uid !== uid))}
        onSend={() => void sendOrder()}
      />

      <BillSheet
        open={billOpen}
        check={check}
        requesting={requesting}
        onClose={() => {
          setBillOpen(false);
          if (tab === 'bill') setTab('menu');
        }}
        onRequest={(mode, ways) => void askForBill(mode, ways)}
      />

      <footer className="guest__foot">
        <hr className="rule rule--tight" />
        <p className="muted italic">
          Please tell us about any allergies or intolerances before ordering.
        </p>
        <p className="tagline">89 Ruaka Road, Nairobi</p>
        {queued > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={() => void flushOutbox()}>
            {queued} saved to send · retry now
          </button>
        )}
      </footer>
    </div>
  );
}
