import { Link } from 'react-router-dom';
import { Crest, Wordmark } from '../components/Crest';

/**
 * Reached by staff typing the server's address. Guests never see this — their
 * table card takes them straight to their own table.
 */
export function Landing() {
  return (
    <div className="landing">
      <Crest size={104} />
      <Wordmark />
      <hr className="rule" />
      <p className="landing__lede">
        Guests reach their menu by scanning the card on their table.
        <br />
        Staff, please continue below.
      </p>

      <div className="landing__doors">
        <Link className="landing__door" to="/staff">
          <span className="eyebrow">Floor</span>
          <span className="landing__door-name">Waiter</span>
          <span className="landing__door-note">Sections, tables, orders and bills</span>
        </Link>
        <Link className="landing__door" to="/staff?to=/kitchen">
          <span className="eyebrow">Pass</span>
          <span className="landing__door-name">Kitchen</span>
          <span className="landing__door-note">Food tickets in fire order</span>
        </Link>
        <Link className="landing__door" to="/staff?to=/bar">
          <span className="eyebrow">Pass</span>
          <span className="landing__door-name">Bar</span>
          <span className="landing__door-note">Drinks, poured first</span>
        </Link>
        <Link className="landing__door" to="/admin">
          <span className="eyebrow">Back office</span>
          <span className="landing__door-name">Management</span>
          <span className="landing__door-note">Menu, floor, staff and reports</span>
        </Link>
      </div>

      <hr className="rule" />
      <p className="tagline">89 Ruaka Road, Nairobi</p>
    </div>
  );
}
