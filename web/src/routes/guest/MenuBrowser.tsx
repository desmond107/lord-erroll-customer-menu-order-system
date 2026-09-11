import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../../lib/format';
import type { MenuCategory, MenuItem } from '../../lib/types';

/**
 * The menu, laid out the way the printed one reads: small-caps gold category
 * headings, dish names in serif, descriptions in italic, price on the right.
 */
export function MenuBrowser({
  categories,
  onPick,
  basketCounts,
}: {
  categories: MenuCategory[];
  onPick: (item: MenuItem) => void;
  basketCounts: Record<number, number>;
}) {
  const [active, setActive] = useState(categories[0]?.code ?? '');
  const [query, setQuery] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.description ?? '').toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, query]);

  // Highlight the category the guest is actually reading.
  useEffect(() => {
    if (query) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.getAttribute('data-code') ?? '');
      },
      { rootMargin: '-38% 0px -55% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [filtered, query]);

  // Keep the active chip in view without yanking the page around.
  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>('.menu-nav__chip.is-on');
    chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <div className="menu">
      <div className="menu-nav" ref={navRef}>
        <div className="menu-nav__scroll">
          {categories.map((c) => (
            <button
              key={c.code}
              className={`menu-nav__chip${active === c.code && !query ? ' is-on' : ''}`}
              onClick={() => {
                setQuery('');
                sectionRefs.current[c.code]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-search">
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu"
          aria-label="Search the menu"
        />
      </div>

      {filtered.length === 0 && (
        <p className="empty">Nothing on the menu matches that. Your waiter will gladly help.</p>
      )}

      {filtered.map((category) => (
        <section
          key={category.code}
          data-code={category.code}
          ref={(el) => { sectionRefs.current[category.code] = el; }}
          className="menu-section"
        >
          <header className="menu-section__head">
            <hr className="rule rule--tight" />
            <h2 className="menu-section__title">{category.name}</h2>
            {category.note && <p className="section-note">{category.note}</p>}
          </header>

          <ul className="dish-list">
            {category.items.map((item) => (
              <DishRow
                key={item.id}
                item={item}
                count={basketCounts[item.id] ?? 0}
                onPick={() => onPick(item)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DishRow({ item, count, onPick }: { item: MenuItem; count: number; onPick: () => void }) {
  const priceLabel = item.variants.length
    ? priceRange(item)
    : money(item.price);

  return (
    <li>
      <button
        className={`dish${item.available ? '' : ' dish--off'}`}
        onClick={onPick}
        disabled={!item.available}
      >
        <span className="dish__main">
          <span className="dish__name">
            {item.name}
            {count > 0 && <span className="dish__count" aria-label={`${count} in your order`}>{count}</span>}
          </span>
          {item.description && <span className="dish__desc">{item.description}</span>}
          <span className="dish__meta">
            {item.dietary.map((d) => (
              <span key={d} className="tag tag--green">{d}</span>
            ))}
            {item.isSetMenu && <span className="tag tag--gold">per guest</span>}
            {!item.available && (
              <span className="tag tag--off">
                {item.unavailableReason ? item.unavailableReason : 'finished for this evening'}
              </span>
            )}
          </span>
        </span>
        <span className="dish__price price">{priceLabel}</span>
      </button>
    </li>
  );
}

function priceRange(item: MenuItem) {
  const prices = item.variants.map((v) => v.price).filter((p): p is number => p !== null);
  if (!prices.length) return '—';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low) : `${money(low)} – ${money(high)}`;
}
