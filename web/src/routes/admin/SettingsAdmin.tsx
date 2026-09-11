import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { get, put } from '../../lib/api';

interface Settings {
  restaurant: { name?: string; tagline?: string; address?: string; email?: string };
  billing: { serviceChargePercent?: number; vatPercent?: number; pricesIncludeVat?: boolean; usdRate?: number };
  service: {
    ageAmberMinutes?: number;
    ageRedMinutes?: number;
    hideUnpricedFromGuests?: boolean;
    holdMainsByDefault?: boolean;
  };
}

/** House rules: tax, pacing, and how strict the guest menu is about pricing. */
export function SettingsAdmin() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await get<Settings>('/api/admin/settings'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load settings.', 'warn');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: keyof Settings) => {
    if (!settings) return;
    setSaving(true);
    try {
      await put(`/api/admin/settings/${key}`, settings[key]);
      toast('Saved. Every device has it already.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not save.', 'warn');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <p className="empty">Loading…</p>;

  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) =>
    setSettings({ ...settings, [key]: { ...settings[key], ...patch } });

  return (
    <div className="admin-page stack">
      <section className="panel">
        <header className="panel__head"><h3>The restaurant</h3></header>
        <div className="panel__body">
          <label className="field">
            <span className="field__label">Name</span>
            <input className="input" value={settings.restaurant.name ?? ''} onChange={(e) => set('restaurant', { name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Address</span>
            <input className="input" value={settings.restaurant.address ?? ''} onChange={(e) => set('restaurant', { address: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Reservations email</span>
            <input className="input" value={settings.restaurant.email ?? ''} onChange={(e) => set('restaurant', { email: e.target.value })} />
          </label>
          <button className="btn btn--primary" disabled={saving} onClick={() => void save('restaurant')}>Save</button>
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h3>Bills</h3>
            <p className="muted">Kenyan VAT and service charge, applied to every check.</p>
          </div>
        </header>
        <div className="panel__body">
          <div className="row row--wrap" style={{ gap: '1rem' }}>
            <label className="field grow">
              <span className="field__label">Service charge %</span>
              <input
                className="input"
                type="number"
                value={settings.billing.serviceChargePercent ?? 10}
                onChange={(e) => set('billing', { serviceChargePercent: Number(e.target.value) })}
              />
            </label>
            <label className="field grow">
              <span className="field__label">VAT %</span>
              <input
                className="input"
                type="number"
                value={settings.billing.vatPercent ?? 16}
                onChange={(e) => set('billing', { vatPercent: Number(e.target.value) })}
              />
            </label>
            <label className="field grow">
              <span className="field__label">KES per USD</span>
              <input
                className="input"
                type="number"
                value={settings.billing.usdRate ?? 129}
                onChange={(e) => set('billing', { usdRate: Number(e.target.value) })}
              />
              <p className="field__hint">Only for the indicative USD line on set menus.</p>
            </label>
          </div>
          <Toggle
            label="Menu prices already include VAT"
            note="The usual arrangement in Kenya. VAT is then shown on the bill as included, not added."
            checked={settings.billing.pricesIncludeVat ?? true}
            onChange={(v) => set('billing', { pricesIncludeVat: v })}
          />
          <button className="btn btn--primary" disabled={saving} onClick={() => void save('billing')}>Save</button>
        </div>
      </section>

      <section className="panel">
        <header className="panel__head">
          <div>
            <h3>Service</h3>
            <p className="muted">Pacing, and how careful the guest menu is.</p>
          </div>
        </header>
        <div className="panel__body">
          <div className="row row--wrap" style={{ gap: '1rem' }}>
            <label className="field grow">
              <span className="field__label">Amber after (minutes)</span>
              <input
                className="input"
                type="number"
                value={settings.service.ageAmberMinutes ?? 10}
                onChange={(e) => set('service', { ageAmberMinutes: Number(e.target.value) })}
              />
            </label>
            <label className="field grow">
              <span className="field__label">Red after (minutes)</span>
              <input
                className="input"
                type="number"
                value={settings.service.ageRedMinutes ?? 20}
                onChange={(e) => set('service', { ageRedMinutes: Number(e.target.value) })}
              />
            </label>
          </div>
          <Toggle
            label="Hide unpriced items from guests"
            note="Strongly recommended. A guest cannot order something the system cannot bill."
            checked={settings.service.hideUnpricedFromGuests ?? true}
            onChange={(v) => set('service', { hideUnpricedFromGuests: v })}
          />
          <Toggle
            label="Hold mains until the waiter fires them"
            note="Starters and drinks always go straight through. Mains wait so courses do not collide."
            checked={settings.service.holdMainsByDefault ?? true}
            onChange={(v) => set('service', { holdMainsByDefault: v })}
          />
          <button className="btn btn--primary" disabled={saving} onClick={() => void save('service')}>Save</button>
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="toggle__label">{label}</span>
        {note && <span className="toggle__note">{note}</span>}
      </span>
    </label>
  );
}
