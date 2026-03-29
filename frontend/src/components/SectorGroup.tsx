// ============================================================
// SectorGroup — dashboard sector aggregation row (spec §7.3)
// ============================================================

import type { DashboardSectorGroup } from '../api/types';

interface Props {
  group: DashboardSectorGroup;
}

const ZONE_LABEL: Record<string, string> = {
  NONE: '尚未到位',
  WATCH: '觀察帶',
  IDEAL: '理想帶',
  DEEP: '深度回測',
};

const ZONE_COLOR: Record<string, string> = {
  NONE: '#718096',
  WATCH: '#d69e2e',
  IDEAL: '#38a169',
  DEEP: '#e53e3e',
};

const TREND_LABEL: Record<string, string> = {
  BREAKOUT: 'BREAKOUT',
  RUNNING: 'RUNNING',
  BASING: 'BASING',
  FALLING: 'FALLING',
};

export function SectorGroupCard({ group }: Props) {
  const { sector, stocks } = group;

  const perfColor =
    (sector.weekly_perf ?? 0) > 0 ? '#68d391' :
    (sector.weekly_perf ?? 0) < 0 ? '#fc8181' : '#a0aec0';

  const weeklyStr = sector.weekly_perf != null
    ? `本週 ${sector.weekly_perf >= 0 ? '+' : ''}${sector.weekly_perf.toFixed(1)}%`
    : '';

  const vsStr = sector.vs_taiex_weekly != null
    ? `超額 ${sector.vs_taiex_weekly >= 0 ? '+' : ''}${sector.vs_taiex_weekly.toFixed(1)}%`
    : '';

  return (
    <div style={{
      border: '1px solid #2d3748',
      borderRadius: 8,
      padding: 12,
      background: '#1a202c',
      marginBottom: 12,
    }}>
      {/* Sector header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{sector.name}族群</span>
          <span style={{ fontSize: 12, color: '#718096', marginLeft: 8 }}>
            {stocks.length} 支追蹤中
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          {weeklyStr && <span style={{ fontSize: 13, color: perfColor, fontWeight: 600 }}>{weeklyStr}</span>}
          {vsStr && <span style={{ fontSize: 11, color: '#718096', marginLeft: 8 }}>({vsStr})</span>}
        </div>
      </div>

      {/* Stock rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {stocks.map((stock, i) => {
          const isLast = i === stocks.length - 1;
          const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
          const zone = stock.pullback_zone ?? 'NONE';
          const trend = stock.trend_state ?? '';
          const pullback = stock.pullback_from_high;

          return (
            <div key={stock.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: '#4a5568', width: 12 }}>{isLast ? '└' : '├'}</span>
              <a
                href={`/watchlist/${stock.id}`}
                style={{ color: '#90cdf4', textDecoration: 'none', minWidth: 80 }}
              >
                {stock.name} {shortCode}
              </a>
              {pullback != null && (
                <span style={{ color: '#a0aec0' }}>回測 {pullback.toFixed(1)}%</span>
              )}
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 3,
                background: `${ZONE_COLOR[zone]}22`,
                color: ZONE_COLOR[zone],
                border: `1px solid ${ZONE_COLOR[zone]}44`,
              }}>{ZONE_LABEL[zone] ?? zone}</span>
              {trend && (
                <span style={{ fontSize: 11, color: '#718096' }}>{trend}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
