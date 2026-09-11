import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Crest, Wordmark } from '../../components/Crest';
import { useToast } from '../../components/Toast';
import { get } from '../../lib/api';
import { useStaff } from '../../lib/staff';

interface RosterEntry {
  id: number;
  name: string;
  role: string;
  sections: string[];
}

const HOME: Record<string, string> = {
  waiter: '/waiter',
  kitchen: '/kitchen',
  bar: '/bar',
  manager: '/admin',
  admin: '/admin',
};

/**
 * Two ways in, on one screen: the floor picks a name and taps a PIN, managers
 * use an email and password. A PIN pad beats a keyboard during service.
 */
export function StaffLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { signInWithPin, signInWithPassword, staff } = useStaff();

  const destination = params.get('to');
  const [mode, setMode] = useState<'pin' | 'password'>(
    params.get('mode') === 'password' ? 'password' : 'pin'
  );
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void get<RosterEntry[]>('/api/auth/staff').then(setRoster).catch(() => setRoster([]));
  }, []);

  useEffect(() => {
    if (staff) navigate(destination || HOME[staff.role] || '/', { replace: true });
  }, [staff, destination, navigate]);

  const grouped = useMemo(() => {
    const order = ['waiter', 'kitchen', 'bar'];
    return order
      .map((role) => ({ role, people: roster.filter((r) => r.role === role) }))
      .filter((g) => g.people.length > 0);
  }, [roster]);

  // Digits append through the updater, so a quick four-tap on a busy pass
  // cannot read a stale value and silently drop keys.
  const tapDigit = (digit: string) => setPin((prev) => (prev.length >= 4 ? prev : prev + digit));

  // Submitting is driven by the PIN reaching four digits rather than by the
  // tap itself, which keeps the two concerns from racing each other.
  useEffect(() => {
    if (pin.length !== 4 || !selected || busy) return;
    let cancelled = false;
    setBusy(true);
    signInWithPin(selected.id, pin)
      .then((me) => {
        if (!cancelled) navigate(destination || HOME[me.role] || '/', { replace: true });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        toast(err.message || 'That PIN was not recognised.', 'warn');
        setPin('');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-running on `busy` would re-fire the moment the request settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected]);

  return (
    <div className="signin">
      <Crest size={78} />
      <Wordmark />
      <hr className="rule" />

      <div className="signin__modes">
        <button className={`signin__mode${mode === 'pin' ? ' is-on' : ''}`} onClick={() => setMode('pin')}>
          Floor &amp; pass
        </button>
        <button className={`signin__mode${mode === 'password' ? ' is-on' : ''}`} onClick={() => setMode('password')}>
          Management
        </button>
      </div>

      {mode === 'pin' ? (
        !selected ? (
          <div className="signin__roster">
            {grouped.map((group) => (
              <section key={group.role}>
                <p className="eyebrow signin__group">
                  {group.role === 'waiter' ? 'Waiters' : `${group.role} pass`}
                </p>
                <div className="signin__names">
                  {group.people.map((person) => (
                    <button key={person.id} className="signin__name" onClick={() => setSelected(person)}>
                      <span>{person.name}</span>
                      {person.sections.length > 0 && (
                        <span className="signin__sections">{person.sections.join(' · ')}</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {grouped.length === 0 && <p className="empty">No staff accounts yet. A manager can create them.</p>}
          </div>
        ) : (
          <div className="signin__pin">
            <p className="eyebrow">{selected.name}</p>
            <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`pin-dot${i < pin.length ? ' is-on' : ''}`} />
              ))}
            </div>
            <div className="pin-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} className="pin-key" onClick={() => tapDigit(d)} disabled={busy}>{d}</button>
              ))}
              <button className="pin-key pin-key--soft" onClick={() => { setSelected(null); setPin(''); }}>
                Back
              </button>
              <button className="pin-key" onClick={() => tapDigit('0')} disabled={busy}>0</button>
              <button className="pin-key pin-key--soft" onClick={() => setPin((p) => p.slice(0, -1))}>
                Undo
              </button>
            </div>
          </div>
        )
      ) : (
        <form
          className="signin__form"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            signInWithPassword(email, password)
              .then((me) => navigate(destination || HOME[me.role] || '/', { replace: true }))
              .catch((err: Error) => toast(err.message, 'warn'))
              .finally(() => setBusy(false));
          }}
        >
          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  );
}
