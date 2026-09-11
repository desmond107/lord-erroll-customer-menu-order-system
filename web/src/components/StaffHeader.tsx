import { useNavigate } from 'react-router-dom';
import { Crest } from './Crest';
import { useStaff } from '../lib/staff';
import { useConnection } from '../lib/socket';

/** Common bar across every staff screen: who is signed in, and is the LAN up. */
export function StaffHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const { staff, signOut } = useStaff();
  const connected = useConnection();
  const navigate = useNavigate();

  return (
    <header className="staff-head">
      <Crest size={34} />
      <div className="staff-head__title">
        <h1>{title}</h1>
        {subtitle && <p className="staff-head__sub">{subtitle}</p>}
      </div>

      <div className="staff-head__tools">{children}</div>

      <div className="staff-head__who">
        <span className={`conn${connected ? ' conn--up' : ' conn--down'}`} title={connected ? 'Connected' : 'Reconnecting'}>
          <span className="conn__dot" />
          {connected ? 'On the network' : 'Reconnecting'}
        </span>
        <span className="staff-head__name">{staff?.name}</span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => void signOut().then(() => navigate('/staff'))}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
