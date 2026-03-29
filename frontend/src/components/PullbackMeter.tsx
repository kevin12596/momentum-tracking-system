// ============================================================
// PullbackMeter — colored zone bar showing pullback position
// Gray (NONE) | Yellow (WATCH) | Green (IDEAL) | Red (DEEP)
// ============================================================

import type { WatchlistStock, PullbackZone } from '../api/types';

interface Props {
  stock: WatchlistStock;
}

const ZONE_COLORS: Record<string, string> = {
  none: '#4a5568',
  watch: '#d69e2e',
  ideal: '#38a169',
  deep: '#e53e3e',
};

export function PullbackMeter({ stock }: Props) {
  const {
    pullback_from_high: pullback,
    pullback_watch_pct: watchPct,
    pullback_ideal_pct: idealPct,
    pullback_max_pct: maxPct,
    pullback_zone: zone,
  } = stock;

  // Display range: 0% to maxPct + 5% for overflow
  const displayMax = (maxPct ?? 20) * 1.15;

  const toX = (pct: number) => Math.min(100, (pct / displayMax) * 100);

  const watchX = toX(watchPct ?? 8);
  const idealX = toX(idealPct ?? 13);
  const maxX = toX(maxPct ?? 20);
  const currentX = pullback != null ? toX(pullback) : null;

  const currentColor =
    zone === 'IDEAL'
      ? ZONE_COLORS.ideal
      : zone === 'DEEP'
      ? ZONE_COLORS.deep
      : zone === 'WATCH'
      ? ZONE_COLORS.watch
      : '#718096';

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Zone label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a0aec0', marginBottom: 4 }}>
        <span>回測 {pullback != null ? `${pullback.toFixed(1)}%` : '–'}</span>
        <span style={{ color: currentColor, fontWeight: 600 }}>{zone ?? '–'}</span>
      </div>

      {/* Bar */}
      <div style={{ position: 'relative', height: 8, background: '#2d3748', borderRadius: 4, overflow: 'visible' }}>
        {/* Segment: NONE (gray) 0→watch */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: `${watchX}%`, height: '100%',
          background: ZONE_COLORS.none, borderRadius: '4px 0 0 4px',
        }} />

        {/* Segment: WATCH (yellow) watch→ideal */}
        <div style={{
          position: 'absolute', left: `${watchX}%`, top: 0,
          width: `${idealX - watchX}%`, height: '100%',
          background: ZONE_COLORS.watch,
        }} />

        {/* Segment: IDEAL (green) ideal→max */}
        <div style={{
          position: 'absolute', left: `${idealX}%`, top: 0,
          width: `${maxX - idealX}%`, height: '100%',
          background: ZONE_COLORS.ideal,
        }} />

        {/* Segment: DEEP (red) max→end */}
        <div style={{
          position: 'absolute', left: `${maxX}%`, top: 0,
          width: `${100 - maxX}%`, height: '100%',
          background: ZONE_COLORS.deep, borderRadius: '0 4px 4px 0',
        }} />

        {/* Current position marker */}
        {currentX != null && (
          <div style={{
            position: 'absolute',
            left: `${currentX}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10, height: 10,
            background: '#fff',
            border: `2px solid ${currentColor}`,
            borderRadius: '50%',
            zIndex: 10,
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          }} />
        )}
      </div>

      {/* Zone labels */}
      <div style={{ display: 'flex', fontSize: 10, color: '#718096', marginTop: 2, position: 'relative', height: 12 }}>
        <span style={{ position: 'absolute', left: `${watchX}%`, transform: 'translateX(-50%)' }}>{watchPct}%</span>
        <span style={{ position: 'absolute', left: `${idealX}%`, transform: 'translateX(-50%)' }}>{idealPct}%</span>
        <span style={{ position: 'absolute', left: `${maxX}%`, transform: 'translateX(-50%)' }}>{maxPct}%</span>
      </div>
    </div>
  );
}
