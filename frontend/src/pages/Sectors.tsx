// ============================================================
// Sectors — sector monitoring page (spec §7.1)
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SectorGroup } from '../api/types';

export function Sectors() {
  const [sectors, setSectors] = useState<SectorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSymbols, setNewSymbols] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const s = await api.sectors.list();
    setSectors(s);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleAddSector(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSymbols.trim()) return;
    setSaving(true);
    try {
      const symbols = newSymbols.split(',').map((s) => s.trim()).filter(Boolean);
      await api.sectors.upsert({ name: newName.trim(), symbols });
      setNewName('');
      setNewSymbols('');
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ color: '#718096', padding: 20 }}>載入中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, color: '#e2e8f0' }}>族群監測</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            background: '#3182ce', color: '#fff', border: 'none', fontSize: 14,
          }}
        >+ 新增族群</button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAddSector}
          style={{
            background: '#1a202c', border: '1px solid #2d3748', borderRadius: 8,
            padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <h3 style={{ color: '#e2e8f0', fontSize: 14 }}>新增族群</h3>
          <input
            style={inputStyle}
            placeholder="族群名稱（e.g. AI伺服器）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="股票代號，逗號分隔（e.g. 2330.TW, 2382.TW）"
            value={newSymbols}
            onChange={(e) => setNewSymbols(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
                background: '#3182ce', color: '#fff', border: 'none', fontSize: 13,
              }}
            >{saving ? '儲存中...' : '儲存'}</button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
                background: 'transparent', color: '#a0aec0', border: '1px solid #4a5568', fontSize: 13,
              }}
            >取消</button>
          </div>
        </form>
      )}

      {/* Sector list */}
      {sectors.length === 0 ? (
        <div style={{ color: '#718096' }}>尚無族群。點擊「新增族群」建立。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sectors.map((sector) => {
            const symbols: string[] = (() => {
              try { return JSON.parse(sector.symbols); } catch { return []; }
            })();
            const perfColor =
              (sector.weekly_perf ?? 0) > 0 ? '#68d391' :
              (sector.weekly_perf ?? 0) < 0 ? '#fc8181' : '#a0aec0';

            return (
              <div key={sector.id} style={{
                background: '#1a202c', border: '1px solid #2d3748', borderRadius: 8, padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{sector.name}</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    {sector.weekly_perf != null && (
                      <span style={{ color: perfColor }}>
                        週 {sector.weekly_perf >= 0 ? '+' : ''}{sector.weekly_perf.toFixed(1)}%
                      </span>
                    )}
                    {sector.daily_perf != null && (
                      <span style={{ color: sector.daily_perf >= 0 ? '#68d391' : '#fc8181' }}>
                        日 {sector.daily_perf >= 0 ? '+' : ''}{sector.daily_perf.toFixed(1)}%
                      </span>
                    )}
                    {sector.leader_symbol && (
                      <span style={{ color: '#718096' }}>最強：{sector.leader_symbol}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {symbols.map((sym) => (
                    <span key={sym} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      background: '#2d3748', color: '#90cdf4', border: '1px solid #4a5568',
                    }}>{sym.replace(/\.(TW|TWO)$/, '')}</span>
                  ))}
                </div>
                {sector.updated_at && (
                  <div style={{ fontSize: 11, color: '#4a5568', marginTop: 6 }}>
                    更新：{sector.updated_at.slice(0, 16)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: '#2d3748', border: '1px solid #4a5568',
  borderRadius: 4, color: '#e2e8f0', fontSize: 13, outline: 'none', width: '100%',
};
