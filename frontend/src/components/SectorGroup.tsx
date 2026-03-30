// ============================================================
// SectorGroup — dashboard sector row (Stripe light theme)
// ============================================================

import type { DashboardSectorGroup } from '../api/types';

interface Props { group: DashboardSectorGroup }

const ZONE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NONE:  { label: '尚未到位', color: 'var(--text-3)',  bg: 'var(--surface-2)' },
  WATCH: { label: '觀察帶',   color: 'var(--amber)',    bg: 'var(--amber-bg)'  },
  IDEAL: { label: '理想帶',   color: 'var(--green)',    bg: 'var(--green-bg)'  },
  DEEP:  { label: '深度',     color: 'var(--red)',      bg: 'var(--red-bg)'    },
};

const TREND_LABEL: Record<string, string> = {
  BREAKOUT: '突破↑', RUNNING: '上升↗', BASING: '整理→', FALLING: '下跌↓',
};
const TREND_COLOR: Record<string, string> = {
  BREAKOUT: '#d97706', RUNNING: 'var(--green)', BASING: 'var(--blue)', FALLING: 'var(--red)',
};

export function SectorGroupCard({ group }: Props) {
  const { sector, stocks } = group;

  const perfColor = (sector.weekly_perf ?? 0) > 0 ? 'var(--green)' : (sector.weekly_perf ?? 0) < 0 ? 'var(--red)' : 'var(--text-3)';
  const alertCount = stocks.filter((s) => s.pullback_zone === 'IDEAL' || s.pullback_zone === 'DEEP').length;

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--surface)',
      marginBottom: 12,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Sector header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{sector.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{stocks.length} 支追蹤中</span>
          {alertCount > 0 && (
            <span style={{
              fontSize: 11, padding: '1px 8px', borderRadius: 12,
              background: 'var(--green-bg)', color: 'var(--green)',
              border: '1px solid #6ee7b7',
            }}>
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
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
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
                borderBottom: isLast ? 'none' : '1px solid var(--border)',
                textDecoration: 'none', background: 'transparent', transition: 'background .1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--border-2)', fontSize: 12 }}>{isLast ? '└' : '├'}</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{stock.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{shortCode}</span>
                {stock.current_price && (
                  <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    NT${stock.current_price.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                  </span>
                )}
                {stock.pullback_from_high != null && zone !== 'NONE' && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    ↓{stock.pullback_from_high.toFixed(1)}%
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {stock.trend_state && (
                  <span style={{ fontSize: 11, color: TREND_COLOR[stock.trend_state] ?? 'var(--text-3)' }}>
                    {TREND_LABEL[stock.trend_state] ?? stock.trend_state}
                  </span>
                )}
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                  background: zoneConf.bg, color: zoneConf.color,
                  border: `1px solid ${zone === 'NONE' ? 'var(--border)' : zone === 'WATCH' ? '#fcd34d' : zone === 'IDEAL' ? '#6ee7b7' : '#fca5a5'}`,
                }}>{zoneConf.label}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
