import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Watchlist } from './pages/Watchlist';
import { WatchlistDetail } from './pages/WatchlistDetail';
import { Sectors } from './pages/Sectors';
import { api } from './api/client';

const navItems = [
  { to: '/',          label: '總覽',    end: true  },
  { to: '/watchlist', label: '追蹤清單', end: false },
  { to: '/sectors',   label: '族群監測', end: false },
];

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  async function handleScan() {
    setScanning(true);
    setScanMsg('');
    try {
      const result = await api.scan();
      if (result.status === 'ok') {
        setScanMsg(`✓ 已更新 ${result.with_price}/${result.total} 支`);
      } else {
        setScanMsg('更新失敗');
      }
    } catch {
      setScanMsg('連線失敗');
    } finally {
      setScanning(false);
      setTimeout(() => setScanMsg(''), 4000);
    }
  }

  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        {/* Top navigation — Stripe style */}
        <nav style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          height: 56,
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 1px 0 var(--border)',
        }}>
          {/* Logo */}
          <a href="/" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            textDecoration: 'none', marginRight: 36,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#fff', fontWeight: 700,
            }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              動能追蹤
            </span>
          </a>

          {/* Nav links */}
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {navItems.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                color: isActive ? 'var(--accent)' : 'var(--text-2)',
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                transition: 'all .15s',
              })}>
                {label}
              </NavLink>
            ))}
          </div>

          {/* Right side: scan button + hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {scanMsg && (
              <span style={{ fontSize: 12, color: scanning ? 'var(--text-3)' : 'var(--green)', fontWeight: 500 }}>
                {scanMsg}
              </span>
            )}
            <button
              onClick={handleScan}
              disabled={scanning}
              title="手動更新所有股票現價"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: scanning ? 'var(--surface-2)' : 'var(--surface)',
                color: scanning ? 'var(--text-3)' : 'var(--text-2)',
                fontSize: 12, fontWeight: 500, cursor: scanning ? 'not-allowed' : 'pointer',
                transition: 'all .15s',
              }}
            >
              <span style={{
                display: 'inline-block',
                animation: scanning ? 'spin 1s linear infinite' : 'none',
              }}>↻</span>
              {scanning ? '更新中...' : '更新股價'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>台股 09:00–13:30 自動掃描</span>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/watchlist"   element={<Watchlist />} />
            <Route path="/watchlist/:id" element={<WatchlistDetail />} />
            <Route path="/sectors"     element={<Sectors />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid var(--border)', padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>動能股票追蹤系統 · Cloudflare Workers + D1</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>每 5 分鐘掃描 · LINE 即時通知</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
