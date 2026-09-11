import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { money } from '../../lib/format';
import type { DraftLine, MenuItem } from '../../lib/types';

interface Selection {
  groupId: number;
  optionId: number;
  groupName: string;
  optionName: string;
  priceDelta: number;
  cover?: number | null;
}

/**
 * The ordering sheet for one dish. Allergy notes get their own field rather
 * than being buried in "special requests" — the printed menus ask guests to
 * flag allergies before ordering, so the app asks in the same place.
 */
export function ItemSheet({
  item,
  open,
  onClose,
  onAdd,
  editing,
}: {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onAdd: (line: Omit<DraftLine, 'uid'>) => void;
  editing?: DraftLine | null;
}) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [allergyNote, setAllergyNote] = useState('');
  const [selections, setSelections] = useState<Selection[]>([]);

  const isSet = !!item?.isSetMenu;

  useEffect(() => {
    if (!open || !item) return;
    if (editing) {
      setQty(editing.qty);
      setVariantId(editing.variantId);
      setNote(editing.note);
      setAllergyNote(editing.allergyNote);
      setSelections(editing.modifiers);
      return;
    }
    setQty(1);
    setNote('');
    setAllergyNote('');
    setSelections([]);
    const firstAvailable = item.variants.find((v) => v.available && v.price !== null);
    setVariantId(firstAvailable?.id ?? null);
  }, [open, item, editing]);

  const variant = useMemo(
    () => item?.variants.find((v) => v.id === variantId) ?? null,
    [item, variantId]
  );

  const unitPrice = variant?.price ?? item?.price ?? 0;
  const modifierTotal = selections.reduce((sum, s) => sum + s.priceDelta, 0);
  const lineTotal = (unitPrice + modifierTotal) * qty;

  /** Set menus repeat their course choices once per cover. */
  const covers = isSet ? Array.from({ length: qty }, (_, i) => i + 1) : [null];

  const choose = (groupId: number, optionId: number, cover: number | null, single: boolean) => {
    if (!item) return;
    const group = item.modifierGroups.find((g) => g.id === groupId);
    const option = group?.options.find((o) => o.id === optionId);
    if (!group || !option) return;

    setSelections((prev) => {
      const isSelected = prev.some(
        (s) => s.optionId === optionId && (s.cover ?? null) === cover
      );
      const withoutGroup = single
        ? prev.filter((s) => !(s.groupId === groupId && (s.cover ?? null) === cover))
        : prev.filter((s) => !(s.optionId === optionId && (s.cover ?? null) === cover));

      if (isSelected && !single) return withoutGroup;
      if (isSelected && single) return withoutGroup;
      return [
        ...withoutGroup,
        {
          groupId,
          optionId,
          groupName: group.name,
          optionName: option.name,
          priceDelta: option.priceDelta,
          cover,
        },
      ];
    });
  };

  const missingRequired = useMemo(() => {
    if (!item) return [];
    const gaps: string[] = [];
    for (const group of item.modifierGroups) {
      if (group.minSelect < 1 || group.options.length === 0) continue;
      for (const cover of covers) {
        const count = selections.filter(
          (s) => s.groupId === group.id && (s.cover ?? null) === cover
        ).length;
        if (count < group.minSelect) {
          gaps.push(cover ? `${group.name} for guest ${cover}` : group.name);
        }
      }
    }
    return gaps;
  }, [item, selections, covers]);

  if (!item) return null;

  const canAdd = missingRequired.length === 0 && (unitPrice > 0 || item.priced);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div>
          <p className="eyebrow">{item.categoryName}</p>
          <h2 className="item-sheet__name">{item.name}</h2>
        </div>
      }
      footer={
        <div className="row row--between">
          <div>
            <p className="eyebrow">Total</p>
            <p className="price item-sheet__total">{money(lineTotal)}</p>
          </div>
          <button
            className="btn btn--primary"
            disabled={!canAdd}
            onClick={() => {
              onAdd({
                item,
                variantId,
                variantLabel: variant?.label ?? null,
                qty,
                note: note.trim(),
                allergyNote: allergyNote.trim(),
                modifiers: selections,
                unitPrice,
              });
              onClose();
            }}
          >
            {editing ? 'Update' : 'Add to order'}
          </button>
        </div>
      }
    >
      {item.description && <p className="item-sheet__desc">{item.description}</p>}

      {(item.dietary.length > 0 || item.allergens.length > 0) && (
        <div className="row row--wrap item-sheet__tags">
          {item.dietary.map((d) => (
            <span key={d} className="tag tag--green">{d}</span>
          ))}
          {item.allergens.map((a) => (
            <span key={a} className="tag">contains {a}</span>
          ))}
        </div>
      )}

      {item.variants.length > 0 && (
        <div className="field">
          <span className="field__label">Choose a serving</span>
          <div className="chip-set">
            {item.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`chip${variantId === v.id ? ' is-on' : ''}`}
                disabled={!v.available || v.price === null}
                onClick={() => setVariantId(v.id)}
              >
                <span>{v.label}</span>
                <span className="chip__price">{money(v.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isSet && (
        <div className="field">
          <span className="field__label">How many guests</span>
          <Stepper value={qty} onChange={setQty} min={1} max={16} label="Guests" />
          <p className="field__hint">This menu is priced per guest. Each guest chooses their own courses.</p>
        </div>
      )}

      {covers.map((cover) => {
        const groups = item.modifierGroups.filter((g) => g.options.length > 0);
        if (!groups.length) return null;
        return (
          <section key={cover ?? 'single'} className={isSet ? 'cover-card' : ''}>
            {isSet && <p className="eyebrow cover-card__title">Guest {cover}</p>}
            {groups.map((group) => {
              const single = group.maxSelect <= 1;
              return (
                <div className="field" key={`${group.id}-${cover}`}>
                  <span className="field__label">
                    {group.name}
                    {group.minSelect > 0 && <em className="field__required"> · required</em>}
                  </span>
                  <div className="chip-set">
                    {group.options.map((option) => {
                      const on = selections.some(
                        (s) => s.optionId === option.id && (s.cover ?? null) === cover
                      );
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`chip${on ? ' is-on' : ''}`}
                          onClick={() => choose(group.id, option.id, cover, single)}
                        >
                          <span>{option.name}</span>
                          {option.priceDelta !== 0 && (
                            <span className="chip__price">+{money(option.priceDelta)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {!isSet && (
        <div className="field">
          <span className="field__label">Quantity</span>
          <Stepper value={qty} onChange={setQty} />
        </div>
      )}

      <label className="field">
        <span className="field__label">Anything we should know</span>
        <textarea
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="No onions, sauce on the side, cooked a little longer…"
        />
      </label>

      <label className="field field--allergy">
        <span className="field__label field__label--allergy">Allergies and intolerances</span>
        <textarea
          className="textarea"
          value={allergyNote}
          onChange={(e) => setAllergyNote(e.target.value)}
          placeholder="Tell us and the kitchen will be told directly."
        />
        <p className="field__hint">
          Anything written here is flagged in red to your waiter and to the kitchen.
        </p>
      </label>

      {missingRequired.length > 0 && (
        <p className="item-sheet__gap">Still to choose: {missingRequired.join(', ')}.</p>
      )}
    </Sheet>
  );
}
