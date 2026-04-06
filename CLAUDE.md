# momentum-tracking-system — CLAUDE.md

## 專案概覽
台灣動能股票追蹤系統。追蹤用戶自選的 ~15 支台股，計算回測指標，透過 LINE 推送通知。

**架構**: Cloudflare Workers + D1 + Pages
**部署**: push to `main` → GitHub Actions 自動部署
**Worker URL**: `https://momentum-api.kvn-liang.workers.dev`
**Repo**: `kevin12596/momentum-tracking-system`

---

## Git 工作流程
- 開發分支：`claude/momentum-stock-tracker-XNHnr`
- **不得主動建立 PR**（除非用戶明確要求）
- commit 後立即 push，不留未推送的 commit
- staged 改動只加必要的檔案，不用 `git add -A`

---

## 台股資料來源

### 官方 API
| 交易所 | 股票格式 | API |
|--------|----------|-----|
| TSE 上市 | `{code}.TW` | TWSE STOCK_DAY: `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo={code}&date={YYYYMMDD01}&response=json` |
| OTC 上櫃 | `{code}.TWO` | TPEX st43: `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d={ROC年}/{MM}&stkno={code}&output=json` |

### TWSE / TPEX 回應欄位（兩者共用）
`row[0]`=日期(ROC年/月/日) `row[1]`=成交量 `row[3]`=開 `row[4]`=高 `row[5]`=低 `row[6]`=收

### Fallback 順序（`fetchHistory` → `processStock`）
1. TWSE/TPEX primary exchange
2. Alt exchange（TSE↔OTC swap，處理分類錯誤的股票）
3. stooq.com CSV：`https://stooq.com/q/d/l/?s={code}.tw&i=d`
4. Yahoo Finance（通常被擋）
5. 回傳所有來源中最新的一筆

若以上全部回傳 0 bars（興櫃股、stooq 未收錄、短暫停牌），`processStock` 另外呼叫：
6. **TWSE MIS API**（price-only，不更新指標）：
   `https://mis.twse.com.tw/stock/api/getStockInfo.asp?json=1&delay=0&ex_ch=tse_{code}.tw%7Cotc_{code}.tw`
   收盤後 `z` 欄位 = 當日收盤價，`y` 欄位 = 前日收盤價（備用）

### 新鮮度閾值
最後一筆 bar 必須在 **7 個日曆日**內（台灣時間 UTC+8）。

---

## 關鍵實作限制

### 時區（必看）
Cloudflare Workers 跑 UTC。所有 TWSE 月份計算必須先 +8h：
```typescript
const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
const twYear  = twNow.getUTCFullYear();
const twMonth = twNow.getUTCMonth(); // 0-based
```

### Worker HTTP 30 秒上限
`/api/scan` 所有股票必須用 `Promise.all()` 並行。Sequential loop × 15 支 ≈ 195s → timeout。

### Cron 排程
`30 7 * * 1-5` = UTC 07:30 = **台灣 15:30**（收盤後 1 小時，TWSE 資料已完整發布）

---

## 沙盒限制
開發環境的 proxy 擋所有外部 HTTP（twse.com.tw、tpex.org.tw、stooq.com、Yahoo、Worker URL 均無法直接呼叫）。驗證只能透過 Cloudflare Dashboard logs 或請用戶手動觸發。

---

## 關鍵檔案
```
workers/api/src/index.ts      # fetch() 路由 + scheduled() cron + runPriceMonitor()
workers/api/src/yahoo.ts      # fetchHistory() / fetchTwseHistory() / fetchStooqHistory()
workers/api/wrangler.toml     # cron 排程
migrations/0001_init.sql      # D1 schema
frontend/src/App.tsx          # React 前端入口
```

---

*修改 `wrangler.toml`（cron）、`yahoo.ts`（資料來源邏輯）或 `index.ts`（Worker 架構）後，確認此檔內容是否仍準確。*
