// ============================================================
// WatchlistDetail — single stock detail page (spec §7.1)
// ============================================================

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { WatchlistStock } from '../api/types';
import { PullbackMeter } from '../components/PullbackMeter';

const TREND_COLORS: Record<string, string> = {
  BREAKOUT: '#f6e05e',
  RUNNING: '#68d391',
  BASING: '#90cdf4',
  FALLING: '#fc8181',
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.watchlist.get(id)
      .then((s) => {
        setStock(s);
        setEditNotes(s.notes ?? '');
        setEditHighRef(s.high_ref_price?.toString() ?? '');
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
      });
      setStock(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!stock) return;
    if (!confirm(`確定要移除 ${stock.name}？`)) return;
    await api.watchlist.remove(stock.id);
    navigate('/watchlist');
  }

  if (loading) return <div style={{ color: '#718096', padding: 20 }}>載入中...</div>;
  if (!stock) return null;

  const tags = parseTagsArr(stock.concept_tags);
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const daysSince = stock.tracking_since
    ? Math.round((Date.now() - new Date(stock.tracking_since).getTime()) / 86_400_000)
    : null;

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Back */}
      <a href="/watchlist" style={{ fontSize: 13, color: '#718096', textDecoration: 'none' }}>
        ← 返回清單
      </a>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '12px 0 16px' }}>
        <div>
          <h1 style={{ fontSize: 22, color: '#e2e8f0', marginBottom: 4 }}>
            {stock.name}
            <span style={{ fontSize: 14, color: '#718096', marginLeft: 8 }}>（{shortCode}）</span>
          </h1>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: '#2d3748', color: '#90cdf4', border: '1px solid #4a5568',
              }}>{tag}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>
            NT${stock.current_price?.toFixed(0) ?? '–'}
          </div>
          {daysSince != null && (
            <div style={{ fontSize: 12, color: '#718096' }}>追蹤 {daysSince} 天</div>
          )}
        </div>
      </div>

      {/* AI summary */}
      {stock.ai_summary && (
        <div style={{
          fontSize: 13, color: '#a0aec0', padding: '8px 12px',
          background: '#1a202c', border: '1px solid #2d3748', borderRadius: 6, marginBottom: 16,
          fontStyle: 'italic',
        }}>
          {stock.ai_summary}
        </div>
      )}

      {/* Technical panel */}
      <div style={{
        background: '#1a202c', border: '1px solid #2d3748', borderRadius: 8,
        padding: 16, marginBottom: 16,
      }}>
        <h2 style={sectionTitle}>技術狀態</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <StatRow label="60日高點" value={stock.day60_high ? `NT$${stock.day60_high.toFixed(0)}` : '–'} />
          <StatRow label="60日低點" value={stock.day60_low ? `NT$${stock.day60_low.toFixed(0)}` : '–'} />
          <StatRow label="高點日期" value={stock.day60_high_date ?? '–'} />
          <StatRow label="60日位階" value={stock.price_position_pct != null ? `${stock.price_position_pct.toFixed(0)}%` : '–'} />
          <StatRow
            label="趨勢狀態"
            value={stock.trend_state ?? '–'}
            color={stock.trend_state ? TREND_COLORS[stock.trend_state] : undefined}
          />
          <StatRow
            label="量比"
            value={stock.vol_ratio != null ? `${stock.vol_ratio.toFixed(1)}x` : '–'}
            color={stock.vol_ratio != null && stock.vol_ratio >= 2.5 ? '#f6e05e' : undefined}
          />
        </div>

        <PullbackMeter stock={stock} />
      </div>

      {/* Settings panel */}
      <div style={{
        background: '#1a202c', border: '1px solid #2d3748', borderRadius: 8,
        padding: 16, marginBottom: 16,
      }}>
        <h2 style={sectionTitle}>設定</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <StatRow label="留意回測" value={`${stock.pullback_watch_pct}%`} />
          <StatRow label="理想買入" value={`${stock.pullback_ideal_pct}%`} />
          <StatRow label="極限容忍" value={`${stock.pullback_max_pct}%`} />
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

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>參考高點覆寫（NT$）</label>
          <input
            style={{ ...inputStyle, width: 160 }}
            type="number"
            value={editHighRef}
            onChange={(e) => setEditHighRef(e.target.value)}
            placeholder="留空=自動60日高"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            background: '#3182ce', color: '#fff', border: 'none', fontSize: 13,
          }}
        >{saving ? '儲存中...' : '儲存'}</button>
      </div>

      {/* Danger zone */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => api.watchlist.update(stock.id, { active: 0 }).then(() => navigate('/watchlist'))}
          style={{
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            background: 'transparent', color: '#a0aec0', border: '1px solid #4a5568', fontSize: 13,
          }}
        >暫停通知</button>
        <button
          onClick={handleDelete}
          style={{
            padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
            background: 'transparent', color: '#fc8181', border: '1px solid #fc818140', fontSize: 13,
          }}
        >移除追蹤</button>
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#718096' }}>{label}</div>
      <div style={{ fontSize: 14, color: color ?? '#e2e8f0', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#718096',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: '#a0aec0', marginBottom: 4, display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: '#2d3748', border: '1px solid #4a5568',
  borderRadius: 4, color: '#e2e8f0', fontSize: 13, outline: 'none',
};
