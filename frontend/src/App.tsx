// ============================================================
// App — React Router setup + navigation layout
// ============================================================

import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Watchlist } from './pages/Watchlist';
import { WatchlistDetail } from './pages/WatchlistDetail';
import { Sectors } from './pages/Sectors';

const navItems = [
  { to: '/', label: '總覽', end: true },
  { to: '/watchlist', label: '追蹤清單', end: false },
  { to: '/sectors', label: '族群監測', end: false },
];

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top navigation */}
        <nav style={{
          background: '#111827',
          borderBottom: '1px solid #1f2937',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          <a href="/" style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', textDecoration: 'none', marginRight: 32 }}>
            📈 動能追蹤
          </a>

          <div style={{ display: 'flex', gap: 4 }}>
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                style={({ isActive }) => ({
                  padding: '6px 12px',
                  borderRadius: 4,
                  fontSize: 13,
                  textDecoration: 'none',
                  color: isActive ? '#e2e8f0' : '#718096',
                  background: isActive ? '#2d3748' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, padding: '24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/watchlist/:id" element={<WatchlistDetail />} />
            <Route path="/sectors" element={<Sectors />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
