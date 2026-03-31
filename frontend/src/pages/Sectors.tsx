// ============================================================
// Sectors — auto-generated sector groups from watchlist notes
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { WatchlistStock } from '../api/types';

// -------------------------------------------------------
// Analyst summary (Chinese)
// -------------------------------------------------------

function analyzeGroup(stocks: WatchlistStock[]): string {
  const withRS = stocks.filter(s => s.rs_score != null);
  const avgRS = withRS.length > 0 ? withRS.reduce((a, s) => a + s.rs_score!, 0) / withRS.length : null;
  const zones = stocks.reduce((acc, s) => {
    const key = s.pullback_zone ?? 'NONE';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const leader = [...withRS].sort((a, b) => b.rs_score! - a.rs_score!)[0];
  const parts: string[] = [];

  if (avgRS !== null) {
    if (avgRS >= 80) parts.push(`族群強度極高（RS 均值 ${avgRS.toFixed(0)}），為市場領先族群`);
    else if (avgRS >= 60) parts.push(`族群相對強勢（RS 均值 ${avgRS.toFixed(0)}），跑贏大盤`);
    else if (avgRS >= 40) parts.push(`族群強度中性（RS 均值 ${avgRS.toFixed(0)}），接近大盤表現`);
    else parts.push(`族群走弱（RS 均值 ${avgRS.toFixed(0)}），表現落後大盤`);
  }

  const idealCount = zones['IDEAL'] || 0;
  const watchCount = zones['WATCH'] || 0;
  const deepCount = zones['DEEP'] || 0;
  if (idealCount > 0) parts.push(`${idealCount} 支已回測至理想買入區間，可考慮分批布局`);
  else if (watchCount > 0) parts.push(`${watchCount} 支進入留意區，密切追蹤`);
  else if (deepCount > 0) parts.push(`${deepCount} 支深度回測超過極限，趨勢疑慮，建議觀望`);
  else parts.push('尚未出現明顯回測機會');

  if (leader) parts.push(`族群龍頭：${leader.name}（RS ${leader.rs_score}）`);

  return parts.join('。') + '。';
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function getAvgRS(stocks: WatchlistStock[]): number | null {
  const rs = stocks.filter(s => s.rs_score != null).map(s => s.rs_score!);
  return rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
}

function getAvgPullback(stocks: WatchlistStock[]): number | null {
  const pb = stocks.filter(s => s.pullback_from_high != null).map(s => s.pullback_from_high!);
  return pb.length > 0 ? pb.reduce((a, b) => a + b, 0) / pb.length : null;
}

function getDominantTrend(stocks: WatchlistStock[]): string | null {
  const counts: Record<string, number> = {};
  for (const s of stocks) {
    if (s.trend_state) counts[s.trend_state] = (counts[s.trend_state] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function getZones(stocks: WatchlistStock[]): Record<string, number> {
  return stocks.reduce((acc, s) => {
    const key = s.pullback_zone ?? 'NONE';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function getLeader(stocks: WatchlistStock[]): WatchlistStock | null {
  const withRS = stocks.filter(s => s.rs_score != null);
  if (withRS.length === 0) return null;
  return [...withRS].sort((a, b) => b.rs_score! - a.rs_score!)[0];
}

// -------------------------------------------------------
// Sub-components
// -------------------------------------------------------

function ZoneBadge({ zone }: { zone: string | null }) {
  const z = zone ?? 'NONE';
  const styles: Record<string, React.CSSProperties> = {
    IDEAL: { color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green)' },
    WATCH: { color: 'var(--amber)', background: 'var(--amber-bg)', border: '1px solid var(--amber)' },
    DEEP:  { color: 'var(--red)',   background: 'var(--red-bg)',   border: '1px solid var(--red)' },
    NONE:  { color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' },
  };
  const labels: Record<string, string> = { IDEAL: '理想', WATCH: '留意', DEEP: '深回', NONE: '—' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
      ...(styles[z] ?? styles['NONE']),
    }}>{labels[z] ?? z}</span>
  );
}

function RSBadge({ rs }: { rs: number | null }) {
  if (rs == null) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>;
  const color = rs >= 80 ? 'var(--green)' : rs < 40 ? 'var(--red)' : 'var(--text-1)';
  return <span style={{ fontSize: 12, fontWeight: 700, color }}>{rs}</span>;
}

function TrendLabel({ trend }: { trend: string | null }) {
  if (!trend) return null;
  const map: Record<string, { label: string; color: string }> = {
    BREAKOUT: { label: '突破', color: 'var(--green)' },
    RUNNING:  { label: '奔馳', color: 'var(--accent)' },
    BASING:   { label: '築底', color: 'var(--text-2)' },
    FALLING:  { label: '下跌', color: 'var(--red)' },
  };
  const cfg = map[trend] ?? { label: trend, color: 'var(--text-3)' };
  return <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>;
}

function StockRow({ stock }: { stock: WatchlistStock }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      {/* Left: name + code */}
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{stock.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
          {stock.symbol.replace(/\.(TW|TWO)$/, '')}
        </span>
      </div>
      {/* Right: RS + zone + price */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <TrendLabel trend={stock.trend_state} />
        <ZoneBadge zone={stock.pullback_zone} />
        <RSBadge rs={stock.rs_score} />
        {stock.current_price != null && (
          <span style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 48, textAlign: 'right' }}>
            {stock.current_price.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

interface GroupCardProps {
  tag: string;
  stocks: WatchlistStock[];
}

function GroupCard({ tag, stocks }: GroupCardProps) {
  const [expanded, setExpanded] = useState(true);
  const avgRS = getAvgRS(stocks);
  const avgPb = getAvgPullback(stocks);
  const zones = getZones(stocks);
  const leader = getLeader(stocks);
  const dominantTrend = getDominantTrend(stocks);
  const summary = analyzeGroup(stocks);

  const borderColor =
    avgRS != null && avgRS >= 70 ? 'var(--green)'
    : avgRS != null && avgRS >= 40 ? 'var(--amber)'
    : 'var(--border)';

  const rsColor =
    avgRS != null && avgRS >= 80 ? 'var(--green)'
    : avgRS != null && avgRS < 40 ? 'var(--red)'
    : 'var(--text-1)';

  const zonePills: Array<{ key: string; label: string; color: string; bg: string }> = [
    { key: 'IDEAL', label: '理想', color: 'var(--green)', bg: 'var(--green-bg)' },
    { key: 'WATCH', label: '留意', color: 'var(--amber)', bg: 'var(--amber-bg)' },
    { key: 'DEEP',  label: '深回', color: 'var(--red)',   bg: 'var(--red-bg)' },
    { key: 'NONE',  label: '無訊號', color: 'var(--text-3)', bg: 'var(--surface-2)' },
  ];

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: 'var(--radius-lg)', padding: '16px 18px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', marginBottom: 8 }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{tag}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10,
              background: 'var(--accent-bg, #ede9fe)', color: 'var(--accent)',
            }}>{stocks.length} 支</span>
            {leader && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>龍頭：{leader.name}</span>
            )}
            {dominantTrend && <TrendLabel trend={dominantTrend} />}
          </div>
          {/* Analyst summary */}
          <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 5, lineHeight: 1.6 }}>
            {summary}
          </p>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-3)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: expanded ? 12 : 0 }}>
        {avgRS != null && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
            color: rsColor, background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            RS 均 {avgRS.toFixed(0)}
          </span>
        )}
        {zonePills.map(p => (zones[p.key] ?? 0) > 0 && (
          <span key={p.key} style={{
            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 12,
            color: p.color, background: p.bg,
          }}>
            {p.label} {zones[p.key]}
          </span>
        ))}
        {avgPb != null && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '3px 9px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            均回測 {avgPb.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Stock list */}
      {expanded && (
        <div style={{ marginTop: 4 }}>
          {stocks.map(s => <StockRow key={s.id} stock={s} />)}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Main page
// -------------------------------------------------------

export function Sectors() {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [untaggedExpanded, setUntaggedExpanded] = useState(false);

  useEffect(() => {
    api.watchlist.list().then(setStocks).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>
      載入中...
    </div>
  );

  const activeStocks = stocks.filter(s => s.active === 1);

  // Group by notes tag
  const groups = new Map<string, WatchlistStock[]>();
  const untagged: WatchlistStock[] = [];
  for (const s of activeStocks) {
    const tag = s.notes?.trim();
    if (tag) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push(s);
    } else {
      untagged.push(s);
    }
  }

  // Sort groups by average RS descending
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const avg = (list: WatchlistStock[]) => getAvgRS(list) ?? 0;
    return avg(b[1]) - avg(a[1]);
  });

  const hasGroups = sortedGroups.length > 0;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>族群監測</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>
          依觀察清單備注自動分組，顯示強度分析與回測機會
        </p>
      </div>

      {/* Empty state */}
      {!hasGroups && untagged.length === 0 && (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
          color: 'var(--text-3)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏷</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>尚未設定標籤</div>
          <div style={{ fontSize: 13 }}>
            前往「觀察清單」頁面，在個股備注欄位填入族群名稱（例如「AI伺服器」、「電動車」），
            系統將自動在此頁分組顯示。
          </div>
        </div>
      )}

      {!hasGroups && untagged.length > 0 && (
        <div style={{
          padding: '32px 24px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
          color: 'var(--text-3)', marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>尚未設定標籤</div>
          <div style={{ fontSize: 13 }}>
            在觀察清單的備注欄位填入族群名稱，系統將自動在此頁分組顯示。
          </div>
        </div>
      )}

      {/* Group cards */}
      {hasGroups && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sortedGroups.map(([tag, tagStocks]) => (
            <GroupCard key={tag} tag={tag} stocks={tagStocks} />
          ))}
        </div>
      )}

      {/* Untagged section */}
      {untagged.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer', padding: '10px 0', borderTop: '1px solid var(--border)',
            }}
            onClick={() => setUntaggedExpanded(e => !e)}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>
              未分類 ({untagged.length} 支)
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{untaggedExpanded ? '▲' : '▼'}</span>
          </div>
          {untaggedExpanded && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '12px 16px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {untagged.map(s => <StockRow key={s.id} stock={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
