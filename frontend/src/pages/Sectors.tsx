// ============================================================
// Sectors — sector monitoring page (Stripe light theme)
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

  async function load() { const s = await api.sectors.list(); setSectors(s); }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function handleAddSector(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSymbols.trim()) return;
    setSaving(true);
    try {
      const symbols = newSymbols.split(',').map((s) => s.trim()).filter(Boolean);
      await api.sectors.upsert({ name: newName.trim(), symbols });
      setNewName(''); setNewSymbols(''); setShowForm(false);
      await load();
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>
      載入中...
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>族群監測</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>管理追蹤的產業族群，系統每週自動計算超額表現</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 600, boxShadow: '0 1px 4px rgba(99,91,255,.3)',
          }}
        >+ 新增族群</button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleAddSector}
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: 18, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h3 style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}>新增族群</h3>
          <div>
            <label style={labelStyle}>族群名稱</label>
            <input style={inputStyle} placeholder="e.g. AI伺服器" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>股票代號（逗號分隔）</label>
            <input style={inputStyle} placeholder="e.g. 2330.TW, 2382.TW" value={newSymbols} onChange={(e) => setNewSymbols(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>代號請加 .TW（上市）或 .TWO（上櫃）後綴</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving} style={{
              padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
            }}>{saving ? '儲存中...' : '儲存'}</button>
            <button type="button" onClick={() => setShowForm(false)} style={{
              padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: 13,
            }}>取消</button>
          </div>
        </form>
      )}

      {/* Sector list */}
      {sectors.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)',
          border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          尚無族群。點擊「新增族群」建立。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectors.map((sector) => {
            const symbols: string[] = (() => { try { return JSON.parse(sector.symbols); } catch { return []; } })();
            const perf = sector.weekly_perf ?? 0;
            const perfColor = perf > 0 ? 'var(--green)' : perf < 0 ? 'var(--red)' : 'var(--text-3)';
            const perfBg = perf > 0 ? 'var(--green-bg)' : perf < 0 ? 'var(--red-bg)' : 'var(--surface-2)';

            return (
              <div key={sector.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '14px 18px',
                boxShadow: 'var(--shadow-sm)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{sector.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{symbols.length} 支</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {sector.weekly_perf != null && (
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                        color: perfColor, background: perfBg,
                      }}>
                        週 {perf >= 0 ? '+' : ''}{perf.toFixed(1)}%
                      </span>
                    )}
                    {sector.daily_perf != null && (
                      <span style={{ fontSize: 12, color: sector.daily_perf >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        日 {sector.daily_perf >= 0 ? '+' : ''}{sector.daily_perf.toFixed(1)}%
                      </span>
                    )}
                    {sector.vs_taiex_weekly != null && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        超額 {sector.vs_taiex_weekly >= 0 ? '+' : ''}{sector.vs_taiex_weekly.toFixed(1)}%
                      </span>
                    )}
                    {sector.leader_symbol && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        龍頭 {sector.leader_symbol.replace(/\.(TW|TWO)$/, '')}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {symbols.map((sym) => (
                    <span key={sym} style={{
                      fontSize: 11, padding: '2px 10px', borderRadius: 12,
                      background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid #BAE6FD',
                    }}>{sym.replace(/\.(TW|TWO)$/, '')}</span>
                  ))}
                </div>

                {sector.updated_at && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
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
  padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, outline: 'none', width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block', fontWeight: 500,
};
