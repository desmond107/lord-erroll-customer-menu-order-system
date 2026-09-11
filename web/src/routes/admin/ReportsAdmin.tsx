import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../components/Toast';
import { get } from '../../lib/api';
import { money } from '../../lib/format';

interface Summary {
  label: string;
  checks: number;
  covers: number;
  netSales: number;
  compedValue: number;
  averageCheck: number;
  averageCover: number;
  voids: { count: number; value: number };
  payments: { method: string; count: number; amount: number }[];
  bySection: { code: string; name: string; checks: number; sales: number }[];
  openChecks: number;
}

interface Service {
  acknowledgement: { averageSeconds: number | null; orders: number; withinTargetPercent: number | null };
  preparation: { station: string; averageSeconds: number; items: number }[];
  tableTurn: { averageMinutes: number | null; checks: number };
  byHour: { hour: string; orders: number; sales: number }[];
}

interface ItemRow { name: string; variant: string | null; category: string | null; qty: number; sales: number }
interface StaffRow { name: string; ordersTaken: number; sales: number; avgAckSeconds: number | null }

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** What management asks for: the night's take, the pace, and the exceptions. */
export function ReportsAdmin() {
  const toast = useToast();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);

  const load = useCallback(async () => {
    const q = `from=${from}&to=${to}`;
    try {
      const [s, sv, it, st] = await Promise.all([
        get<Summary>(`/api/reports/summary?${q}`),
        get<Service>(`/api/reports/service?${q}`),
        get<ItemRow[]>(`/api/reports/items?${q}`),
        get<StaffRow[]>(`/api/reports/staff?${q}`),
      ]);
      setSummary(s);
      setService(sv);
      setItems(it);
      setStaff(st);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load reports.', 'warn');
    }
  }, [from, to, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const seconds = (value: number | null) =>
    value === null ? '—' : value < 90 ? `${value}s` : `${Math.round(value / 60)}m`;

  return (
    <div className="admin-page stack">
      <div className="panel">
        <div className="panel__body row row--wrap row--between">
          <div className="row row--wrap" style={{ gap: '0.6rem' }}>
            <label className="report-date">
              <span className="field__label">From</span>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="report-date">
              <span className="field__label">To</span>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <div className="chip-set report-presets">
              <button className="chip" onClick={() => { setFrom(today()); setTo(today()); }}>Today</button>
              <button className="chip" onClick={() => { setFrom(daysAgo(6)); setTo(today()); }}>Last 7 days</button>
              <button className="chip" onClick={() => { setFrom(daysAgo(29)); setTo(today()); }}>Last 30 days</button>
            </div>
          </div>
          <a className="btn btn--sm" href={`/api/reports/export.csv?from=${from}&to=${to}`}>
            Export CSV
          </a>
        </div>
      </div>

      {summary && (
        <div className="stat-row">
          <Stat label="Net sales" value={money(summary.netSales)} />
          <Stat label="Checks" value={String(summary.checks)} />
          <Stat label="Covers" value={String(summary.covers)} />
          <Stat label="Average check" value={money(summary.averageCheck)} />
          <Stat label="Average cover" value={money(summary.averageCover)} />
          <Stat label="Still open" value={String(summary.openChecks)} />
        </div>
      )}

      {service && (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Service pace</h3>
              <p className="muted">
                The target is a guest order acknowledged inside a minute, and drinks at the bar
                inside two.
              </p>
            </div>
          </header>
          <div className="panel__body stat-row stat-row--flush">
            <Stat
              label="Order to acknowledged"
              value={seconds(service.acknowledgement.averageSeconds)}
              note={
                service.acknowledgement.withinTargetPercent === null
                  ? 'No guest orders yet'
                  : `${service.acknowledgement.withinTargetPercent}% inside a minute`
              }
            />
            {service.preparation.map((p) => (
              <Stat
                key={p.station}
                label={`${p.station === 'bar' ? 'Bar' : 'Kitchen'} fire to ready`}
                value={seconds(p.averageSeconds)}
                note={`${p.items} items`}
              />
            ))}
            <Stat
              label="Table turn"
              value={service.tableTurn.averageMinutes === null ? '—' : `${service.tableTurn.averageMinutes}m`}
              note={`${service.tableTurn.checks} closed checks`}
            />
          </div>

          {service.byHour.length > 0 && (
            <div className="panel__body">
              <p className="eyebrow">By hour</p>
              <div className="hours">
                {service.byHour.map((h) => {
                  const peak = Math.max(...service.byHour.map((x) => x.sales), 1);
                  return (
                    <div key={h.hour} className="hours__bar" title={`${h.orders} orders · ${money(h.sales)}`}>
                      <span className="hours__fill" style={{ height: `${Math.max(4, (h.sales / peak) * 100)}%` }} />
                      <span className="hours__label">{h.hour}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {summary && summary.bySection.length > 0 && (
        <section className="panel">
          <header className="panel__head"><h3>By section</h3></header>
          <div className="panel__body">
            <table className="table">
              <thead>
                <tr><th>Section</th><th className="num">Checks</th><th className="num">Sales</th></tr>
              </thead>
              <tbody>
                {summary.bySection.map((s) => (
                  <tr key={s.code}>
                    <td>{s.name}</td>
                    <td className="num">{s.checks}</td>
                    <td className="num price">{money(s.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {items.length > 0 && (
        <section className="panel">
          <header className="panel__head">
            <h3>Best sellers</h3>
            <span className="muted">{items.length} lines sold</span>
          </header>
          <div className="panel__body">
            <table className="table">
              <thead>
                <tr><th>Item</th><th>Category</th><th className="num">Sold</th><th className="num">Sales</th></tr>
              </thead>
              <tbody>
                {items.slice(0, 25).map((row, i) => (
                  <tr key={i}>
                    <td>{row.name}{row.variant ? ` · ${row.variant}` : ''}</td>
                    <td className="muted">{row.category ?? '—'}</td>
                    <td className="num">{row.qty}</td>
                    <td className="num price">{money(row.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {summary && (
        <section className="panel">
          <header className="panel__head"><h3>Settlement and exceptions</h3></header>
          <div className="panel__body">
            <table className="table">
              <thead><tr><th>Method</th><th className="num">Count</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {summary.payments.map((p) => (
                  <tr key={p.method}>
                    <td>{p.method}</td>
                    <td className="num">{p.count}</td>
                    <td className="num price">{money(p.amount)}</td>
                  </tr>
                ))}
                {summary.payments.length === 0 && (
                  <tr><td colSpan={3} className="muted">Nothing settled in this period.</td></tr>
                )}
              </tbody>
            </table>
            <div className="row row--wrap exceptions">
              <Stat label="Voided" value={money(summary.voids.value)} note={`${summary.voids.count} items`} />
              <Stat label="Comped" value={money(summary.compedValue)} />
            </div>
          </div>
        </section>
      )}

      {staff.length > 0 && (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Waiters</h3>
              <p className="muted">For staffing decisions, not league tables.</p>
            </div>
          </header>
          <div className="panel__body">
            <table className="table">
              <thead>
                <tr><th>Name</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">To acknowledge</th></tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="num">{s.ordersTaken}</td>
                    <td className="num price">{money(s.sales)}</td>
                    <td className="num">{seconds(s.avgAckSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <p className="eyebrow">{label}</p>
      <p className="stat__value">{value}</p>
      {note && <p className="muted stat__note">{note}</p>}
    </div>
  );
}
