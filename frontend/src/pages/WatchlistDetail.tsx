// ============================================================
// WatchlistDetail — single stock detail page (Stripe light theme)
// ============================================================

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { WatchlistStock } from '../api/types';
import { PullbackMeter } from '../components/PullbackMeter';

const TREND_LABELS: Record<string, string> = {
  BREAKOUT: '突破 ↑', RUNNING: '上升 ↗', BASING: '整理 →', FALLING: '下跌 ↓',
};
const TREND_COLORS: Record<string, string> = {
  BREAKOUT: '#D97706', RUNNING: 'var(--green)', BASING: 'var(--blue)', FALLING: 'var(--red)',
};

function parseTagsArr(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

export function WatchlistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stock, setStock] = useState<WatchlistStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [editNotes, setEditNotes] = useState('');
  const [editHighRef, setEditHighRef] = useState('');
  const [editWatchPct, setEditWatchPct] = useState('');
  const [editIdealPct, setEditIdealPct] = useState('');
  const [editMaxPct, setEditMaxPct] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.watchlist.get(id)
      .then((s) => {
        setStock(s);
        setEditNotes(s.notes ?? '');
        setEditHighRef(s.high_ref_price?.toString() ?? '');
        setEditWatchPct(String(s.pullback_watch_pct));
        setEditIdealPct(String(s.pullback_ideal_pct));
        setEditMaxPct(String(s.pullback_max_pct));
      })
      .catch(() => navigate('/watchlist'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  async function handleSave() {
    if (!stock) return;
    setSaving(true);
    try {
      const updated = await api.watchlist.update(stock.id, {
        notes: editNotes || undefined,
        high_ref_price: editHighRef ? parseFloat(editHighRef) : undefined,
        pullback_watch_pct: parseFloat(editWatchPct) || stock.pullback_watch_pct,
        pullback_ideal_pct: parseFloat(editIdealPct) || stock.pullback_ideal_pct,
        pullback_max_pct: parseFloat(editMaxPct) || stock.pullback_max_pct,
      });
      setStock(updated);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!stock) return;
    if (!confirm(`確定要移除 ${stock.name}？`)) return;
    await api.watchlist.remove(stock.id);
    navigate('/watchlist');
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>載入中...</div>
  );
  if (!stock) return null;

  const tags = parseTagsArr(stock.concept_tags);
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const daysSince = stock.tracking_since
    ? Math.round((Date.now() - new Date(stock.tracking_since).getTime()) / 86_400_000)
    : null;
  const targetPrice = (stock.high_ref_price ?? stock.day60_high)
    ? (stock.high_ref_price ?? stock.day60_high)! * (1 - stock.pullback_ideal_pct / 100)
    : null;
  const priceChangeFromAdd = stock.price_at_add && stock.current_price
    ? ((stock.current_price - stock.price_at_add) / stock.price_at_add) * 100
    : null;

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Back */}
      <a href="/watchlist" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        ← 返回清單
      </a>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '14px 0 16px' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
            {stock.name}
            <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>{shortCode}</span>
          </h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid #BAE6FD',
              }}>{tag}</span>
            ))}
            {stock.industry && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)',
              }}>{stock.industry}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
            NT${stock.current_price?.toFixed(0) ?? '–'}
          </div>
          {priceChangeFromAdd != null && (
            <div style={{ fontSize: 12, fontWeight: 600, color: priceChangeFromAdd >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {priceChangeFromAdd >= 0 ? '▲' : '▼'} {Math.abs(priceChangeFromAdd).toFixed(1)}% 自加入
            </div>
          )}
          {daysSince != null && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>追蹤 {daysSince} 天</div>}
        </div>
      </div>

      {/* AI summary */}
      {stock.ai_summary && (
        <div style={{
          fontSize: 13, color: 'var(--text-2)', padding: '10px 14px',
          background: 'var(--green-bg)', border: '1px solid #6EE7B7',
          borderLeft: '3px solid var(--green)', borderRadius: 'var(--radius)',
          marginBottom: 16, lineHeight: 1.6,
        }}>
          🤖 {stock.ai_summary}
          {stock.ai_analyzed_at && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
              {new Date(stock.ai_analyzed_at).toLocaleDateString('zh-TW')}
            </span>
          )}
        </div>
      )}

      {/* Key metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <MetricCard label="60日高點" value={stock.day60_high ? `NT$${stock.day60_high.toFixed(0)}` : '–'} sub={stock.day60_high_date ?? undefined} />
        <MetricCard label="理想買入目標" value={targetPrice ? `NT$${targetPrice.toFixed(0)}` : '–'} sub={`−${stock.pullback_ideal_pct}%`} valueColor="var(--green)" />
        <MetricCard label="60日位階" value={stock.price_position_pct != null ? `${stock.price_position_pct.toFixed(0)}%` : '–'} />
        <MetricCard
          label="RS 強度"
          value={stock.rs_score != null ? stock.rs_score.toFixed(0) : '–'}
          sub={stock.rs_score != null ? (stock.rs_score >= 80 ? '強勢股' : stock.rs_score >= 60 ? '中性' : '弱勢') : undefined}
          valueColor={stock.rs_score != null ? (stock.rs_score >= 80 ? 'var(--green)' : stock.rs_score >= 60 ? 'var(--text-2)' : 'var(--red)') : undefined}
        />
      </div>

      {/* Technical panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14, boxShadow: 'var(--shadow-sm)' }}>
        <SectionTitle>技術狀態</SectionTitle>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <StatRow label="趨勢狀態"
            value={stock.trend_state ? TREND_LABELS[stock.trend_state] ?? stock.trend_state : '–'}
            color={stock.trend_state ? TREND_COLORS[stock.trend_state] : undefined}
          />
          <StatRow label="量比（今日/均量）"
            value={stock.vol_ratio != null ? `${stock.vol_ratio.toFixed(1)}×` : '–'}
            color={stock.vol_ratio != null && stock.vol_ratio >= 2.5 ? 'var(--amber)' : undefined}
          />
          <StatRow label="60日低點" value={stock.day60_low ? `NT$${stock.day60_low.toFixed(0)}` : '–'} />
        </div>

        <PullbackMeter stock={stock} />
      </div>

      {/* Settings panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14, boxShadow: 'var(--shadow-sm)' }}>
        <SectionTitle>回測設定</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>開始留意 %</label>
            <input style={inputStyle} type="number" value={editWatchPct} onChange={(e) => setEditWatchPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--green)' }}>理想買入 %</label>
            <input style={inputStyle} type="number" value={editIdealPct} onChange={(e) => setEditIdealPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--red)' }}>極限容忍 %</label>
            <input style={inputStyle} type="number" value={editMaxPct} onChange={(e) => setEditMaxPct(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>備註</label>
          <input
            style={inputStyle}
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="追蹤原因..."
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>參考高點覆寫（NT$）</label>
          <input
            style={{ ...inputStyle, width: 180 }}
            type="number"
            value={editHighRef}
            onChange={(e) => setEditHighRef(e.target.value)}
            placeholder="留空 = 自動60日高點"
          />
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          padding: '8px 20px', borderRadius: 'var(--radius)', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
        }}>{saving ? '儲存中...' : '儲存變更'}</button>
      </div>

      {/* Tracking info */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, display: 'flex', gap: 16 }}>
        {stock.tracking_since && <span>加入日期：{stock.tracking_since.slice(0, 10)}</span>}
        {stock.price_at_add && <span>加入時價格：NT${stock.price_at_add.toFixed(0)}</span>}
        {stock.last_notified_at && <span>上次推播：{new Date(stock.last_notified_at).toLocaleDateString('zh-TW')}</span>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => api.watchlist.update(stock.id, { active: 0 }).then(() => navigate('/watchlist'))}
          style={{
            padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: 13,
          }}
        >暫停通知</button>
        <button onClick={handleDelete} style={{
          padding: '8px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
          background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #FCA5A5', fontSize: 13,
        }}>移除追蹤</button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: valueColor ?? 'var(--text-1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function StatRow({ label, value, color, valueColor }: { label: string; value: string; color?: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color ?? valueColor ?? 'var(--text-1)' }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block', fontWeight: 500,
};
