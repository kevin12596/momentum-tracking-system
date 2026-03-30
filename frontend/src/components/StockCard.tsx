// ============================================================
// StockCard — redesigned financial data card
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
  NONE:  { label: '尚未到位', color: '#64748b', bg: '#1e293b',               border: '#334155' },
  WATCH: { label: '觀察帶',   color: '#f59e0b', bg: 'rgba(245,158,11,.08)',   border: 'rgba(245,158,11,.35)' },
  IDEAL: { label: '理想帶',   color: '#10b981', bg: 'rgba(16,185,129,.08)',   border: 'rgba(16,185,129,.35)' },
  DEEP:  { label: '深度回測', color: '#ef4444', bg: 'rgba(239,68,68,.08)',    border: 'rgba(239,68,68,.35)'  },
};

const TREND_CONFIG: Record<string, { label: string; color: string }> = {
  BREAKOUT: { label: '突破 ↑', color: '#fbbf24' },
  RUNNING:  { label: '上升 ↗', color: '#34d399' },
  BASING:   { label: '整理 →', color: '#60a5fa' },
  FALLING:  { label: '下跌 ↓', color: '#f87171' },
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
    <div style={{ borderRadius: 10, border: `1px solid ${zoneConf.border}`, background: '#0f172a', overflow: 'hidden' }}>
      <div style={{ height: 3, background: zoneConf.color, opacity: zone === 'NONE' ? 0.25 : 0.9 }} />
      <div style={{ padding: '14px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{stock.name}</div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{shortCode} · {stock.exchange}</div>
          </div>
          <div style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 8,
            background: zoneConf.bg, color: zoneConf.color, border: `1px solid ${zoneConf.border}`,
          }}>
            {zoneConf.label}
            {pullback != null && zone !== 'NONE' && <span style={{ marginLeft: 4, opacity: 0.85 }}>−{pullback.toFixed(1)}%</span>}
          </div>
        </div>

        {/* Key metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#334155', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          <MetricCell
            label="現價"
            value={current ? `NT$${current.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'}
            sub={stock.price_at_add && current
              ? `${current >= stock.price_at_add ? '▲' : '▼'} ${Math.abs((current - stock.price_at_add) / stock.price_at_add * 100).toFixed(1)}%`
              : undefined}
            subColor={stock.price_at_add && current ? (current >= stock.price_at_add ? '#34d399' : '#f87171') : undefined}
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
            subColor="#10b981"
          />
        </div>

        {/* Price range bar */}
        {high60 != null && low60 != null && positionPct != null ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginBottom: 4 }}>
              <span>低 {low60.toFixed(0)}</span>
              <span style={{ color: '#64748b' }}>60日位階 {positionPct.toFixed(0)}%</span>
              <span>高 {high60.toFixed(0)}</span>
            </div>
            <div style={{ position: 'relative', height: 6, background: '#1e293b', borderRadius: 3 }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, opacity: 0.45,
                width: `${Math.max(2, Math.min(100, positionPct))}%`,
                background: `linear-gradient(90deg, #1d4ed8, ${zoneConf.color})`,
              }} />
              <div style={{
                position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)',
                left: `${Math.max(2, Math.min(98, positionPct))}%`,
                width: 10, height: 10, borderRadius: '50%',
                background: zoneConf.color, boxShadow: `0 0 6px ${zoneConf.color}80`,
              }} />
              {(() => {
                const range = high60 - low60;
                if (range <= 0 || !targetPrice) return null;
                const pos = ((targetPrice - low60) / range) * 100;
                return pos > 3 && pos < 97 ? (
                  <div style={{ position: 'absolute', left: `${pos}%`, top: -2, bottom: -2, width: 1.5, background: '#10b981', opacity: 0.7 }} />
                ) : null;
              })()}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 3, textAlign: 'right' }}>
              ↑ 綠線 = 理想買入目標
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#1e293b', borderRadius: 6, fontSize: 12, color: '#475569', textAlign: 'center' }}>
            等待開盤後掃描更新資料
          </div>
        )}

        {/* Concept tags */}
        {(tags.length > 0 || stock.industry) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {tags.slice(0, 5).map((tag) => (
              <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#1e3a5f', color: '#7dd3fc', border: '1px solid #1e4976' }}>{tag}</span>
            ))}
            {stock.industry && !tags.includes(stock.industry) && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#1e293b', color: '#64748b', border: '1px solid #334155' }}>{stock.industry}</span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: stock.ai_summary || stock.notes ? 10 : 0 }}>
          {trendConf && <StatPill label="趨勢" value={trendConf.label} color={trendConf.color} />}
          {stock.vol_ratio != null && (
            <StatPill label="量比" value={`${stock.vol_ratio.toFixed(1)}x`}
              color={stock.vol_ratio >= 2.5 ? '#fbbf24' : stock.vol_ratio < 0.8 ? '#34d399' : '#94a3b8'} />
          )}
          {matchedSector?.weekly_perf != null && (
            <StatPill label="族群週"
              value={`${matchedSector.weekly_perf >= 0 ? '+' : ''}${matchedSector.weekly_perf.toFixed(1)}%`}
              color={matchedSector.weekly_perf >= 0 ? '#34d399' : '#f87171'} />
          )}
        </div>

        {/* AI summary */}
        {stock.ai_summary && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, padding: '6px 10px', background: '#1e293b', borderRadius: 6, borderLeft: '2px solid #10b981', lineHeight: 1.5 }}>
            🤖 {stock.ai_summary}
          </div>
        )}

        {stock.notes && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>📝 {stock.notes}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
          <a href={`/watchlist/${stock.id}`} style={{ flex: 1, textAlign: 'center', fontSize: 12, padding: '5px 0', borderRadius: 6, background: '#1e293b', color: '#94a3b8', textDecoration: 'none', border: '1px solid #334155' }}>詳情</a>
          <button onClick={handlePause} disabled={loading} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: 'transparent', color: '#64748b', cursor: 'pointer', border: '1px solid #334155' }}>暫停</button>
          <button onClick={handleDelete} disabled={loading} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: 'rgba(239,68,68,.12)', color: '#f87171', cursor: 'pointer', border: '1px solid rgba(239,68,68,.3)' }}>移除</button>
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: '#0f172a', padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? '#475569', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: '#475569' }}>{label} </span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
