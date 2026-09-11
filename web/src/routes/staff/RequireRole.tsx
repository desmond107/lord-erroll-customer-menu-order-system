import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Crest } from '../../components/Crest';
import { useStaff } from '../../lib/staff';
import type { Role } from '../../lib/types';

/** Gate for every staff screen. Managers use a password; the floor uses a PIN. */
export function RequireRole({
  roles,
  usePassword = false,
  children,
}: {
  roles: Role[];
  usePassword?: boolean;
  children: ReactNode;
}) {
  const { staff, loading } = useStaff();
  const location = useLocation();

  if (loading) {
    return (
      <div className="guest-loading">
        <Crest size={64} />
        <p className="tagline">One moment</p>
      </div>
    );
  }

  if (!staff) {
    const to = `/staff?to=${encodeURIComponent(location.pathname)}${usePassword ? '&mode=password' : ''}`;
    return <Navigate to={to} replace />;
  }

  if (!roles.includes(staff.role)) {
    return (
      <div className="guest-error">
        <Crest size={72} />
        <p className="italic">This screen is not part of your role.</p>
        <a className="btn" href="/staff">Sign in as someone else</a>
      </div>
    );
  }

  return <>{children}</>;
}
