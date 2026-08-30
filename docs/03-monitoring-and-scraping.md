# 03. 監視とスクレイピング

## 監視ループ（monitor.js）

| 項目 | 値 |
|------|-----|
| 開始 | `startMonitor()` — ClientReady 直後 + 即時1回 |
| 間隔 | `pollIntervalMinutes`（デフォルト **2 分**） |
| 停止 | `stopMonitor()` / プロセス終了 |

### 営業時間ゲート

`runScrape(getConfig, persistConfig, client, options)`:

| 条件 | 動作 |
|------|------|
| 営業時間内 | 通常スクレイプ |
| 営業時間外 + `monitorBusinessHoursOnly !== false` | **スキップ**（ログ: `営業時間外のためスクレイプをスキップ`） |
| `options.force === true` | 営業時間外でも実行（`/更新` 等） |

判定: `shouldRunScheduledMonitoring(now, settings)` → `business-hours.js`

### 営業時間（business-hours.js）

デフォルト: **13:00 〜 翌 01:00 JST**

| 関数 | 用途 |
|------|------|
| `isWithinBusinessHours(date, settings)` | 現在が営業時間か |
| `shouldRunScheduledMonitoring(date, settings)` | 定期監視・定期通知の実行可否 |
| `getBusinessSessionKey(date, settings)` | 営業日キー `YYYY-MM-DD`。01:00〜12:59 は `null` |
| `getEndedSessionKey(date, settings)` | 01:00 送信時の「終了した営業日」 |
| `shouldSendDailySummaryNow(date, settings)` | 01:00〜01:04 の5分ウィンドウ |

**sessionKey の例**: 8/30 22:00 JST → `2026-08-30`（8/30 13:00 開始の営業）

---

## スクレイプ処理（scraper.js）

### エントリ: `scrapeOsakaStatuses(shopId, excludeIds)`

1. `ensureSession()` — x77 年齢確認 Cookie（TTL **30 分**）
2. **並列**:
   - `fetchRoster(shopId)` → dgdgdg list.php
   - `fetchLiveStatuses(shopId)` → x77 liverlist（50件/ページ、全ページ）
3. `mergeOsakaStatuses(roster, online)` — ロスター外は除外、未検出はオフライン

### URL

| 用途 | URL |
|------|-----|
| 年齢確認 | `https://x77.jp/?mode=1&ref=…` |
| ライバー一覧 | `https://x77.jp/live/twoshot_liverlist.php?search_tribe=1&search_group_id=2&search_shop_id={shopId}&search_page_max=50&search_pageno={N}` |
| ロスター | `https://www.dgdgdg.com/boy/list.php?shop_id={shopId}` |

### ステータス判定（parseLivePage）

HTML 内の各 boy ブロック:

```
live_situation01 → 通話中
live_situation02（"通話" ラベルなし）→ 待機中
どちらもなし → オフライン
```

### Cookie

必須: `X_LIVE_SERVICE`, `view_mode`, `live_lang`  
メモリ保持（プロセス再起動でリセット）

---

## 変更検知（monitor.js）

### 新規ボーイ（detectNewBoys）

- 条件: 既存ロスターあり **かつ** `lastScrapeAt` あり
- ロスターに新 boy_id → `pingOnNewBoy` で通知

### ステータス変更（detectChanges）

- 前回 `boyStatuses` と比較
- `pingOnStatusChange` かつ **オンラインになった時のみ** 通知（`isOnlineStatus(to)`）
- 履歴 `history` に `status_change` 追加

### 監視除外

- `config.boys[boyId].excluded === true` → スクレイプ結果から除外
- `/監視除外` / `/監視再開` で操作

---

## スクレイプ結果の反映（applyScrapeResult）

1. ロスターから `boys` メタ更新（新規は `addedAt` 付与）
2. `boyStatuses` 更新（除外 boy を除く）
3. ロスターから消えた boy_id は `boyStatuses` から削除
4. `lastScrapeAt`, `lastSummary` 更新

---

## 関連サブシステム（スクレイプ連動）

| 処理 | モジュール | 営業時間 |
|------|-----------|----------|
| 稼働分集計 | `daily-stats.tickDailyStats` | sessionKey がある時のみ |
| シフト照合 | `shift-monitor.runShiftCheck` | 営業時間内のみ |
| 取得失敗記録 | `scrape-health.handleScrapeFailure` | 24h |
| 死活正常化 | `bot-liveness.markBotLivenessHealthy` | 24h |

---

## 手動スクレイプ

| トリガー | force |
|----------|-------|
| `/更新` | ✅ |
| `/通知テスト` | ✅ |
| `/監視再開` | ✅ |
| `/出勤チェック` | ✅ |
| `/レポート途中` | ❌（営業時間外はスキップ） |
| 定期ループ | ❌ |

---

## 障害・エラー

| 事象 | 動作 |
|------|------|
| HTTP エラー | `handleScrapeFailure`、連続 N 回で管理者 DM |
| 営業時間外 | スキップ（lastScrapeAt 更新なし → 死活アラート注意） |
| x77 HTML 変更 | パース失敗 or 空結果 → scraper 修正が必要 |

詳細な外部アクセス頻度: [site-access-log.md](./site-access-log.md)
