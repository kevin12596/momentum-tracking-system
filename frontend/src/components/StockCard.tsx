// ============================================================
// StockCard — main stock display card (spec §7.2)
// ============================================================

import { useState } from 'react';
import type { WatchlistStock, SectorGroup } from '../api/types';
import { PullbackMeter } from './PullbackMeter';
import { api } from '../api/client';

interface Props {
  stock: WatchlistStock;
  sectors: SectorGroup[];
  onUpdated: () => void;
}

const TREND_LABELS: Record<string, string> = {
  BREAKOUT: '突破 ↑',
  RUNNING: '上升 ↗',
  BASING: '整理 →',
  FALLING: '下跌 ↓',
};

const TREND_COLORS: Record<string, string> = {
  BREAKOUT: '#f6e05e',
  RUNNING: '#68d391',
  BASING: '#90cdf4',
  FALLING: '#fc8181',
};

const ZONE_BG: Record<string, string> = {
  NONE: 'transparent',
  WATCH: 'rgba(214,158,46,0.12)',
  IDEAL: 'rgba(56,161,105,0.12)',
  DEEP: 'rgba(229,62,62,0.12)',
};

function parseTagsArr(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

export function StockCard({ stock, sectors, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const tags = parseTagsArr(stock.concept_tags);
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');

  const dailyChg = stock.current_price && stock.price_at_add
    ? ((stock.current_price - stock.price_at_add) / stock.price_at_add) * 100
    : null;

  // Find matching sector for weekly perf
  const matchedSector = sectors.find((s) => {
    const syms: string[] = parseTagsArr(s.symbols);
    return syms.includes(stock.symbol);
  });

  // 60-day range bar
  const high = stock.day60_high;
  const low = stock.day60_low;
  const current = stock.current_price;
  const positionPct = stock.price_position_pct;

  async function handlePause() {
    setLoading(true);
    try {
      await api.watchlist.update(stock.id, { active: 0 });
      onUpdated();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`確定要移除 ${stock.name}（${shortCode}）嗎？`)) return;
    setLoading(true);
    try {
      await api.watchlist.remove(stock.id);
      onUpdated();
    } finally {
      setLoading(false);
    }
  }

  const zone = stock.pullback_zone ?? 'NONE';
  const cardBg = ZONE_BG[zone] || 'transparent';

  return (
    <div style={{
      border: '1px solid #2d3748',
      borderRadius: 8,
      padding: 16,
      background: `linear-gradient(135deg, #1a202c, #1e2533)`,
      backgroundBlendMode: 'overlay',
      backgroundColor: '#1a202c',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Zone glow overlay */}
      <div style={{ position: 'absolute', inset: 0, background: cardBg, pointerEvents: 'none' }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{stock.name}</span>
          <span style={{ fontSize: 13, color: '#718096', marginLeft: 8 }}>{shortCode}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
            NT${current?.toFixed(0) ?? '–'}
          </div>
          {dailyChg != null && (
            <div style={{ fontSize: 12, color: dailyChg >= 0 ? '#68d391' : '#fc8181' }}>
              {dailyChg >= 0 ? '+' : ''}{dailyChg.toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Concept tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 12,
              background: '#2d3748', color: '#90cdf4', border: '1px solid #4a5568',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* AI summary */}
      {stock.ai_summary && (
        <div style={{ fontSize: 12, color: '#a0aec0', marginBottom: 8, fontStyle: 'italic' }}>
          "{stock.ai_summary}"
        </div>
      )}

      {/* 60-day range bar */}
      {high != null && low != null && current != null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>60日區間</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ color: '#718096' }}>{low.toFixed(0)}</span>
            <div style={{ flex: 1, height: 6, background: '#2d3748', borderRadius: 3, position: 'relative' }}>
              {positionPct != null && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.max(0, Math.min(100, positionPct))}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 8, height: 8,
                  background: '#63b3ed', borderRadius: '50%',
                  boxShadow: '0 0 4px #63b3ed',
                }} />
              )}
              <div style={{
                height: '100%',
                width: `${positionPct ?? 50}%`,
                background: 'linear-gradient(90deg, #2b6cb0, #63b3ed)',
                borderRadius: 3,
                opacity: 0.4,
              }} />
            </div>
            <span style={{ color: '#718096' }}>{high.toFixed(0)}</span>
            {positionPct != null && (
              <span style={{ color: '#a0aec0' }}>位階 {positionPct.toFixed(0)}%</span>
            )}
          </div>
        </div>
      )}

      {/* Pullback meter */}
      <PullbackMeter stock={stock} />

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
        <div>
          <span style={{ color: '#718096' }}>量比 </span>
          <span style={{
            color: stock.vol_ratio != null && stock.vol_ratio >= 2.5 ? '#f6e05e' :
                   stock.vol_ratio != null && stock.vol_ratio < 0.8 ? '#68d391' : '#a0aec0',
          }}>
            {stock.vol_ratio?.toFixed(1) ?? '–'}x
          </span>
        </div>
        {stock.trend_state && (
          <div>
            <span style={{ color: TREND_COLORS[stock.trend_state] ?? '#a0aec0' }}>
              {TREND_LABELS[stock.trend_state] ?? stock.trend_state}
            </span>
          </div>
        )}
        {matchedSector?.weekly_perf != null && (
          <div>
            <span style={{ color: '#718096' }}>族群週 </span>
            <span style={{ color: matchedSector.weekly_perf >= 0 ? '#68d391' : '#fc8181' }}>
              {matchedSector.weekly_perf >= 0 ? '+' : ''}{matchedSector.weekly_perf.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Notes */}
      {stock.notes && (
        <div style={{ fontSize: 12, color: '#718096', marginTop: 6, paddingTop: 6, borderTop: '1px solid #2d3748' }}>
          備註：{stock.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <a href={`/watchlist/${stock.id}`} style={{
          fontSize: 12, padding: '4px 12px', borderRadius: 4,
          background: '#2d3748', color: '#a0aec0', textDecoration: 'none',
          border: '1px solid #4a5568',
        }}>詳情</a>
        <button
          onClick={handlePause}
          disabled={loading}
          style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 4,
            background: 'transparent', color: '#718096', cursor: 'pointer',
            border: '1px solid #4a5568',
          }}
        >暫停</button>
        <button
          onClick={handleDelete}
          disabled={loading}
          style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 4,
            background: 'transparent', color: '#fc8181', cursor: 'pointer',
            border: '1px solid #fc818140',
          }}
        >移除</button>
      </div>
    </div>
  );
}
