import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DashboardData, WatchlistStock } from '../api/types';
import { SectorGroupCard } from '../components/SectorGroup';

// ── Design tokens (mirrors CSS variables) ──
const C = {
  text1: 'var(--text-1)', text2: 'var(--text-2)', text3: 'var(--text-3)',
  border: 'var(--border)', surface: 'var(--surface)',
  green: 'var(--green)', greenBg: 'var(--green-bg)',
  amber: 'var(--amber)', amberBg: 'var(--amber-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)',
  accent: 'var(--accent)', accentBg: 'var(--accent-bg)',
  blue: 'var(--blue)', blueBg: 'var(--blue-bg)',
};

const ZONE = {
  NONE:  { label: '尚未到位', color: 'var(--text-3)',  bg: 'var(--surface-2)', border: 'var(--border)' },
  WATCH: { label: '觀察帶',   color: 'var(--amber)',    bg: 'var(--amber-bg)',  border: '#FCD34D' },
  IDEAL: { label: '理想帶',   color: 'var(--green)',    bg: 'var(--green-bg)',  border: '#6EE7B7' },
  DEEP:  { label: '深度回測', color: 'var(--red)',      bg: 'var(--red-bg)',    border: '#FCA5A5' },
};

function parseTagsArr(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.text3 }}>
      載入中...
    </div>
  );
  if (error) return <div style={{ color: C.red, padding: 20 }}>錯誤：{error}</div>;
  if (!data) return null;

  const { marketState, sectorGroups, alerts, uncategorized } = data;
  const allStocks = [...sectorGroups.flatMap(g => g.stocks), ...uncategorized];

  // Zone distribution
  const zoneCounts = { NONE: 0, WATCH: 0, IDEAL: 0, DEEP: 0 };
  allStocks.forEach(s => { zoneCounts[s.pullback_zone ?? 'NONE']++; });
  const totalStocks = allStocks.length;

  // Stocks closest to ideal zone (among NONE/WATCH)
  const approaching = allStocks
    .filter(s => s.pullback_from_high != null && (s.pullback_zone === 'NONE' || s.pullback_zone === 'WATCH'))
    .map(s => {
      const gapToIdeal = s.pullback_ideal_pct - (s.pullback_from_high ?? 0);
      return { ...s, gapToIdeal };
    })
    .filter(s => s.gapToIdeal > 0 && s.gapToIdeal < 12)
    .sort((a, b) => a.gapToIdeal - b.gapToIdeal)
    .slice(0, 4);

  const lastUpdated = marketState.updated_at
    ? new Date(marketState.updated_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div>
      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text1, letterSpacing: '-0.03em' }}>總覽</h1>
          <p style={{ fontSize: 13, color: C.text3, marginTop: 3 }}>
            動能回測追蹤 · 台股 09:00–13:30 每 5 分鐘掃描
          </p>
        </div>
        {lastUpdated && (
          <div style={{ fontSize: 12, color: C.text3, textAlign: 'right' }}>
            <div>最後更新</div>
            <div style={{ color: C.text2, fontWeight: 500 }}>{lastUpdated}</div>
          </div>
        )}
      </div>

      {/* ── Market + Portfolio stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          label="加權指數"
          value={marketState.taiex_close?.toLocaleString('zh-TW') ?? '–'}
          badge={marketState.taiex_daily_chg != null ? {
            text: `${marketState.taiex_daily_chg >= 0 ? '▲' : '▼'} ${Math.abs(marketState.taiex_daily_chg).toFixed(2)}%`,
            color: marketState.taiex_daily_chg >= 0 ? C.green : C.red,
            bg: marketState.taiex_daily_chg >= 0 ? C.greenBg : C.redBg,
          } : undefined}
        />
        <StatCard
          label="市場波動度"
          value={marketState.volatility_mode === 'HIGH' ? '⚠ 高波動' : '✓ 正常'}
          valueColor={marketState.volatility_mode === 'HIGH' ? C.red : C.green}
          sub={marketState.volatility_mode === 'HIGH'
            ? '回測區間自動擴大 ×1.2'
            : '使用標準回測區間'}
        />
        <StatCard
          label="追蹤股票"
          value={`${totalStocks} 支`}
          sub={alerts.length > 0 ? `${alerts.length} 支進入買入區間` : '目前無股票到位'}
          subColor={alerts.length > 0 ? C.green : undefined}
        />
        <StatCard
          label="AI 分析配額"
          value={`${marketState.ai_calls_today ?? 0} / 10`}
          sub="每日上限 10 次，爆量自動觸發"
          badge={marketState.ai_calls_today >= 8 ? { text: '接近上限', color: C.amber, bg: C.amberBg } : undefined}
        />
      </div>

      {/* ── Zone distribution bar ── */}
      {totalStocks > 0 && (
        <div style={{
          background: C.surface, border: `1px solid var(--border)`,
          borderRadius: 'var(--radius-lg)', padding: '16px 20px',
          marginBottom: 20, boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            區間分布
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['NONE', 'WATCH', 'IDEAL', 'DEEP'] as const).map((z) => {
              const zc = ZONE[z];
              const count = zoneCounts[z];
              return (
                <div key={z} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20,
                  background: count > 0 ? zc.bg : 'var(--surface-2)',
                  border: `1px solid ${count > 0 ? zc.border : 'var(--border)'}`,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? zc.color : C.text3 }}>{count}</span>
                  <span style={{ fontSize: 12, color: count > 0 ? zc.color : C.text3 }}>{zc.label}</span>
                </div>
              );
            })}
            {/* Progress bar */}
            {totalStocks > 0 && (
              <div style={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                {(['NONE', 'WATCH', 'IDEAL', 'DEEP'] as const).map(z => {
                  const w = (zoneCounts[z] / totalStocks) * 100;
                  if (w === 0) return null;
                  return (
                    <div key={z} title={`${ZONE[z].label}: ${zoneCounts[z]} 支`} style={{
                      height: 6, borderRadius: 3, flex: w,
                      background: z === 'NONE' ? 'var(--border-2)' : z === 'WATCH' ? '#FCD34D' : z === 'IDEAL' ? '#34D399' : '#FC8181',
                    }} />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Alerts: stocks in buy zones ── */}
      {alerts.length > 0 && (
        <Section title="⚡ 買入區間警示" sub={`${alerts.length} 支股票進入買入區間`} mb={20}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {alerts.map(stock => <AlertCard key={stock.id} stock={stock} />)}
          </div>
        </Section>
      )}

      {/* ── Approaching ideal zone ── */}
      {approaching.length > 0 && (
        <Section title="🎯 即將到位" sub="距理想帶不足 12%，值得持續關注" mb={20}>
          <div style={{ background: C.surface, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            {approaching.map((stock, i) => {
              const isLast = i === approaching.length - 1;
              const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
              return (
                <a key={stock.id} href={`/watchlist/${stock.id}`} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', textDecoration: 'none',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  background: 'transparent', transition: 'background .12s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: C.text1 }}>{stock.name}</span>
                    <span style={{ fontSize: 12, color: C.text3, marginLeft: 6 }}>{shortCode}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {stock.current_price && (
                      <span style={{ fontSize: 13, color: C.text2 }}>
                        NT${stock.current_price.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}
                      </span>
                    )}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: C.text3 }}>距理想帶</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>
                        還差 {stock.gapToIdeal.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: stock.pullback_zone === 'WATCH' ? '#FCD34D' : 'var(--border-2)',
                    }} />
                  </div>
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Sector groups ── */}
      <Section title="📊 族群監測" sub={sectorGroups.length > 0 ? `${sectorGroups.length} 個族群` : ''} mb={0}>
        {sectorGroups.length === 0 && uncategorized.length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center', color: C.text3,
            border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)',
          }}>
            尚無追蹤股票。
            <a href="/watchlist" style={{ color: C.accent, marginLeft: 4, fontWeight: 500 }}>前往新增</a>
          </div>
        ) : (
          <>
            {sectorGroups.map(g => <SectorGroupCard key={g.sector.id} group={g} />)}
            {uncategorized.length > 0 && (
              <SectorGroupCard group={{
                sector: { id: 'unc', name: '未分類', symbols: JSON.stringify(uncategorized.map(s => s.symbol)), weekly_perf: null, daily_perf: null, vs_taiex_weekly: null, leader_symbol: null, updated_at: null },
                stocks: uncategorized,
              }} />
            )}
          </>
        )}
      </Section>

      {/* ── Volatility explanation ── */}
      <div style={{
        marginTop: 24, padding: '14px 18px', borderRadius: 'var(--radius)',
        background: C.accentBg, border: '1px solid #C7C4FF',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 16 }}>💡</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, marginBottom: 4 }}>關於「波動模式」與「AI 分析」</div>
          <div style={{ fontSize: 12, color: '#4C46BF', lineHeight: 1.7 }}>
            <strong>波動正常</strong>：TAIEX 20日ATR在歷史均值內，系統使用標準門檻（觀察帶 8%、理想帶 15%）。
            若切換為「高波動」，門檻自動擴大 ×1.2，避免在震盪行情誤判。
            <br />
            <strong>AI 分析</strong>：股票進入理想帶且當日爆量（{'>'} 均量 2倍）時，Claude AI 自動分析是主力買盤還是散戶追高，結果推播到 LINE。
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertCard({ stock }: { stock: WatchlistStock & { gapToIdeal?: number } }) {
  const zone = stock.pullback_zone ?? 'NONE';
  const zc = ZONE[zone] ?? ZONE.NONE;
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
  const tags = parseTagsArr(stock.concept_tags);
  const high = stock.high_ref_price ?? stock.day60_high;
  const targetPrice = high ? high * (1 - stock.pullback_ideal_pct / 100) : null;

  return (
    <a href={`/watchlist/${stock.id}`} style={{
      display: 'block', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
      background: C.surface, border: `1px solid ${zc.border}`,
      textDecoration: 'none', boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow .15s, transform .15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text1, fontSize: 15 }}>{stock.name}</div>
          <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{shortCode}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: zc.bg, color: zc.color, border: `1px solid ${zc.border}` }}>
          {zc.label}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <MiniMetric label="現價" value={stock.current_price ? `NT$${stock.current_price.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'} />
        <MiniMetric label="回測" value={stock.pullback_from_high ? `−${stock.pullback_from_high.toFixed(1)}%` : '–'} valueColor={zc.color} />
        <MiniMetric label="60日高" value={high ? `NT$${high.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'} />
        <MiniMetric label="目標價" value={targetPrice ? `NT$${targetPrice.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '–'} valueColor={C.green} />
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {tags.slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: C.blueBg, color: C.blue, border: '1px solid #BAE6FD' }}>{t}</span>
          ))}
        </div>
      )}
    </a>
  );
}

function StatCard({ label, value, valueColor, sub, subColor, badge }: {
  label: string; value: string; valueColor?: string; sub?: string; subColor?: string;
  badge?: { text: string; color: string; bg: string };
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? C.text1, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {badge && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color }}>
          {badge.text}
        </span>
      )}
      {sub && !badge && <div style={{ fontSize: 12, color: subColor ?? C.text3, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function MiniMetric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? C.text1 }}>{value}</div>
    </div>
  );
}

function Section({ title, sub, children, mb }: { title: string; sub?: string; children: React.ReactNode; mb: number }) {
  return (
    <div style={{ marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text1 }}>{title}</h2>
        {sub && <span style={{ fontSize: 12, color: C.text3 }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}
