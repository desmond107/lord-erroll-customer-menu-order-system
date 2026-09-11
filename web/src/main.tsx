import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { StaffProvider } from './lib/staff';
import './styles/theme.css';
import './styles/components.css';
import './styles/guest.css';
import './styles/staff.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <StaffProvider>
          <App />
        </StaffProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
