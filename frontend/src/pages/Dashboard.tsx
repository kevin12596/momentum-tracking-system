// ============================================================
// Dashboard — market overview + sector groups (redesigned)
// ============================================================

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DashboardData } from '../api/types';
import { SectorGroupCard } from '../components/SectorGroup';

const ZONE_COLOR: Record<string, string> = {
  NONE: '#475569', WATCH: '#f59e0b', IDEAL: '#10b981', DEEP: '#ef4444',
};
const ZONE_LABEL: Record<string, string> = {
  NONE: '尚未到位', WATCH: '觀察帶', IDEAL: '理想帶', DEEP: '深度回測',
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard.get()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#475569', padding: 40, textAlign: 'center' }}>載入中...</div>;
  if (error) return <div style={{ color: '#f87171', padding: 20 }}>錯誤：{error}</div>;
  if (!data) return null;

  const { marketState, sectorGroups, alerts, uncategorized } = data;
  const totalStocks = sectorGroups.reduce((n, g) => n + g.stocks.length, 0) + uncategorized.length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Market state bar ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 1, background: '#1e293b', borderRadius: 10, overflow: 'hidden', marginBottom: 24,
      }}>
        <MarketTile
          label="加權指數"
          value={marketState.taiex_close?.toLocaleString('zh-TW') ?? '–'}
          sub={marketState.taiex_daily_chg != null
            ? `${marketState.taiex_daily_chg >= 0 ? '▲' : '▼'} ${Math.abs(marketState.taiex_daily_chg).toFixed(2)}%`
            : undefined}
          subColor={marketState.taiex_daily_chg != null
            ? (marketState.taiex_daily_chg >= 0 ? '#34d399' : '#f87171')
            : undefined}
        />
        <MarketTile
          label="波動模式"
          value={marketState.volatility_mode === 'HIGH' ? '🔴 高波動' : '🟢 正常'}
          valueColor={marketState.volatility_mode === 'HIGH' ? '#f87171' : '#34d399'}
        />
        <MarketTile
          label="AI 分析今日"
          value={`${marketState.ai_calls_today ?? 0} / 10 次`}
          sub="每日上限 10 次"
        />
        <MarketTile
          label="追蹤股票"
          value={`${totalStocks} 支`}
          sub={alerts.length > 0 ? `${alerts.length} 支到位` : '無警示'}
          subColor={alerts.length > 0 ? '#10b981' : undefined}
        />
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionTitle icon="⚡" title="買入區間警示" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {alerts.map((stock) => {
              const zone = stock.pullback_zone ?? 'NONE';
              const color = ZONE_COLOR[zone];
              const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
              return (
                <a key={stock.id} href={`/watchlist/${stock.id}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8, textDecoration: 'none',
                  background: '#0f172a', border: `1px solid ${color}40`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{stock.name}</div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{shortCode}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color, fontWeight: 700 }}>
                      {ZONE_LABEL[zone]}
                    </div>
                    {stock.pullback_from_high != null && (
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                        −{stock.pullback_from_high.toFixed(1)}%
                      </div>
                    )}
                    {stock.current_price && (
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        NT${stock.current_price.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sector groups ── */}
      <SectionTitle icon="📊" title="族群監測" />
      {sectorGroups.length === 0 && uncategorized.length === 0 ? (
        <div style={{
          padding: '32px 20px', textAlign: 'center', color: '#475569',
          border: '1px dashed #1e293b', borderRadius: 10,
        }}>
          尚無追蹤股票。
          <a href="/watchlist" style={{ color: '#60a5fa', marginLeft: 4 }}>前往追蹤清單新增</a>
        </div>
      ) : (
        <>
          {sectorGroups.map((group) => (
            <SectorGroupCard key={group.sector.id} group={group} />
          ))}
          {uncategorized.length > 0 && (
            <SectorGroupCard group={{
              sector: {
                id: 'uncategorized', name: '未分類族群',
                symbols: JSON.stringify(uncategorized.map((s) => s.symbol)),
                weekly_perf: null, daily_perf: null,
                vs_taiex_weekly: null, leader_symbol: null, updated_at: null,
              },
              stocks: uncategorized,
            }} />
          )}
        </>
      )}

      {/* ── AI analysis info box ── */}
      <div style={{
        marginTop: 24, padding: '14px 16px', borderRadius: 10,
        background: '#0f172a', border: '1px solid #1e293b',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>🤖 AI 分析說明</div>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
          當股票進入<span style={{ color: '#10b981' }}>理想帶</span>或<span style={{ color: '#ef4444' }}>深度回測</span>，
          且當日成交量超過 20 日均量 <strong style={{ color: '#94a3b8' }}>2 倍</strong>（爆量），系統會自動呼叫 Claude AI 分析：
          <br />• 判斷是主力買盤、散戶追高、還是消息驅動
          <br />• 每日最多分析 10 支股票（避免費用過高）
          <br />• 分析結果會透過 LINE 推播，並顯示在股票卡片的 AI 摘要欄位
        </div>
      </div>
    </div>
  );
}

function MarketTile({ label, value, valueColor, sub, subColor }: {
  label: string; value: string; valueColor?: string; sub?: string; subColor?: string;
}) {
  return (
    <div style={{ background: '#0f172a', padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor ?? '#e2e8f0' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor ?? '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
    </div>
  );
}
