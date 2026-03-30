// ============================================================
// SectorGroup — dashboard sector row (redesigned)
// ============================================================

import type { DashboardSectorGroup } from '../api/types';

interface Props { group: DashboardSectorGroup }

const ZONE_CONFIG: Record<string, { label: string; color: string }> = {
  NONE:  { label: '尚未到位', color: '#475569' },
  WATCH: { label: '觀察帶',   color: '#f59e0b' },
  IDEAL: { label: '理想帶',   color: '#10b981' },
  DEEP:  { label: '深度',     color: '#ef4444' },
};

const TREND_LABEL: Record<string, string> = {
  BREAKOUT: '突破↑', RUNNING: '上升↗', BASING: '整理→', FALLING: '下跌↓',
};
const TREND_COLOR: Record<string, string> = {
  BREAKOUT: '#fbbf24', RUNNING: '#34d399', BASING: '#60a5fa', FALLING: '#f87171',
};

export function SectorGroupCard({ group }: Props) {
  const { sector, stocks } = group;

  const perfColor = (sector.weekly_perf ?? 0) > 0 ? '#34d399' : (sector.weekly_perf ?? 0) < 0 ? '#f87171' : '#64748b';
  const alertCount = stocks.filter((s) => s.pullback_zone === 'IDEAL' || s.pullback_zone === 'DEEP').length;

  return (
    <div style={{ border: '1px solid #1e293b', borderRadius: 10, background: '#0a0f1a', marginBottom: 12, overflow: 'hidden' }}>
      {/* Sector header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: '#0f172a', borderBottom: '1px solid #1e293b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{sector.name}</span>
          <span style={{ fontSize: 12, color: '#475569' }}>{stocks.length} 支追蹤中</span>
          {alertCount > 0 && (
            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 12, background: 'rgba(16,185,129,.15)', color: '#10b981', border: '1px solid rgba(16,185,129,.3)' }}>
              {alertCount} 支到位
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {sector.weekly_perf != null && (
            <span style={{ fontSize: 13, fontWeight: 600, color: perfColor }}>
              週 {sector.weekly_perf >= 0 ? '+' : ''}{sector.weekly_perf.toFixed(1)}%
            </span>
          )}
          {sector.vs_taiex_weekly != null && (
            <span style={{ fontSize: 11, color: '#475569' }}>
              超額 {sector.vs_taiex_weekly >= 0 ? '+' : ''}{sector.vs_taiex_weekly.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Stock rows */}
      <div>
        {stocks.map((stock, i) => {
          const isLast = i === stocks.length - 1;
          const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
          const zone = stock.pullback_zone ?? 'NONE';
          const zoneConf = ZONE_CONFIG[zone] ?? ZONE_CONFIG.NONE;

          return (
            <a
              key={stock.id}
              href={`/watchlist/${stock.id}`}
              style={{
                display: 'grid', gridTemplateColumns: '16px 1fr auto',
                alignItems: 'center', gap: 10, padding: '9px 16px',
                borderBottom: isLast ? 'none' : '1px solid #1e293b',
                textDecoration: 'none', background: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#0f172a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: '#334155', fontSize: 12 }}>{isLast ? '└' : '├'}</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap' }}>{stock.name}</span>
                <span style={{ fontSize: 11, color: '#475569' }}>{shortCode}</span>
                {stock.current_price && (
                  <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    NT${stock.current_price.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                  </span>
                )}
                {stock.pullback_from_high != null && zone !== 'NONE' && (
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    ↓{stock.pullback_from_high.toFixed(1)}%
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {stock.trend_state && (
                  <span style={{ fontSize: 11, color: TREND_COLOR[stock.trend_state] ?? '#64748b' }}>
                    {TREND_LABEL[stock.trend_state] ?? stock.trend_state}
                  </span>
                )}
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                  background: `${zoneConf.color}18`, color: zoneConf.color, border: `1px solid ${zoneConf.color}40`,
                }}>{zoneConf.label}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
