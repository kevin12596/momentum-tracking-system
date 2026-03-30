// ============================================================
// PullbackMeter — colored zone bar showing pullback position
// Gray (NONE) | Amber (WATCH) | Green (IDEAL) | Red (DEEP)
// ============================================================

import type { WatchlistStock } from '../api/types';

interface Props { stock: WatchlistStock }

export function PullbackMeter({ stock }: Props) {
  const {
    pullback_from_high: pullback,
    pullback_watch_pct: watchPct,
    pullback_ideal_pct: idealPct,
    pullback_max_pct: maxPct,
    pullback_zone: zone,
  } = stock;

  const displayMax = (maxPct ?? 20) * 1.15;
  const toX = (pct: number) => Math.min(100, (pct / displayMax) * 100);

  const watchX = toX(watchPct ?? 8);
  const idealX = toX(idealPct ?? 13);
  const maxX   = toX(maxPct ?? 20);
  const currentX = pullback != null ? toX(pullback) : null;

  const currentColor =
    zone === 'IDEAL' ? 'var(--green)' :
    zone === 'DEEP'  ? 'var(--red)'   :
    zone === 'WATCH' ? 'var(--amber)' : 'var(--text-3)';

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>
        <span>回測幅度：<strong style={{ color: currentColor }}>{pullback != null ? `${pullback.toFixed(1)}%` : '–'}</strong></span>
        <span style={{ color: currentColor, fontWeight: 600 }}>
          {zone === 'NONE' ? '尚未到位' : zone === 'WATCH' ? '觀察帶' : zone === 'IDEAL' ? '理想帶' : zone === 'DEEP' ? '深度回測' : '–'}
        </span>
      </div>

      {/* Bar */}
      <div style={{ position: 'relative', height: 8, background: 'var(--surface-2)', borderRadius: 4, border: '1px solid var(--border)', overflow: 'visible' }}>
        {/* NONE segment (gray) 0 → watchPct */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: `${watchX}%`, height: '100%', background: 'var(--border-2)', borderRadius: '4px 0 0 4px' }} />
        {/* WATCH segment (amber) watchPct → idealPct */}
        <div style={{ position: 'absolute', left: `${watchX}%`, top: 0, width: `${idealX - watchX}%`, height: '100%', background: '#FCD34D' }} />
        {/* IDEAL segment (green) idealPct → maxPct */}
        <div style={{ position: 'absolute', left: `${idealX}%`, top: 0, width: `${maxX - idealX}%`, height: '100%', background: '#34D399' }} />
        {/* DEEP segment (red) maxPct → end */}
        <div style={{ position: 'absolute', left: `${maxX}%`, top: 0, width: `${100 - maxX}%`, height: '100%', background: '#FC8181', borderRadius: '0 4px 4px 0' }} />

        {/* Current position marker */}
        {currentX != null && (
          <div style={{
            position: 'absolute', left: `${currentX}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12, borderRadius: '50%',
            background: '#fff', border: `2.5px solid ${currentColor}`,
            zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,.15)',
          }} />
        )}
      </div>

      {/* Zone threshold labels */}
      <div style={{ position: 'relative', height: 14, fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
        <span style={{ position: 'absolute', left: `${watchX}%`, transform: 'translateX(-50%)' }}>{watchPct}%</span>
        <span style={{ position: 'absolute', left: `${idealX}%`, transform: 'translateX(-50%)' }}>{idealPct}%</span>
        <span style={{ position: 'absolute', left: `${maxX}%`, transform: 'translateX(-50%)' }}>{maxPct}%</span>
      </div>
    </div>
  );
}
