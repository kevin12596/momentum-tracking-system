# momentum-tracking-system 專案文件

## 概覽

台灣動能股票追蹤系統。追蹤用戶自選的 ~15 支台股，計算技術指標，透過 LINE 推送買點通知。

| 項目 | 說明 |
|------|------|
| **架構** | Cloudflare Workers + D1 (SQLite) + Pages (React) |
| **部署** | push to `main` → GitHub Actions 自動部署 |
| **Worker URL** | `https://momentum-api.kvn-liang.workers.dev` |
| **Repo** | `kevin12596/momentum-tracking-system` |
| **Cron** | `30 7 * * 1-5` (UTC) = 台灣 15:30，每個交易日收盤後執行 |

---

## 目錄結構

```
momentum-tracking-system/
├── workers/api/
│   ├── src/
│   │   ├── index.ts          # Worker 入口：fetch() 路由 + scheduled() cron
│   │   ├── yahoo.ts          # 所有資料來源：TWSE / TPEX / stooq / MIS
│   │   ├── indicators.ts     # 技術指標計算：day60High、pullbackPct、ATR20
│   │   ├── db.ts             # D1 CRUD：writebackIndicators()
│   │   ├── notifications.ts  # LINE push + n8n relay
│   │   ├── claude.ts         # Claude AI：概念標籤、量能分析
│   │   ├── line-webhook.ts   # LINE Webhook 接收
│   │   ├── types.ts          # TypeScript 型別定義
│   │   └── routes/
│   │       ├── watchlist.ts  # /api/watchlist CRUD + quickScan()
│   │       ├── sectors.ts    # /api/sectors
│   │       ├── dashboard.ts  # /api/dashboard
│   │       └── market.ts     # /api/market-state
│   └── wrangler.toml         # Cloudflare 設定、cron、D1 binding
├── frontend/
│   └── src/App.tsx           # React 前端（單頁應用）
├── migrations/
│   └── 0001_init.sql         # D1 Schema
└── PROJECT.md                # 本文件
```

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/watchlist` | 取得全部追蹤股票 |
| GET | `/api/watchlist?all=1` | 包含暫停/移除的股票 |
| GET | `/api/watchlist/:id` | 取得單筆 |
| POST | `/api/watchlist` | 新增股票（自動執行 quickScan） |
| PUT | `/api/watchlist/:id` | 修改設定（若改 high_ref_price 會重新 quickScan） |
| DELETE | `/api/watchlist/:id` | 軟刪除（active=0） |
| GET | `/api/watchlist/lookup?symbol=2330` | 查詢股票名稱/交易所 |
| GET | `/api/sectors` | 取得所有族群 |
| POST/PUT/DELETE | `/api/sectors` | 管理族群 |
| GET | `/api/dashboard` | 儀表板摘要資料 |
| GET | `/api/market-state` | TAIEX + 波動模式 |
| **POST** | **`/api/scan`** | **手動觸發全股票掃描（回傳 JSON 摘要）** |
| GET | `/api/debug?symbol=2330.TW` | 測試單一股票資料來源 |
| POST | `/webhook/line` | LINE Webhook |

---

## 資料流程

### 新增股票時（POST /api/watchlist）

```
1. lookupStockName()      → 取得中文股票名稱
2. fetchQuote()           → TW 股票固定回傳 price=0（等歷史資料）
3. insertWatchlistStock() → 寫入 DB（current_price = 0）
4. await quickScan()      → 同步拉 65 筆歷史資料並計算指標
5. enrichConceptTags()    → 非同步 Claude AI 打標籤
6. 回傳完整 stock 物件
```

### 每日 Cron（15:30 台灣時間）

```
runPriceMonitor()
├── 取得 TAIEX 資料 → 更新 volatilityMode（NORMAL / HIGH）
├── Promise.all(stocks.map(processStock))   ← 全部並行，避免 30s timeout
│   └── processStock(stock)
│       ├── fetchStockData(symbol)
│       │   ├── fetchHistory() → TWSE/TPEX/stooq/Yahoo
│       │   └── 若 history < 20 bars → return null
│       ├── 若 null → fetchMisPrice() → 只更新 current_price
│       ├── calcIndicators()  → day60High、pullbackPct、ATR20、vol_ratio
│       ├── calcTrendState()  → FALLING/BASING/BREAKOUT/RUNNING
│       ├── writebackIndicators() → 更新 D1
│       └── evaluateTriggers() → 發 LINE 通知
├── isWeeklyRefreshTime() → 週一更新 AI 概念標籤
└── runMonthlyReviewCheck() → 月度回顧通知
```

---

## 股價資料來源

### 交易所對應

| 交易所 | 股票後綴 | API |
|--------|----------|-----|
| TSE 上市 | `.TW` | TWSE STOCK_DAY |
| OTC 上櫃 | `.TWO` | TPEX st43 |

### TWSE STOCK_DAY（月資料）

```
URL: https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY
     ?stockNo={code}&date={YYYYMMDD01}&response=json

回應欄位（data 陣列中每個 row）：
  row[0] = 日期（ROC 年/月/日，例：115/04/03）
  row[1] = 成交量
  row[2] = 成交金額
  row[3] = 開盤價
  row[4] = 最高價
  row[5] = 最低價
  row[6] = 收盤價

日期解析：parseInt(parts[0]) + 1911 → 西元年
```

### TPEX st43（月資料）

```
URL: https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/
     st43_result.php?l=zh-tw&d={ROC年}/{MM}&stkno={code}&s=0,asc,0&output=json

回應欄位：aaData 陣列，欄位順序與 TWSE 相同
ROC 年計算：d.getFullYear() - 1911
```

### Fallback 順序

```
fetchHistory(symbol, days=65):
  1. TWSE STOCK_DAY × 4 個月合併（primary exchange）
     → isFresh = length >= 20 AND staleness < 7 天
  2. TWSE/TPEX × 4 個月合併（alt exchange，處理 TSE↔OTC 分類錯誤）
  3. stooq.com CSV：https://stooq.com/q/d/l/?s={code}.tw&i=d
     → length >= 5 AND staleness < 7 天
  4. Yahoo Finance library（通常被擋）
  5. Yahoo Finance 直接 HTTP（備用）
  6. 回傳以上候選中最新的一筆（不管 isFresh）

processStock() 若 fetchStockData() 回傳 null（0 bars）：
  7. TWSE MIS API（price-only，不更新 day60_high 等指標）
     URL: https://mis.twse.com.tw/stock/api/getStockInfo.asp
          ?json=1&delay=0&ex_ch=tse_{code}.tw%7Cotc_{code}.tw
     z 欄位 = 當日收盤價；y 欄位 = 前日收盤（備用）
     適用：興櫃股、stooq 未收錄、短暫停牌
```

---

## D1 資料庫 Schema

### watchlist

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | TEXT PK | UUID（randomblob） |
| `symbol` | TEXT | Yahoo 格式，例：`2330.TW`、`3037.TWO` |
| `name` | TEXT | 中文名稱 |
| `exchange` | TEXT | `TSE` 或 `OTC` |
| `price_at_add` | REAL | 新增當下的股價 |
| `high_ref_price` | REAL | **使用者手動設定的參考高點**（覆蓋 day60_high 計算） |
| `high_ref_date` | TEXT | 參考高點日期 |
| `pullback_watch_pct` | REAL | 觀察帶回測 %（預設 8%） |
| `pullback_ideal_pct` | REAL | 理想帶回測 %（預設 13%） |
| `pullback_max_pct` | REAL | 最大容忍回測 %（預設 20%） |
| `current_price` | REAL | 每日更新的收盤價 |
| `price_updated_at` | TEXT | 最後更新時間 |
| `day60_high` | REAL | 60 日最高收盤價（或 high_ref_price） |
| `day60_low` | REAL | 60 日最低收盤價 |
| `day60_high_date` | TEXT | 60 日高點日期 |
| `pullback_from_high` | REAL | 從高點回測 % |
| `pullback_zone` | TEXT | `WATCH`/`IDEAL`/`DEEP`/`NONE` |
| `trend_state` | TEXT | `FALLING`/`BASING`/`BREAKOUT`/`RUNNING` |
| `vol_ratio` | REAL | 今日量 / 20 日均量 |
| `price_position_pct` | REAL | 在 60日高低區間的位置 % |
| `active` | INTEGER | 1=追蹤中，0=已停止 |
| `notify_cooldown_hrs` | INTEGER | 通知冷卻時數（預設 4hr） |
| `concept_tags` | TEXT | JSON array，AI 生成概念標籤 |

### sector_groups

族群管理，`symbols` 為 JSON array（例：`["2330.TW","2303.TW"]`）。

### notification_log

記錄所有已發送通知，`trigger_type` 包含：
`PULLBACK_WATCH` / `PULLBACK_IDEAL` / `PULLBACK_DEEP` / `SECTOR_ACTIVE` / `VOLUME_SPIKE` / `AI_ANALYSIS` / `MONTHLY_REVIEW`

---

## 關鍵實作細節

### 時區（必看）

Cloudflare Workers 跑 UTC。所有 TWSE 月份計算都必須先轉台灣時間：

```typescript
const twNow  = new Date(Date.now() + 8 * 60 * 60 * 1000);
const twYear  = twNow.getUTCFullYear();
const twMonth = twNow.getUTCMonth(); // 0-based

// 月份偏移（4 個月往回）
const d = new Date(twYear, twMonth - offset, 1);
// JavaScript 會自動處理負數月份，new Date(2026, -1, 1) = Dec 2025 ✓
```

### Worker HTTP 30 秒上限

`/api/scan` 必須 `Promise.all()` 並行：

```typescript
await Promise.all(
  stocks.map(stock =>
    processStock(stock, ...).catch(err => console.error(...))
  )
);
// Sequential loop × 15 支 ≈ 195s → timeout
// Promise.all × 15 支 ≈ slowest single stock（通常 < 10s）
```

### `writebackIndicators` 的 CASE WHEN 保護

`current_price` 只在有正值時才更新，避免錯誤資料蓋掉正確值：

```sql
current_price = CASE WHEN ? > 0 THEN ? ELSE current_price END
```

但 `day60_high` **無此保護**，每次掃描都會無條件覆蓋（已知問題，見下方）。

---

## 已知問題

### 1. day60_high 可能被劣化資料覆蓋

**症狀**：`day60_high` 顯示不合理的低值（例：現價 624，60日高點 100）。

**原因**：`writebackIndicators` 每次都無條件寫入 `day60_high`。若某次 `fetchHistory` 拿到品質差的資料（stooq 資料不完整、剛上市股票只有幾筆），計算出的 `day60_high` 會蓋掉原本正確的值。

**建議修法**：
```typescript
// 只在新值合理時才更新 day60_high
day60_high = CASE
  WHEN ? > (SELECT day60_high FROM watchlist WHERE id = ?) * 0.8
  THEN ?
  ELSE day60_high
END
```

### 2. 3211.TW / 7892.TW 無法取得歷史資料

**症狀**：TWSE STOCK_DAY、TPEX st43、stooq 均回傳 0 bars。

**已加入**：TWSE MIS API fallback（`fetchMisPrice`），只更新 `current_price`，不動指標。

**待確認**：下次 cron 後在 Cloudflare Dashboard logs 查是否出現 `[MIS fallback]` 訊息。

### 3. quickScan 不包含 MIS fallback

`quickScan`（新增股票時觸發）只呼叫 `fetchStockData()`，若回傳 null 就直接 return，不會嘗試 MIS API。導致剛新增的問題股票 `current_price` 仍為 0。

---

## 本機開發

### 前置需求

- Node.js 18+
- Wrangler CLI（`npm install -g wrangler`）
- Cloudflare 帳號登入（`wrangler login`）

### 啟動

```bash
# 安裝依賴
npm install
cd workers/api && npm install

# 本機 Worker（需 wrangler login）
cd workers/api
npx wrangler dev

# 前端
cd frontend
npm run dev
```

### 部署

```bash
# 直接 push main 觸發 GitHub Actions 自動部署
git add <files>
git commit -m "fix: ..."
git push origin main
```

### 手動觸發掃描

```bash
curl -X POST https://momentum-api.kvn-liang.workers.dev/api/scan
```

### 查看 Worker Logs

Cloudflare Dashboard → Workers & Pages → `momentum-api` → Logs

---

## 環境變數（Cloudflare Secrets）

| 名稱 | 說明 |
|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API token |
| `LINE_USER_ID` | 接收通知的 LINE user ID |
| `CLAUDE_API_KEY` | Anthropic API key（概念標籤 + 量能分析） |
| `N8N_WEBHOOK_URL` | （選用）n8n relay webhook |

設定方式：`wrangler secret put LINE_CHANNEL_ACCESS_TOKEN`

---

## Git 工作流程

- 開發分支：`claude/momentum-stock-tracker-XNHnr`（Claude Code 使用）
- 正式部署：push to `main`
- **不主動建立 PR**（除非明確要求）
