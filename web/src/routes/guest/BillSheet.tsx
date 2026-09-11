import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { money, usd } from '../../lib/format';
import type { Check } from '../../lib/types';

/**
 * The bill as the guest sees it. Nothing is charged here — settlement happens
 * with the waiter, which is what a room like this expects.
 */
export function BillSheet({
  open,
  check,
  onClose,
  onRequest,
  requesting,
}: {
  open: boolean;
  check: Check | null;
  onClose: () => void;
  onRequest: (splitMode: 'single' | 'even', splitWays: number) => void;
  requesting: boolean;
}) {
  const [splitMode, setSplitMode] = useState<'single' | 'even'>('single');
  const [ways, setWays] = useState(2);

  const totals = check?.totals;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div>
          <p className="eyebrow">Table {check?.tableCode ?? ''}</p>
          <h2 className="item-sheet__name">Your bill</h2>
        </div>
      }
      footer={
        <button
          className="btn btn--primary btn--block"
          onClick={() => onRequest(splitMode, ways)}
          disabled={requesting || !check}
        >
          {requesting ? 'Letting your waiter know…' : 'Ask for the bill'}
        </button>
      }
    >
      {!totals || totals.lines.length === 0 ? (
        <p className="empty">Nothing on the bill yet.</p>
      ) : (
        <>
          <ul className="bill">
            {totals.lines.map((line) => (
              <li key={line.id} className="bill__line">
                <span className="bill__qty">{line.qty}</span>
                <span className="grow">
                  {line.name}
                  {line.variantLabel && <span className="muted"> · {line.variantLabel}</span>}
                  {line.comped && <span className="tag tag--gold bill__comp">with our compliments</span>}
                </span>
                <span className="price">{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <hr className="rule rule--tight" />

          <dl className="bill__totals">
            <Row label="Subtotal" value={money(totals.subtotal)} />
            {totals.discount > 0 && (
              <Row label={`Discount (${totals.discountPercent}%)`} value={`− ${money(totals.discount)}`} />
            )}
            <Row label={`Service charge (${totals.serviceChargePercent}%)`} value={money(totals.serviceCharge)} />
            <Row
              label={`VAT (${totals.vatPercent}%)${totals.vatIncluded ? ' — included' : ''}`}
              value={money(totals.vat)}
              muted={totals.vatIncluded}
            />
            <Row label="Total" value={money(totals.total)} strong />
            {totals.paid > 0 && (
              <>
                <Row label="Paid" value={money(totals.paid)} />
                <Row label="Still to pay" value={money(totals.balance)} strong />
              </>
            )}
          </dl>

          <p className="bill__usd muted italic">Approximately {usd(totals.total, totals.usdRate)}.</p>

          <hr className="rule rule--tight" />

          <div className="field">
            <span className="field__label">How would you like to settle</span>
            <div className="chip-set">
              <button
                className={`chip${splitMode === 'single' ? ' is-on' : ''}`}
                onClick={() => setSplitMode('single')}
              >
                One bill
              </button>
              <button
                className={`chip${splitMode === 'even' ? ' is-on' : ''}`}
                onClick={() => setSplitMode('even')}
              >
                Split evenly
              </button>
            </div>
          </div>

          {splitMode === 'even' && (
            <div className="field">
              <span className="field__label">Between how many</span>
              <div className="chip-set">
                {[2, 3, 4, 5, 6, 8].map((n) => (
                  <button key={n} className={`chip${ways === n ? ' is-on' : ''}`} onClick={() => setWays(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="field__hint">
                {money(Math.ceil(totals.total / ways))} each, near enough.
              </p>
            </div>
          )}

          <p className="field__hint">
            Your waiter will bring the card machine. Cash and M-Pesa are also welcome.
          </p>
        </>
      )}
    </Sheet>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`bill__row${strong ? ' bill__row--strong' : ''}${muted ? ' bill__row--muted' : ''}`}>
      <dt>{label}</dt>
      <dd className="price">{value}</dd>
    </div>
  );
}
