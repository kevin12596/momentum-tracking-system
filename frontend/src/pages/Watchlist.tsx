// ============================================================
// Watchlist — stock list management page (Stripe light theme)
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { WatchlistStock, SectorGroup } from '../api/types';
import { StockCard } from '../components/StockCard';
import { AddStockForm } from '../components/AddStockForm';

type FilterZone = 'ALL' | 'WATCH' | 'IDEAL' | 'DEEP' | 'NONE';
type SortKey = 'zone' | 'name' | 'pullback' | 'rs';

const ZONE_ORDER: Record<string, number> = { IDEAL: 0, DEEP: 1, WATCH: 2, NONE: 3 };
const ZONE_LABELS: Record<FilterZone, string> = {
  ALL: '全部', IDEAL: '理想帶', DEEP: '深度', WATCH: '觀察帶', NONE: '尚未到位',
};
// Active = solid colored; Inactive = white bg + colored text + colored border for easy scanning
const ZONE_ACTIVE: Record<FilterZone, { color: string; bg: string; border: string }> = {
  ALL:   { color: '#fff',           bg: 'var(--accent)',   border: 'var(--accent)' },
  IDEAL: { color: '#fff',           bg: 'var(--green)',    border: 'var(--green)' },
  DEEP:  { color: '#fff',           bg: 'var(--red)',      border: 'var(--red)' },
  WATCH: { color: '#fff',           bg: 'var(--amber)',    border: 'var(--amber)' },
  NONE:  { color: '#fff',           bg: 'var(--text-2)',   border: 'var(--text-2)' },
};
const ZONE_INACTIVE: Record<FilterZone, { color: string; bg: string; border: string }> = {
  ALL:   { color: 'var(--accent)',  bg: 'var(--surface)',  border: 'var(--accent)' },
  IDEAL: { color: 'var(--green)',   bg: 'var(--surface)',  border: '#6EE7B7' },
  DEEP:  { color: 'var(--red)',     bg: 'var(--surface)',  border: '#FCA5A5' },
  WATCH: { color: 'var(--amber)',   bg: 'var(--surface)',  border: '#FCD34D' },
  NONE:  { color: 'var(--text-2)',  bg: 'var(--surface)',  border: 'var(--border-2)' },
};

export function Watchlist() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [sectors, setSectors] = useState<SectorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterZone>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('zone');

  async function loadData() {
    const [s, sec] = await Promise.all([api.watchlist.list(), api.sectors.list()]);
    setStocks(s);
    setSectors(sec);
  }

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);

  function handleAdded() { setShowForm(false); loadData(); }

  const filtered = stocks
    .filter((s) => {
      if (filter !== 'ALL' && s.pullback_zone !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.symbol.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'zone') return (ZONE_ORDER[a.pullback_zone ?? 'NONE'] ?? 3) - (ZONE_ORDER[b.pullback_zone ?? 'NONE'] ?? 3);
      if (sort === 'rs') return (b.rs_score ?? 0) - (a.rs_score ?? 0);
      if (sort === 'pullback') return (b.pullback_from_high ?? 0) - (a.pullback_from_high ?? 0);
      return a.name.localeCompare(b.name, 'zh-TW');
    });

  const zoneCounts: Record<FilterZone, number> = { ALL: stocks.length, IDEAL: 0, DEEP: 0, WATCH: 0, NONE: 0 };
  stocks.forEach(s => { zoneCounts[s.pullback_zone ?? 'NONE']++; });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>
      載入中...
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>追蹤清單</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{stocks.length} 支股票 · 點擊任一股票查看詳情</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 600, boxShadow: '0 1px 4px rgba(99,91,255,.3)',
          }}
        >+ 新增股票</button>
      </div>

      {/* Add form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,31,54,.4)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 24, width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-md)',
          }}>
            <AddStockForm onAdded={handleAdded} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {/* Filter + Sort bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{
            padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, flex: '1 1 180px',
            outline: 'none',
          }}
          placeholder="搜尋名稱或代號..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Zone filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ALL', 'IDEAL', 'WATCH', 'DEEP', 'NONE'] as FilterZone[]).map((z) => {
            const active = filter === z;
            const conf = active ? ZONE_ACTIVE[z] : ZONE_INACTIVE[z];
            return (
              <button key={z} onClick={() => setFilter(z)} style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                fontWeight: active ? 700 : 500,
                background: conf.bg,
                color: conf.color,
                border: `1.5px solid ${conf.border}`,
                transition: 'all .12s',
              }}>
                {ZONE_LABELS[z]}{z !== 'ALL' && zoneCounts[z] > 0 && ` · ${zoneCounts[z]}`}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>排序</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{
              padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="zone">區間優先</option>
            <option value="rs">RS 強度 ↓</option>
            <option value="pullback">回測幅度 ↓</option>
            <option value="name">股票名稱</option>
          </select>
        </div>
      </div>

      {/* Stock grid */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)',
          border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          {stocks.length === 0
            ? <>清單為空。<a href="#" onClick={() => setShowForm(true)} style={{ color: 'var(--accent)', fontWeight: 500 }}>新增第一支股票</a></>
            : '沒有符合篩選條件的股票。'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map((stock) => (
            <StockCard key={stock.id} stock={stock} sectors={sectors} onUpdated={loadData} />
          ))}
        </div>
      )}
    </div>
  );
}
