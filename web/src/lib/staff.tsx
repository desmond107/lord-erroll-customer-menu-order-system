import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, staffToken } from './api';
import { resetSocket } from './socket';
import type { Staff } from './types';

interface StaffContextValue {
  staff: Staff | null;
  loading: boolean;
  signInWithPin: (staffId: number, pin: string) => Promise<Staff>;
  signInWithPassword: (email: string, password: string) => Promise<Staff>;
  signOut: () => Promise<void>;
}

const StaffContext = createContext<StaffContextValue>({
  staff: null,
  loading: true,
  signInWithPin: async () => { throw new Error('not ready'); },
  signInWithPassword: async () => { throw new Error('not ready'); },
  signOut: async () => {},
});

export const useStaff = () => useContext(StaffContext);

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await get<Staff>('/api/auth/me');
        if (!cancelled) setStaff(me);
      } catch {
        if (!cancelled) setStaff(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adopt = useCallback((result: { token: string; staff: Staff }) => {
    staffToken.set(result.token);
    // The socket carries the identity in its handshake, so it has to be
    // rebuilt on every sign-in or the new person joins the old rooms.
    resetSocket();
    setStaff(result.staff);
    return result.staff;
  }, []);

  const signInWithPin = useCallback(
    async (staffId: number, pin: string) =>
      adopt(await post<{ token: string; staff: Staff }>('/api/auth/pin', { staffId, pin })),
    [adopt]
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) =>
      adopt(await post<{ token: string; staff: Staff }>('/api/auth/password', { email, password })),
    [adopt]
  );

  const signOut = useCallback(async () => {
    try {
      await post('/api/auth/logout');
    } finally {
      staffToken.clear();
      resetSocket();
      setStaff(null);
    }
  }, []);

  const value = useMemo(
    () => ({ staff, loading, signInWithPin, signInWithPassword, signOut }),
    [staff, loading, signInWithPin, signInWithPassword, signOut]
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}
