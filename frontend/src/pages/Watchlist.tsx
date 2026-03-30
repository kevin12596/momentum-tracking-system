// ============================================================
// Watchlist — stock list management page (spec §7.2)
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { WatchlistStock, SectorGroup } from '../api/types';
import { StockCard } from '../components/StockCard';
import { AddStockForm } from '../components/AddStockForm';

type FilterZone = 'ALL' | 'WATCH' | 'IDEAL' | 'DEEP' | 'NONE';

export function Watchlist() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [sectors, setSectors] = useState<SectorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterZone>('ALL');
  const [search, setSearch] = useState('');

  async function loadData() {
    const [s, sec] = await Promise.all([
      api.watchlist.list(),
      api.sectors.list(),
    ]);
    setStocks(s);
    setSectors(sec);
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  function handleAdded() {
    setShowForm(false);
    loadData();
  }

  const filtered = stocks.filter((s) => {
    if (filter !== 'ALL' && s.pullback_zone !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.symbol.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) return <div style={{ color: '#718096', padding: 20 }}>載入中...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, color: '#e2e8f0' }}>
          追蹤清單
          <span style={{ fontSize: 13, color: '#718096', marginLeft: 8 }}>
            {stocks.length} 支
          </span>
        </h1>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            background: '#3182ce', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
          }}
        >+ 新增</button>
      </div>

      {/* Add form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a202c', border: '1px solid #2d3748', borderRadius: 8,
            padding: 24, width: '100%', maxWidth: 520,
          }}>
            <AddStockForm onAdded={handleAdded} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{
            padding: '6px 12px', background: '#2d3748', border: '1px solid #4a5568',
            borderRadius: 4, color: '#e2e8f0', fontSize: 13, flex: '1 1 200px',
          }}
          placeholder="搜尋股票名稱或代號..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(['ALL', 'WATCH', 'IDEAL', 'DEEP', 'NONE'] as FilterZone[]).map((z) => (
          <button
            key={z}
            onClick={() => setFilter(z)}
            style={{
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
              background: filter === z ? '#3182ce' : '#2d3748',
              color: filter === z ? '#fff' : '#a0aec0',
              border: `1px solid ${filter === z ? '#3182ce' : '#4a5568'}`,
            }}
          >
            {z === 'ALL' ? '全部' : z === 'NONE' ? '尚未到位' : z}
          </button>
        ))}
      </div>

      {/* Stock grid */}
      {filtered.length === 0 ? (
        <div style={{ color: '#718096', padding: '20px 0' }}>
          {stocks.length === 0 ? '清單為空，點擊「新增」開始追蹤。' : '沒有符合篩選條件的股票。'}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
        }}>
          {filtered.map((stock) => (
            <StockCard
              key={stock.id}
              stock={stock}
              sectors={sectors}
              onUpdated={loadData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
