import { StatusTrail } from '../../components/StatusTrail';
import { clock, courseName, money } from '../../lib/format';
import type { Check } from '../../lib/types';

/** What the guest sees after sending: every round, and where it has got to. */
export function OrderProgress({ check }: { check: Check | null }) {
  if (!check || check.orders.length === 0) {
    return (
      <div className="empty">
        <img src="/crest.svg" alt="" className="empty__mark" />
        <p>Nothing ordered yet this evening.</p>
      </div>
    );
  }

  return (
    <div className="progress">
      {[...check.orders].reverse().map((order) => (
        <article key={order.id} className="panel progress__round">
          <header className="panel__head">
            <div>
              <p className="eyebrow">Round {order.round} · sent {clock(order.createdAt)}</p>
              <h3 className="progress__title">
                {order.source === 'waiter' ? `Taken by ${order.staffName ?? 'your waiter'}` : 'Sent from your table'}
              </h3>
            </div>
            {order.hasAllergyNote && <span className="tag tag--allergy">Allergy noted</span>}
          </header>

          <div className="panel__body">
            <StatusTrail status={order.status} />

            <ul className="progress__items">
              {order.items.map((item) => (
                <li key={item.id} className={`progress__item is-${item.status}`}>
                  <span className="progress__qty">{item.qty}</span>
                  <span className="grow">
                    <span className="progress__name">
                      {item.name}
                      {item.variantLabel && <span className="muted"> · {item.variantLabel}</span>}
                    </span>
                    {item.modifiers.length > 0 && (
                      <span className="progress__mods">
                        {item.modifiers.map((m) => m.optionName).join(', ')}
                      </span>
                    )}
                    {item.note && <span className="progress__note">“{item.note}”</span>}
                    {item.allergyNote && (
                      <span className="progress__allergy">Allergy: {item.allergyNote}</span>
                    )}
                  </span>
                  <span className="progress__state">
                    {item.status === 'void' || item.status === 'unavailable' ? (
                      <span className="tag tag--off">
                        {item.status === 'unavailable' ? 'unavailable' : 'removed'}
                      </span>
                    ) : item.held ? (
                      <span className="tag tag--gold">{courseName(item.course)} to follow</span>
                    ) : (
                      <span className="tag">{labelFor(item.status)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}

      <div className="panel progress__running">
        <div className="panel__body row row--between">
          <div>
            <p className="eyebrow">Running total</p>
            <p className="muted italic">Service and VAT are added on the bill.</p>
          </div>
          <p className="price progress__total">{money(check.totals.subtotal)}</p>
        </div>
      </div>
    </div>
  );
}

const LABELS: Record<string, string> = {
  sent: 'sent',
  preparing: 'being prepared',
  ready: 'on its way',
  served: 'served',
};
const labelFor = (status: string) => LABELS[status] ?? status;
