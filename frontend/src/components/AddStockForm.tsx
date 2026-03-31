// ============================================================
// AddStockForm — add stock with auto-name lookup (Stripe light theme)
// ============================================================

import { useState } from 'react';
import { api } from '../api/client';
import type { AddStockPayload } from '../api/types';

interface Props { onAdded: (id: string) => void; onCancel: () => void; }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-2)', marginBottom: 4, display: 'block', fontWeight: 500,
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
    setLookupLoading(true); setLookupError('');
    try {
      const result = await api.watchlist.lookup(symbol.trim());
      setResolvedName(result.name);
      setExchange(result.exchange);
    } catch (e: unknown) {
      setLookupError((e as Error).message ?? '查詢失敗');
    } finally { setLookupLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setSubmitLoading(true); setSubmitError('');
    const payload: AddStockPayload = {
      symbol: symbol.trim(), exchange,
      notes: notes || undefined,
      pullback_watch_pct: parseFloat(watchPct) || 8,
      pullback_ideal_pct: parseFloat(idealPct) || 13,
      pullback_max_pct: parseFloat(maxPct) || 20,
      notify_cooldown_hrs: parseInt(cooldownHrs) || 4,
    };
    if (resolvedName) payload.name = resolvedName;
    if (highRefPrice) payload.high_ref_price = parseFloat(highRefPrice);
    if (highRefDate) payload.high_ref_date = highRefDate;
    try { const stock = await api.watchlist.add(payload); onAdded(stock.id); }
    catch (e: unknown) { setSubmitError((e as Error).message ?? '新增失敗'); }
    finally { setSubmitLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ marginBottom: 4 }}>
        <h3 style={{ color: 'var(--text-1)', fontSize: 16, fontWeight: 700 }}>新增追蹤股票</h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>輸入代號後點擊空白處，系統自動查詢股票名稱</p>
      </div>

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
        {lookupLoading && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>查詢中...</div>}
        {lookupError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{lookupError}</div>}
        {resolvedName && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>✓ {resolvedName}</div>}
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>追蹤原因</label>
        <input style={inputStyle} placeholder="為什麼追蹤這支股票" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Pullback settings */}
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>回測設定</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>開始留意 %</label>
            <input style={inputStyle} type="number" value={watchPct} onChange={(e) => setWatchPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>理想買入 %</label>
            <input style={inputStyle} type="number" value={idealPct} onChange={(e) => setIdealPct(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>極限容忍 %</label>
            <input style={inputStyle} type="number" value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
          從60日高點回測至「理想買入%」時系統推播 LINE 通知，超過「極限容忍%」視為趨勢破壞
        </div>
      </div>

      {/* High ref override */}
      <div>
        <label style={{ ...labelStyle, marginBottom: 8 }}>參考高點（選填，留空自動抓60日高點）</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>高點價格</label>
            <input style={inputStyle} type="number" placeholder="NT$" value={highRefPrice} onChange={(e) => setHighRefPrice(e.target.value)} />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11, color: 'var(--text-3)' }}>高點日期</label>
            <input style={inputStyle} type="date" value={highRefDate} onChange={(e) => setHighRefDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Cooldown */}
      <div>
        <label style={labelStyle}>通知冷卻時間（小時）</label>
        <input style={{ ...inputStyle, width: 100 }} type="number" value={cooldownHrs} onChange={(e) => setCooldownHrs(e.target.value)} />
      </div>

      {submitError && (
        <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 'var(--radius)', border: '1px solid #FCA5A5' }}>
          {submitError}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button
          type="submit"
          disabled={submitLoading || !symbol.trim()}
          style={{
            padding: '8px 20px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: submitLoading || !symbol.trim() ? 'var(--border)' : 'var(--accent)',
            color: submitLoading || !symbol.trim() ? 'var(--text-3)' : '#fff',
            border: 'none', fontSize: 13, fontWeight: 600,
          }}
        >{submitLoading ? '新增中...' : '確認新增'}</button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 20px', borderRadius: 'var(--radius)', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', fontSize: 13,
          }}
        >取消</button>
      </div>
    </form>
  );
}
