// ============================================================
// AddStockForm — add stock with auto-name lookup (spec §7.4)
// ============================================================

import { useState } from 'react';
import { api } from '../api/client';
import type { AddStockPayload } from '../api/types';

interface Props {
  onAdded: () => void;
  onCancel: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#2d3748',
  border: '1px solid #4a5568',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 14,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#a0aec0',
  marginBottom: 4,
  display: 'block',
};

export function AddStockForm({ onAdded, onCancel }: Props) {
  const [symbol, setSymbol] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [exchange, setExchange] = useState<'TSE' | 'OTC'>('TSE');
  const [notes, setNotes] = useState('');
  const [watchPct, setWatchPct] = useState('8');
  const [idealPct, setIdealPct] = useState('13');
  const [maxPct, setMaxPct] = useState('20');
  const [highRefPrice, setHighRefPrice] = useState('');
  const [highRefDate, setHighRefDate] = useState('');
  const [cooldownHrs, setCooldownHrs] = useState('4');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleLookup() {
    if (!symbol.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    try {
      const result = await api.watchlist.lookup(symbol.trim());
      setResolvedName(result.name);
      setExchange(result.exchange);
    } catch (e: unknown) {
      setLookupError((e as Error).message ?? '查詢失敗');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;

    setSubmitLoading(true);
    setSubmitError('');

    const payload: AddStockPayload = {
      symbol: symbol.trim(),
      exchange,
      notes: notes || undefined,
      pullback_watch_pct: parseFloat(watchPct) || 8,
      pullback_ideal_pct: parseFloat(idealPct) || 13,
      pullback_max_pct: parseFloat(maxPct) || 20,
      notify_cooldown_hrs: parseInt(cooldownHrs) || 4,
    };

    if (resolvedName) payload.name = resolvedName;
    if (highRefPrice) payload.high_ref_price = parseFloat(highRefPrice);
    if (highRefDate) payload.high_ref_date = highRefDate;

    try {
      await api.watchlist.add(payload);
      onAdded();
    } catch (e: unknown) {
      setSubmitError((e as Error).message ?? '新增失敗');
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 16, marginBottom: 4 }}>新增追蹤股票</h3>

      {/* Symbol + lookup */}
      <div>
        <label style={labelStyle}>股票代號 *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="e.g. 2330"
            value={symbol}
            onChange={(e) => { setSymbol(e.target.value); setResolvedName(''); }}
            onBlur={handleLookup}
          />
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value as 'TSE' | 'OTC')}
            style={{ ...inputStyle, width: 80 }}
          >
            <option value="TSE">上市</option>
            <option value="OTC">上櫃</option>
          </select>
        </div>
        {lookupLoading && <div style={{ fontSize: 12, color: '#718096', marginTop: 4 }}>查詢中...</div>}
        {lookupError && <div style={{ fontSize: 12, color: '#fc8181', marginTop: 4 }}>{lookupError}</div>}
        {resolvedName && <div style={{ fontSize: 12, color: '#68d391', marginTop: 4 }}>✓ {resolvedName}</div>}
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>為什麼追蹤</label>
        <input
          style={inputStyle}
          placeholder="追蹤原因 / 備忘"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Pullback settings */}
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>回測設定（留空使用預設值）</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>開始留意 %</label>
            <input style={inputStyle} type="number" value={watchPct} onChange={(e) => setWatchPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>理想買入 %</label>
            <input style={inputStyle} type="number" value={idealPct} onChange={(e) => setIdealPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>極限容忍 %</label>
            <input style={inputStyle} type="number" value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
          </div>
        </div>
      </div>

      {/* High ref override */}
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>參考高點（選填，留空自動抓60日高點）</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>高點價格</label>
            <input style={inputStyle} type="number" placeholder="NT$" value={highRefPrice} onChange={(e) => setHighRefPrice(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>高點日期</label>
            <input style={inputStyle} type="date" value={highRefDate} onChange={(e) => setHighRefDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Cooldown */}
      <div>
        <label style={labelStyle}>通知冷卻時間（小時）</label>
        <input style={{ ...inputStyle, width: 100 }} type="number" value={cooldownHrs} onChange={(e) => setCooldownHrs(e.target.value)} />
      </div>

      {submitError && <div style={{ fontSize: 13, color: '#fc8181' }}>{submitError}</div>}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={submitLoading || !symbol.trim()}
          style={{
            padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
            background: submitLoading ? '#2d3748' : '#3182ce',
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
          }}
        >
          {submitLoading ? '新增中...' : '送出'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
            background: 'transparent', color: '#a0aec0', border: '1px solid #4a5568', fontSize: 14,
          }}
        >取消</button>
      </div>
    </form>
  );
}
