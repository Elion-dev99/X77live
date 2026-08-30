# 04. 通知仕様

## 通知チャンネル

| 用途 | チャンネル |
|------|-----------|
| 定期 Embed / 日次・週次サマリー | `notifyChannelId` |
| ステータス変更 / 新規ボーイ | `settings.statusChangeChannelId` または `notifyChannelId` |
| 管理者アラート | `adminUserIds` への DM（失敗時 notify チャンネル） |

---

## 通知種別一覧

| # | 種別 | 間隔/トリガー | 送信条件 | 形式 |
|---|------|--------------|----------|------|
| 1 | **定期オンライン Embed** | `notifyIntervalMinutes`（10分） | 営業時間、quiet hours 外、重複なし、オンライン>0 or シフト不一致あり | Embed |
| 2 | **ステータス変更** | スクレイプで変化 | `pingOnStatusChange`、**オンライン化時のみ** | テキスト |
| 3 | **新規ボーイ** | ロスターに新 ID | `pingOnNewBoy !== false` | テキスト |
| 4 | **日次サマリー** | 01:00 JST ±5分 | `dailySummaryEnabled`、1営業日1回 | Embed + ファイル |
| 5 | **週次サマリー** | 日曜営業終了後 | `weeklySummaryEnabled`、日次ファイルあり | Embed + ファイル |
| 6 | **スクレイプ失敗** | 連続 N 回失敗 | `scrapeAlertEnabled`、threshold 到達 | 管理者 DM |
| 7 | **スクレイプ復旧** | 失敗後の初回成功 | 同上 | 管理者 DM |
| 8 | **レポートバックアップ** | 営業中 3h | `reportBackupNotifyAdmin` | 管理者 DM |
| 9 | **Bot 死活** | lastScrapeAt stale | 営業時間、`botLivenessEnabled` | 管理者 DM |

**シフト不一致**（未オンライン / シフト外オンライン）は **#1 定期 Embed に含める**（別メッセージ即時通知は廃止）。

---

## 定期通知（notifier.js）

### スキップ条件（すべて満たさないと送信）

1. `notifyEnabled === true`
2. `notifyChannelId` 設定済み
3. `shouldRunScheduledMonitoring()` = true（営業時間内）
4. `isInQuietHours()` = false
5. `shouldSkipDuplicateNotification()` = false
6. `getOnlineCount() > 0` **または** シフト不一致あり

### 重複防止

```javascript
minGap = max(notifyIntervalMinutes × 0.85, 1分)
lastNotifyAt から minGap 未満 → スキップ
```

起動直後の初回送信は `skipIfRecent: true` で直近送信があればスキップ。

### メンション

`mentionRoleId` 設定時: `<@&roleId>` を content に付与。

---

## 定期 Embed 構造（buildNotificationEmbed）

**タイトル**: `📡 {storeName} — オンライン`

**Description（1行）**:
```
🟢 待機中: N 名  |  📞 通話中: N 名  |  🚨 シフト未オンライン: N 名  |  ⚠️ シフト外オンライン: N 名
```
（該当0件の項目は省略）

**Fields**（settings で ON のもの）:

| Field | 内容 |
|-------|------|
| `📞 通話中 (N)` | 名前リスト |
| `🟢 待機中 (N)` | 名前リスト |
| `🚨 出勤なのに未オンライン (N)` | `名前 (シフト時間)` |
| `⚠️ シフト外オンライン (N)` | `名前 — ステータス` |

**Footer**: `{footerText} | 最終更新 HH:MM`  
**URL**: `settings.liveUrl`（x77 一覧リンク）

---

## ステータス変更メッセージ

```
🟢 **{name}**: オフライン → **待機中**
```

アイコン: 待機 🟢 / 通話 📞 / オフライン ⚪

---

## Quiet Hours（config.js）

- `settings.quietHoursStart` / `quietHoursEnd`（`HH:MM`、JST）
- **定期通知のみ** 抑制（スクレイプ・ステータス変更は継続）
- 日をまたぐ範囲対応（例: 02:00〜06:00）

---

## 管理者 DM（admin-notify.js）

`ADMIN_USER_ID`（カンマ区切り複数可）に DM。  
Bot と1回以上やり取り（`/ヘルプ` 等）が必要。

---

## Discord Embed 制限（実装で考慮済み）

| 制限 | 対策 |
|------|------|
| Embed 合計 6000 文字 | 日次ランキング最大 25 名（`DAILY_SUMMARY_MAX_RANKING`） |
| Field value 1024 文字 | `fieldValue()` で slice |
| 定期通知 field | 各リスト最大 15 名 |

---

## 通知フロー図

```
スクレイプ (2min)
  ├─► ステータス変更通知（即時）
  ├─► 新規ボーイ通知（即時）
  └─► runShiftCheck → lastShiftCompare 更新

定期通知 (10min)
  ├─► runShiftCheck（再照合）
  └─► buildNotificationEmbed → 1 メッセージ
```

---

## トラブル: 同じ通知が複数回

| 原因 | 対処 |
|------|------|
| Bot 二重起動 | Bot-Hosting Console で1プロセスのみ。Cloud Agent 停止 |
| 再起動直後 | `lastNotifyAt` デデュープ + instance-lock |
| 10分以内の手動 `/通知テスト` | 意図的（force） |
