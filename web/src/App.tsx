import { Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './routes/Landing';
import { GuestApp } from './routes/guest/GuestApp';
import { StaffLogin } from './routes/staff/StaffLogin';
import { WaiterApp } from './routes/waiter/WaiterApp';
import { StationApp } from './routes/display/StationApp';
import { AdminApp } from './routes/admin/AdminApp';
import { AllergenSignOff } from './routes/allergens/AllergenSignOff';
import { RequireRole } from './routes/staff/RequireRole';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* Scanned from the card on the table. */}
      <Route path="/t/:token" element={<GuestApp />} />

      <Route path="/staff" element={<StaffLogin />} />

      <Route
        path="/waiter/*"
        element={
          <RequireRole roles={['waiter', 'manager', 'admin']}>
            <WaiterApp />
          </RequireRole>
        }
      />

      <Route
        path="/kitchen"
        element={
          <RequireRole roles={['kitchen', 'manager', 'admin']}>
            <StationApp station="kitchen" />
          </RequireRole>
        }
      />
      <Route
        path="/bar"
        element={
          <RequireRole roles={['bar', 'manager', 'admin']}>
            <StationApp station="bar" />
          </RequireRole>
        }
      />

      {/* The chef's screen. Managers can reach it too, but the kitchen is who
          signs an allergen list off, so the kitchen role is the point of it. */}
      <Route
        path="/allergens"
        element={
          <RequireRole roles={['kitchen', 'manager', 'admin']}>
            <AllergenSignOff />
          </RequireRole>
        }
      />

      <Route
        path="/admin/*"
        element={
          <RequireRole roles={['manager', 'admin']} usePassword>
            <AdminApp />
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
