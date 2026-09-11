import { useCallback, useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { get, patch, post } from '../../lib/api';
import type { Role } from '../../lib/types';

interface StaffRow {
  id: number;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  sections: { id: number; code: string; name: string }[];
}

interface SectionRow {
  id: number;
  code: string;
  name: string;
}

const ROLES: { key: Role; label: string; note: string }[] = [
  { key: 'waiter', label: 'Waiter', note: 'PIN. Sees only their own sections.' },
  { key: 'kitchen', label: 'Kitchen pass', note: 'PIN. Food board and 86 list.' },
  { key: 'bar', label: 'Bar pass', note: 'PIN. Drinks board and 86 list.' },
  { key: 'manager', label: 'Manager', note: 'Email and password. Full back office.' },
  { key: 'admin', label: 'Administrator', note: 'Email and password. Everything.' },
];

/** Staff accounts and section assignment. PINs are shown once, at creation. */
export function StaffAdmin() {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'waiter' as Role, email: '', password: '', sections: [] as number[] });

  const load = useCallback(async () => {
    try {
      const [people, floor] = await Promise.all([
        get<StaffRow[]>('/api/admin/staff'),
        get<SectionRow[]>('/api/admin/floor'),
      ]);
      setStaff(people);
      setSections(floor.map((s) => ({ id: s.id, code: s.code, name: s.name })));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load staff.', 'warn');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const usesPassword = form.role === 'manager' || form.role === 'admin';

  const create = async () => {
    try {
      const result = await post<{ id: number; pin: string | null }>('/api/admin/staff', {
        name: form.name,
        role: form.role,
        email: usesPassword ? form.email : undefined,
        password: usesPassword ? form.password : undefined,
        sections: form.sections,
      });
      if (result.pin) {
        window.alert(`${form.name}'s PIN is ${result.pin}\n\nWrite it down now — it is not shown again.`);
      }
      toast(`${form.name} added.`);
      setForm({ name: '', role: 'waiter', email: '', password: '', sections: [] });
      setCreating(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create that account.', 'warn');
    }
  };

  const resetPin = async (person: StaffRow) => {
    try {
      const { pin } = await post<{ pin: string }>(`/api/admin/staff/${person.id}/reset-pin`);
      window.alert(`${person.name}'s new PIN is ${pin}\n\nIt is not shown again.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reset that PIN.', 'warn');
    }
  };

  const setSectionsFor = async (person: StaffRow, sectionId: number) => {
    const next = person.sections.some((s) => s.id === sectionId)
      ? person.sections.filter((s) => s.id !== sectionId).map((s) => s.id)
      : [...person.sections.map((s) => s.id), sectionId];
    try {
      await patch(`/api/admin/staff/${person.id}`, { sections: next });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not change sections.', 'warn');
    }
  };

  return (
    <div className="admin-page stack">
      <div className="row row--between">
        <div>
          <p className="eyebrow">Team</p>
          <h2>{staff.filter((s) => s.active).length} active accounts</h2>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>Add someone</button>
      </div>

      {ROLES.map((role) => {
        const people = staff.filter((s) => s.role === role.key);
        if (!people.length) return null;
        return (
          <section key={role.key} className="panel">
            <header className="panel__head">
              <div>
                <h3>{role.label}</h3>
                <p className="muted">{role.note}</p>
              </div>
            </header>
            <div className="panel__body">
              <ul className="staff-list">
                {people.map((person) => (
                  <li key={person.id} className={`staff-row${person.active ? '' : ' is-off'}`}>
                    <span className="grow">
                      <span className="staff-row__name">{person.name}</span>
                      {person.email && <span className="muted"> · {person.email}</span>}
                      {role.key === 'waiter' && (
                        <span className="chip-set staff-row__sections">
                          {sections.map((section) => (
                            <button
                              key={section.id}
                              className={`chip${person.sections.some((s) => s.id === section.id) ? ' is-on' : ''}`}
                              onClick={() => void setSectionsFor(person, section.id)}
                            >
                              {section.name}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="row" style={{ gap: '0.3rem' }}>
                      {!person.email && (
                        <button className="btn btn--ghost btn--sm" onClick={() => void resetPin(person)}>
                          New PIN
                        </button>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() =>
                          void patch(`/api/admin/staff/${person.id}`, { active: !person.active })
                            .then(load)
                            .catch((e: Error) => toast(e.message, 'warn'))
                        }
                      >
                        {person.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={<h2 className="item-sheet__name">A new account</h2>}
        footer={
          <button className="btn btn--primary btn--block" disabled={!form.name} onClick={() => void create()}>
            Create
          </button>
        }
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>

        <div className="field">
          <span className="field__label">Role</span>
          <div className="chip-set">
            {ROLES.map((r) => (
              <button
                key={r.key}
                className={`chip${form.role === r.key ? ' is-on' : ''}`}
                onClick={() => setForm({ ...form, role: r.key })}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="field__hint">{ROLES.find((r) => r.key === form.role)?.note}</p>
        </div>

        {usesPassword ? (
          <>
            <label className="field">
              <span className="field__label">Email</span>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Password</span>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
          </>
        ) : (
          <p className="field__hint">A four-digit PIN is generated and shown once when you create the account.</p>
        )}

        {form.role === 'waiter' && (
          <div className="field">
            <span className="field__label">Sections</span>
            <div className="chip-set">
              {sections.map((section) => (
                <button
                  key={section.id}
                  className={`chip${form.sections.includes(section.id) ? ' is-on' : ''}`}
                  onClick={() =>
                    setForm({
                      ...form,
                      sections: form.sections.includes(section.id)
                        ? form.sections.filter((id) => id !== section.id)
                        : [...form.sections, section.id],
                    })
                  }
                >
                  {section.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
