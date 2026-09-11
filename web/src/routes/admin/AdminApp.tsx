import { useEffect, useState } from 'react';
import { StaffHeader } from '../../components/StaffHeader';
import { get } from '../../lib/api';
import { money, pluralise } from '../../lib/format';
import { useSocketEvent } from '../../lib/socket';
import { FloorAdmin } from './FloorAdmin';
import { MenuAdmin } from './MenuAdmin';
import { ReportsAdmin } from './ReportsAdmin';
import { SettingsAdmin } from './SettingsAdmin';
import { StaffAdmin } from './StaffAdmin';

type Page = 'reports' | 'menu' | 'floor' | 'staff' | 'settings';

const PAGES: { key: Page; label: string }[] = [
  { key: 'reports', label: 'Reports' },
  { key: 'menu', label: 'Menu' },
  { key: 'floor', label: 'Floor & QR' },
  { key: 'staff', label: 'Staff' },
  { key: 'settings', label: 'Settings' },
];

/** The back office. Reachable only on the restaurant's own network. */
export function AdminApp() {
  const [page, setPage] = useState<Page>('reports');
  const [live, setLive] = useState<{ openChecks: number; takings: number } | null>(null);

  const refresh = () => {
    void get<{ openChecks: number }>('/api/health')
      .then((h) =>
        get<{ netSales: number }>('/api/reports/summary').then((s) =>
          setLive({ openChecks: h.openChecks, takings: s.netSales })
        )
      )
      .catch(() => setLive(null));
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 60000);
    return () => window.clearInterval(id);
  }, []);

  useSocketEvent('order:new', refresh);
  useSocketEvent('check:updated', refresh);

  return (
    <div className="staff admin">
      <StaffHeader
        title="Back office"
        subtitle={
          live
            ? `${pluralise(live.openChecks, 'table')} open · ${money(live.takings)} today`
            : 'The Lord Erroll'
        }
      >
        <nav className="staff-tabs">
          {PAGES.map((p) => (
            <button key={p.key} className={`staff-tab${page === p.key ? ' is-on' : ''}`} onClick={() => setPage(p.key)}>
              {p.label}
            </button>
          ))}
        </nav>
      </StaffHeader>

      <main className="staff__body admin__body">
        {page === 'reports' && <ReportsAdmin />}
        {page === 'menu' && <MenuAdmin />}
        {page === 'floor' && <FloorAdmin />}
        {page === 'staff' && <StaffAdmin />}
        {page === 'settings' && <SettingsAdmin />}
      </main>
    </div>
  );
}
