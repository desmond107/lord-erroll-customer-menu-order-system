import { useCallback, useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { get, post } from '../../lib/api';
import { money } from '../../lib/format';
import type { Check, Totals } from '../../lib/types';

interface Breakdown extends Totals {
  mode: 'single' | 'even' | 'item';
  shares: { splitGroup?: number; label: string; amount: number; subtotal?: number }[];
}

const METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'mpesa', label: 'M-Pesa' },
  { key: 'account', label: 'To account' },
] as const;

/**
 * Settlement. Card and M-Pesa need the line to be up to authorise, but this
 * screen only records the outcome, so cash and account never stop working.
 */
export function SettleSheet({
  check,
  open,
  onClose,
  onSettled,
}: {
  check: Check | null;
  open: boolean;
  onClose: () => void;
  onSettled: () => void;
}) {
  const toast = useToast();
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [method, setMethod] = useState<string>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!check) return;
    try {
      const data = await get<Breakdown>(`/api/bills/${check.id}/breakdown`);
      setBreakdown(data);
      setAmount(data.balance > 0 ? String(data.balance) : '');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the bill.', 'warn');
    }
  }, [check, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const setSplit = async (mode: 'single' | 'even', ways = 2) => {
    if (!check) return;
    setBusy(true);
    try {
      setBreakdown(await post<Breakdown>(`/api/bills/${check.id}/split`, { mode, ways }));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not split that.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const takePayment = async () => {
    if (!check) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast('Enter an amount first.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const updated = await post<Check>(`/api/bills/${check.id}/payments`, {
        method,
        amount: value,
        reference: reference.trim() || undefined,
      });
      toast(
        updated.status === 'closed'
          ? `Table ${updated.tableCode} settled and closed.`
          : `Recorded. ${money(updated.totals.balance)} still outstanding.`
      );
      setReference('');
      await load();
      onSettled();
      if (updated.status === 'closed') onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That payment did not record.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div>
          <p className="eyebrow">Settling</p>
          <h2 className="item-sheet__name">Table {check?.tableCode}</h2>
        </div>
      }
      footer={
        <button className="btn btn--primary btn--block" disabled={busy} onClick={() => void takePayment()}>
          Record {method === 'cash' ? 'cash' : method === 'card' ? 'card' : method === 'mpesa' ? 'M-Pesa' : 'account'} payment
        </button>
      }
    >
      {!breakdown ? (
        <p className="empty">Loading the bill…</p>
      ) : (
        <>
          <dl className="bill__totals">
            <div className="bill__row"><dt>Subtotal</dt><dd className="price">{money(breakdown.subtotal)}</dd></div>
            {breakdown.discount > 0 && (
              <div className="bill__row"><dt>Discount</dt><dd className="price">− {money(breakdown.discount)}</dd></div>
            )}
            <div className="bill__row">
              <dt>Service {breakdown.serviceChargePercent}%</dt>
              <dd className="price">{money(breakdown.serviceCharge)}</dd>
            </div>
            <div className="bill__row bill__row--muted">
              <dt>VAT {breakdown.vatPercent}%{breakdown.vatIncluded ? ' included' : ''}</dt>
              <dd className="price">{money(breakdown.vat)}</dd>
            </div>
            <div className="bill__row bill__row--strong"><dt>Total</dt><dd className="price">{money(breakdown.total)}</dd></div>
            {breakdown.paid > 0 && (
              <>
                <div className="bill__row"><dt>Paid</dt><dd className="price">{money(breakdown.paid)}</dd></div>
                <div className="bill__row bill__row--strong"><dt>Outstanding</dt><dd className="price">{money(breakdown.balance)}</dd></div>
              </>
            )}
          </dl>

          <hr className="rule rule--tight" />

          <div className="field">
            <span className="field__label">Split</span>
            <div className="chip-set">
              <button className={`chip${breakdown.mode === 'single' ? ' is-on' : ''}`} onClick={() => void setSplit('single')}>
                One bill
              </button>
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  className={`chip${breakdown.mode === 'even' && breakdown.shares.length === n ? ' is-on' : ''}`}
                  onClick={() => void setSplit('even', n)}
                >
                  {n} ways
                </button>
              ))}
            </div>
            {breakdown.mode === 'even' && (
              <p className="field__hint">
                {breakdown.shares.map((s) => `${s.label} ${money(s.amount)}`).join(' · ')}
              </p>
            )}
          </div>

          <div className="field">
            <span className="field__label">Method</span>
            <div className="chip-set">
              {METHODS.map((m) => (
                <button key={m.key} className={`chip${method === m.key ? ' is-on' : ''}`} onClick={() => setMethod(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Amount</span>
            <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {breakdown.mode === 'even' && breakdown.shares[0] && (
              <p className="field__hint">
                One share is {money(breakdown.shares[0].amount)}.{' '}
                <button className="btn btn--ghost btn--sm" onClick={() => setAmount(String(breakdown.shares[0].amount))}>
                  Use it
                </button>
              </p>
            )}
          </label>

          {(method === 'mpesa' || method === 'card') && (
            <label className="field">
              <span className="field__label">{method === 'mpesa' ? 'M-Pesa code' : 'Terminal slip'}</span>
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
              <p className="field__hint">
                This only records what the terminal or M-Pesa already confirmed. If the line is
                down, take cash or charge to account and the check still closes.
              </p>
            </label>
          )}
        </>
      )}
    </Sheet>
  );
}
