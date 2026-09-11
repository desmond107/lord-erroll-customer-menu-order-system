import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { get, patch, post } from '../../lib/api';

interface AdminTable {
  id: number;
  code: string;
  number: string;
  label: string | null;
  seats: number;
  active: boolean;
  qrToken: string;
}

interface AdminSection {
  id: number;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  tables: AdminTable[];
}

/**
 * Sections, tables and the QR cards that tie them together. The card is what
 * makes an order arrive already tagged with a table and a section.
 */
export function FloorAdmin() {
  const toast = useToast();
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [adding, setAdding] = useState<number | null>(null);
  const [newTable, setNewTable] = useState({ number: '', seats: 4, label: '' });

  const load = useCallback(async () => {
    try {
      setSections(await get<AdminSection[]>('/api/admin/floor'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the floor.', 'warn');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTable = async (sectionId: number) => {
    try {
      const created = await post<{ code: string }>('/api/admin/tables', {
        sectionId,
        number: newTable.number,
        seats: newTable.seats,
        label: newTable.label || null,
      });
      toast(`${created.code} added. Print its card before service.`);
      setNewTable({ number: '', seats: 4, label: '' });
      setAdding(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add that table.', 'warn');
    }
  };

  const rotate = async (table: AdminTable) => {
    if (!window.confirm(`Rotating the code for ${table.code} makes its printed card stop working. Reprint it afterwards.`)) return;
    try {
      await post(`/api/admin/tables/${table.id}/rotate-token`);
      toast(`${table.code} has a new code. Reprint its card.`);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rotate that code.', 'warn');
    }
  };

  return (
    <div className="admin-page stack">
      <div className="panel">
        <div className="panel__body row row--between row--wrap">
          <div>
            <p className="eyebrow">Table cards</p>
            <h3>Print the QR cards</h3>
            <p className="muted">
              Opens a print sheet, two cards to an A4 page, in the restaurant's own livery.
              Print at 100% scale.
            </p>
          </div>
          <div className="row row--wrap" style={{ gap: '0.5rem' }}>
            <a className="btn btn--primary" href="/api/qr/cards" target="_blank" rel="noreferrer">
              All tables
            </a>
            {sections.map((s) => (
              <a key={s.id} className="btn btn--sm" href={`/api/qr/cards?section=${s.code}`} target="_blank" rel="noreferrer">
                {s.name}
              </a>
            ))}
          </div>
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.id} className="panel">
          <header className="panel__head">
            <div>
              <h3>{section.name}</h3>
              <p className="muted">
                {section.code} · {section.tables.length} tables
                {section.description ? ` · ${section.description}` : ''}
              </p>
            </div>
            <button className="btn btn--sm" onClick={() => setAdding(adding === section.id ? null : section.id)}>
              Add a table
            </button>
          </header>

          <div className="panel__body">
            {adding === section.id && (
              <div className="row row--wrap add-table">
                <input
                  className="input"
                  placeholder="Number"
                  value={newTable.number}
                  onChange={(e) => setNewTable({ ...newTable, number: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  placeholder="Seats"
                  value={newTable.seats}
                  onChange={(e) => setNewTable({ ...newTable, seats: Number(e.target.value) })}
                />
                <input
                  className="input"
                  placeholder="Label (optional)"
                  value={newTable.label}
                  onChange={(e) => setNewTable({ ...newTable, label: e.target.value })}
                />
                <button className="btn btn--primary btn--sm" onClick={() => void addTable(section.id)}>
                  Add
                </button>
              </div>
            )}

            <ul className="table-admin">
              {section.tables.map((table) => (
                <li key={table.id} className={`table-admin__row${table.active ? '' : ' is-off'}`}>
                  <span className="table-admin__code">{table.code}</span>
                  <span className="grow muted">
                    {table.label ? `${table.label} · ` : ''}{table.seats} seats
                  </span>
                  <span className="row" style={{ gap: '0.3rem' }}>
                    <a className="btn btn--ghost btn--sm" href={`/api/qr/table/${table.code}.png`} target="_blank" rel="noreferrer">
                      QR
                    </a>
                    <a className="btn btn--ghost btn--sm" href={`/api/qr/cards?tables=${table.code}`} target="_blank" rel="noreferrer">
                      Card
                    </a>
                    <button className="btn btn--ghost btn--sm" onClick={() => void rotate(table)}>
                      New code
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        void patch(`/api/admin/tables/${table.id}`, { active: !table.active })
                          .then(load)
                          .catch((e: Error) => toast(e.message, 'warn'))
                      }
                    >
                      {table.active ? 'Retire' : 'Restore'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
