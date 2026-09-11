import { Sheet } from '../../components/Sheet';
import { money } from '../../lib/format';
import type { DraftLine } from '../../lib/types';

/** "Your order" — reviewed once, then sent to the floor. */
export function BasketSheet({
  open,
  lines,
  onClose,
  onEdit,
  onRemove,
  onSend,
  sending,
}: {
  open: boolean;
  lines: DraftLine[];
  onClose: () => void;
  onEdit: (line: DraftLine) => void;
  onRemove: (uid: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const total = lines.reduce(
    (sum, l) => sum + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * l.qty,
    0
  );
  const allergyLines = lines.filter((l) => l.allergyNote);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div>
          <p className="eyebrow">Your order</p>
          <h2 className="item-sheet__name">Ready when you are</h2>
        </div>
      }
      footer={
        <div className="row row--between">
          <div>
            <p className="eyebrow">This round</p>
            <p className="price item-sheet__total">{money(total)}</p>
          </div>
          <button className="btn btn--primary" onClick={onSend} disabled={!lines.length || sending}>
            {sending ? 'Sending…' : 'Send to the kitchen'}
          </button>
        </div>
      }
    >
      {lines.length === 0 && <p className="empty">Nothing chosen yet.</p>}

      <ul className="basket">
        {lines.map((line) => {
          const lineTotal =
            (line.unitPrice + line.modifiers.reduce((m, x) => m + x.priceDelta, 0)) * line.qty;
          return (
            <li key={line.uid} className="basket__line">
              <div className="grow">
                <p className="basket__name">
                  <span className="basket__qty">{line.qty}</span>
                  {line.item.name}
                  {line.variantLabel && <span className="muted"> · {line.variantLabel}</span>}
                </p>
                {line.modifiers.length > 0 && (
                  <p className="basket__mods">
                    {groupByCover(line).map((group, i) => (
                      <span key={i} className="basket__mod-group">
                        {group.cover ? `Guest ${group.cover}: ` : ''}
                        {group.names.join(', ')}
                      </span>
                    ))}
                  </p>
                )}
                {line.note && <p className="basket__note">“{line.note}”</p>}
                {line.allergyNote && (
                  <p className="basket__allergy">
                    <span className="tag tag--allergy">Allergy</span> {line.allergyNote}
                  </p>
                )}
                <div className="row basket__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => onEdit(line)}>Edit</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => onRemove(line.uid)}>Remove</button>
                </div>
              </div>
              <span className="price">{money(lineTotal)}</span>
            </li>
          );
        })}
      </ul>

      {allergyLines.length > 0 && (
        <p className="basket__allergy-banner">
          Your allergy notes go straight to the kitchen and to your waiter. If anything is serious,
          please also mention it when your waiter comes over.
        </p>
      )}

      {lines.length > 0 && (
        <p className="basket__footnote">
          Courses are paced for you. Starters and drinks go straight through; mains are held until
          your waiter fires them, unless you ask otherwise.
        </p>
      )}
    </Sheet>
  );
}

function groupByCover(line: DraftLine) {
  const map = new Map<number | null, string[]>();
  for (const m of line.modifiers) {
    const key = m.cover ?? null;
    map.set(key, [...(map.get(key) ?? []), m.optionName]);
  }
  return [...map.entries()].map(([cover, names]) => ({ cover, names }));
}
