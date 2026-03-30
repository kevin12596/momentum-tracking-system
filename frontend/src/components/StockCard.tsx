// ============================================================
// StockCard — Stripe-inspired light theme
// ============================================================

import { useState } from 'react';
import type { WatchlistStock, SectorGroup } from '../api/types';
import { api } from '../api/client';

interface Props {
  stock: WatchlistStock;
  sectors: SectorGroup[];
  onUpdated: () => void;
}

function parseTagsArr(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

const ZONE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  NONE:  { label: '尚未到位', color: 'var(--text-3)',  bg: 'var(--surface-2)', border: 'var(--border)' },
  WATCH: { label: '觀察帶',   color: 'var(--amber)',    bg: 'var(--amber-bg)',   border: '#fcd34d' },
  IDEAL: { label: '理想帶',   color: 'var(--green)',    bg: 'var(--green-bg)',   border: '#6ee7b7' },
  DEEP:  { label: '深度回測', color: 'var(--red)',      bg: 'var(--red-bg)',     border: '#fca5a5' },
};

const TREND_CONFIG: Record<string, { label: string; color: string }> = {
  BREAKOUT: { label: '突破 ↑', color: '#d97706' },
  RUNNING:  { label: '上升 ↗', color: 'var(--green)' },
  BASING:   { label: '整理 →', color: 'var(--blue)' },
  FALLING:  { label: '下跌 ↓', color: 'var(--red)' },
};

const ZONE_BAR_COLOR: Record<string, string> = {
  NONE:  '#94a3b8',
  WATCH: '#f59e0b',
  IDEAL: '#10b981',
  DEEP:  '#ef4444',
};

export function StockCard({ stock, sectors, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const tags = parseTagsArr(stock.concept_tags);
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');

  const zone = stock.pullback_zone ?? 'NONE';
  const zoneConf = ZONE_CONFIG[zone] ?? ZONE_CONFIG.NONE;
  const trendConf = stock.trend_state ? TREND_CONFIG[stock.trend_state] : null;

  const current = stock.current_price;
  const high60 = stock.high_ref_price ?? stock.day60_high;
  const low60 = stock.day60_low;
  const pullback = stock.pullback_from_high;
  const positionPct = stock.price_position_pct;
  const targetPrice = high60 ? high60 * (1 - stock.pullback_ideal_pct / 100) : null;

  const matchedSector = sectors.find((s) => {
    const syms: string[] = parseTagsArr(s.symbols);
    return syms.includes(stock.symbol);
  });

  async function handlePause() {
    setLoading(true);
    try { await api.watchlist.update(stock.id, { active: 0 }); onUpdated(); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!confirm(`確定移除 ${stock.name}（${shortCode}）？`)) return;
    setLoading(true);
    try { await api.watchlist.remove(stock.id); onUpdated(); }
    finally { setLoading(false); }
  }

  return (
    <div style={{
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Zone color stripe */}
      <div style={{ height: 3, background: ZONE_BAR_COLOR[zone], opacity: zone === 'NONE' ? 0.3 : 1 }} />

      <div style={{ padding: '14px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{stock.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{shortCode} · {stock.exchange}</div>
          </div>
          <div style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 8,
            background: zoneConf.bg, color: zoneConf.color, border: `1px solid ${zoneConf.border}`,
          }}>
            {zoneConf.label}
            {pullback != null && zone !== 'NONE' && <span style={{ marginLeft: 4, opacity: 0.85 }}>−{pullback.toFixed(1)}%</span>}
          </div>
        </div>

        {/* Key metrics grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 1, background: 'var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12,
        }}>
          <MetricCell
            label="現價"
            value={current ? `NT$${current.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'}
            sub={stock.price_at_add && current
              ? `${current >= stock.price_at_add ? '▲' : '▼'} ${Math.abs((current - stock.price_at_add) / stock.price_at_add * 100).toFixed(1)}%`
              : undefined}
            subColor={stock.price_at_add && current ? (current >= stock.price_at_add ? 'var(--green)' : 'var(--red)') : undefined}
          />
          <MetricCell
            label="60日高點"
            value={high60 ? `NT$${high60.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'}
            sub={stock.day60_high_date ?? undefined}
          />
          <MetricCell
            label="理想目標"
            value={targetPrice ? `NT$${targetPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'}
            sub={`−${stock.pullback_ideal_pct}% 時買入`}
            subColor="var(--green)"
          />
        </div>

        {/* Price range bar */}
        {high60 != null && low60 != null && positionPct != null ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>低 {low60.toFixed(0)}</span>
              <span>60日位階 {positionPct.toFixed(0)}%</span>
              <span>高 {high60.toFixed(0)}</span>
            </div>
            <div style={{ position: 'relative', height: 6, background: 'var(--surface-2)', borderRadius: 3, border: '1px solid var(--border)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, opacity: 0.5,
                width: `${Math.max(2, Math.min(100, positionPct))}%`,
                background: `linear-gradient(90deg, #c7d2fe, ${ZONE_BAR_COLOR[zone]})`,
              }} />
              <div style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)',
                left: `${Math.max(2, Math.min(98, positionPct))}%`,
                width: 10, height: 10, borderRadius: '50%',
                background: ZONE_BAR_COLOR[zone],
                boxShadow: `0 0 4px ${ZONE_BAR_COLOR[zone]}60`,
                border: '2px solid white',
              }} />
              {(() => {
                const range = high60 - low60;
                if (range <= 0 || !targetPrice) return null;
                const pos = ((targetPrice - low60) / range) * 100;
                return pos > 3 && pos < 97 ? (
                  <div style={{ position: 'absolute', left: `${pos}%`, top: -2, bottom: -2, width: 1.5, background: 'var(--green)', opacity: 0.8 }} />
                ) : null;
              })()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, textAlign: 'right' }}>
              ↑ 綠線 = 理想買入目標
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', border: '1px solid var(--border)' }}>
            等待開盤後掃描更新資料
          </div>
        )}

        {/* Concept tags */}
        {(tags.length > 0 || stock.industry) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {tags.slice(0, 5).map((tag) => (
              <span key={tag} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--blue-bg)', color: 'var(--blue)',
                border: '1px solid #bae6fd',
              }}>{tag}</span>
            ))}
            {stock.industry && !tags.includes(stock.industry) && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--surface-2)', color: 'var(--text-3)',
                border: '1px solid var(--border)',
              }}>{stock.industry}</span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: stock.ai_summary || stock.notes ? 10 : 0 }}>
          {trendConf && <StatPill label="趨勢" value={trendConf.label} color={trendConf.color} />}
          {stock.vol_ratio != null && (
            <StatPill label="量比" value={`${stock.vol_ratio.toFixed(1)}x`}
              color={stock.vol_ratio >= 2.5 ? 'var(--amber)' : stock.vol_ratio < 0.8 ? 'var(--text-3)' : 'var(--text-2)'} />
          )}
          {matchedSector?.weekly_perf != null && (
            <StatPill label="族群週"
              value={`${matchedSector.weekly_perf >= 0 ? '+' : ''}${matchedSector.weekly_perf.toFixed(1)}%`}
              color={matchedSector.weekly_perf >= 0 ? 'var(--green)' : 'var(--red)'} />
          )}
        </div>

        {/* AI summary */}
        {stock.ai_summary && (
          <div style={{
            fontSize: 11, color: 'var(--text-2)', marginTop: 8, padding: '7px 10px',
            background: 'var(--green-bg)', borderRadius: 'var(--radius)',
            borderLeft: '3px solid var(--green)', lineHeight: 1.6,
          }}>
            🤖 {stock.ai_summary}
          </div>
        )}

        {stock.notes && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>📝 {stock.notes}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <a href={`/watchlist/${stock.id}`} style={{
            flex: 1, textAlign: 'center', fontSize: 12, padding: '5px 0', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', color: 'var(--text-2)', textDecoration: 'none',
            border: '1px solid var(--border)', fontWeight: 500,
          }}>詳情</a>
          <button onClick={handlePause} disabled={loading} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 'var(--radius)',
            background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
            border: '1px solid var(--border)',
          }}>暫停</button>
          <button onClick={handleDelete} disabled={loading} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 'var(--radius)',
            background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer',
            border: '1px solid #fca5a5',
          }}>移除</button>
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: 'var(--surface)', padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--text-3)' }}>{label} </span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
