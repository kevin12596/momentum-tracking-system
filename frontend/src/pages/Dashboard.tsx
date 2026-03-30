// ============================================================
// Dashboard — sector overview + quick alerts (spec §7.1, §7.3)
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DashboardData } from '../api/types';
import { SectorGroupCard } from '../components/SectorGroup';

const ZONE_COLOR: Record<string, string> = {
  NONE: '#718096',
  WATCH: '#d69e2e',
  IDEAL: '#38a169',
  DEEP: '#e53e3e',
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard.get()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={loadingStyle}>載入中...</div>;
  if (error) return <div style={errorStyle}>錯誤：{error}</div>;
  if (!data) return null;

  const { marketState, sectorGroups, alerts, uncategorized } = data;

  return (
    <div>
      {/* Market state bar */}
      <div style={{
        background: '#1a202c',
        border: '1px solid #2d3748',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: '#a0aec0' }}>
          加權指數{' '}
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
            {marketState.taiex_close?.toLocaleString('zh-TW') ?? '–'}
          </span>
        </span>
        {marketState.taiex_daily_chg != null && (
          <span style={{
            fontSize: 13,
            color: marketState.taiex_daily_chg >= 0 ? '#68d391' : '#fc8181',
            fontWeight: 600,
          }}>
            {marketState.taiex_daily_chg >= 0 ? '+' : ''}{marketState.taiex_daily_chg.toFixed(2)}%
          </span>
        )}
        <span style={{ fontSize: 12, color: '#718096' }}>
          波動模式：
          <span style={{ color: marketState.volatility_mode === 'HIGH' ? '#fc8181' : '#68d391' }}>
            {marketState.volatility_mode === 'HIGH' ? '高波動' : '正常'}
          </span>
        </span>
        <span style={{ fontSize: 12, color: '#718096', marginLeft: 'auto' }}>
          AI分析今日 {marketState.ai_calls_today ?? 0} 次
        </span>
      </div>

      {/* Quick alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={sectionTitle}>⚡ 快速警示</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {alerts.map((stock) => {
              const zone = stock.pullback_zone ?? 'NONE';
              const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
              return (
                <a key={stock.id} href={`/watchlist/${stock.id}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 6,
                  background: '#1a202c', border: `1px solid ${ZONE_COLOR[zone]}44`,
                  textDecoration: 'none',
                }}>
                  <div>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{stock.name}</span>
                    <span style={{ fontSize: 12, color: '#718096', marginLeft: 6 }}>{shortCode}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: ZONE_COLOR[zone], fontWeight: 600 }}>
                      {zone} {stock.pullback_from_high?.toFixed(1)}%
                    </div>
                    {stock.current_price && (
                      <div style={{ fontSize: 12, color: '#a0aec0' }}>NT${stock.current_price.toFixed(0)}</div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Sector groups */}
      <h2 style={sectionTitle}>📊 族群監測</h2>
      {sectorGroups.length === 0 && uncategorized.length === 0 ? (
        <div style={{ color: '#718096', fontSize: 14 }}>
          尚無追蹤股票。<a href="/watchlist" style={{ color: '#63b3ed' }}>前往新增</a>
        </div>
      ) : (
        <>
          {sectorGroups.map((group) => (
            <SectorGroupCard key={group.sector.id} group={group} />
          ))}

          {uncategorized.length > 0 && (
            <SectorGroupCard
              group={{
                sector: {
                  id: 'uncategorized',
                  name: '未分類',
                  symbols: JSON.stringify(uncategorized.map((s) => s.symbol)),
                  weekly_perf: null,
                  daily_perf: null,
                  vs_taiex_weekly: null,
                  leader_symbol: null,
                  updated_at: null,
                },
                stocks: uncategorized,
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#a0aec0',
  marginBottom: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const loadingStyle: React.CSSProperties = { color: '#718096', padding: 20 };
const errorStyle: React.CSSProperties = { color: '#fc8181', padding: 20 };
