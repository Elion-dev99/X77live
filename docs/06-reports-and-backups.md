# 06. レポートとバックアップ

## 営業日の定義

- **営業開始**: `businessHoursOpen`（デフォルト 13:00 JST）
- **営業終了**: `businessHoursClose`（デフォルト 翌 01:00 JST）
- **sessionKey**: 営業開始日 `YYYY-MM-DD`

例: 8/30 13:00 〜 8/31 01:00 → sessionKey = `2026-08-30`

---

## 稼働時間集計（daily-stats.js）

### tickDailyStats

各スクレイプ成功時に呼ばれる（`dailySummaryEnabled !== false`）。

1. `getBusinessSessionKey(now)` が `null` → 集計しない
2. sessionKey 変更 → `dailyOnlineStats` リセット
3. 前回 tick からの経過分（最大 180 分）を加算
4. **待機中 / 通話中** の boy のみ加算:
   - `waitingMinutes`, `inCallMinutes`, `onlineMinutes`（= 待機+通話）

### getCurrentBusinessDayStats

`/レポート途中` 用。現在 session の `boys` スナップショットを返す。  
営業時間外 → `{ ok: false, reason: "closed" }`

---

## 日次サマリー（確定）

| 項目 | 値 |
|------|-----|
| 送信時刻 | `dailySummaryAt`（デフォルト **01:00 JST**） |
| ウィンドウ | 該当時刻から **5 分間**（01:00〜01:04） |
| 対象 session | `getEndedSessionKey()` = 前日の営業日 |
| 重複防止 | `lastDailySummarySessionKey` |
| 出力 | Discord Embed + `data/reports/{sessionKey}.json/.csv` |
| 履歴 | `history` に `daily_summary` |

送信後: `dailyOnlineStats` を新 session 用にリセット → 週次チェック

---

## 日次レポート JSON スキーマ

```json
{
  "sessionKey": "2026-08-30",
  "storeName": "大阪店",
  "shopId": "4",
  "period": {
    "open": "13:00",
    "close": "01:00",
    "label": "8/30 13:00 〜 8/31 01:00"
  },
  "generatedAt": "2026-08-31T01:00:05.000Z",
  "onlineCount": 42,
  "totalOnlineMinutes": 1234,
  "totalWaitingMinutes": 800,
  "totalInCallMinutes": 434,
  "totalOnlineDuration": "20時間34分",
  "boys": [{
    "boyId": "10235",
    "name": "つむぎ",
    "onlineMinutes": 120,
    "waitingMinutes": 80,
    "inCallMinutes": 40,
    "onlineDuration": "2時間0分",
    "waitingDuration": "1時間20分",
    "inCallDuration": "40分"
  }]
}
```

**interim / backup** 時は追加:

```json
{
  "interim": true,
  "note": "営業途中の暫定集計です。01:00 の確定版で上書きされます。"
}
```

---

## 週次サマリー（weekly-report.js）

| 項目 | 値 |
|------|-----|
| トリガー | 日次サマリー後、終了 session が **日曜** |
| 集計範囲 | 月〜日 7 営業日（`getWeekSessionKeys`） |
| ソース | 保存済み日次 JSON を合算 |
| 出力 | Embed + `weekly-{start}_{end}.json/.csv` |
| 重複防止 | `lastWeeklySummaryWeekKey` |

---

## 営業中レポートバックアップ（report-backup.js）

| 項目 | 値 |
|------|-----|
| tick | 60 秒 |
| 条件 | 営業時間 + `reportBackupEnabled` + `dailySummaryEnabled` |
| 間隔 | `reportBackupIntervalHours`（デフォルト **3 時間**） |
| 新 session 開始時 | 即時1回 |
| ファイル | `{sessionKey}.json/.csv` を interim として上書き |
| index | `kind: "backup"` |
| 通知 | 管理者 DM（`reportBackupNotifyAdmin`） |

---

## config バックアップ（config-backup.js）

| 項目 | 値 |
|------|-----|
| tick | 60 秒 |
| 間隔 | `configBackupIntervalHours`（デフォルト **3 時間**） |
| 出力 | `data/backups/config-latest.json` + `config-{ISO}.json` |
| 復元 | `/設定復元` → monitor 再起動 |

---

## ファイル配置

```
data/reports/
├── index.json              # 日次インデックス
├── weekly-index.json
├── 2026-08-30.json
├── 2026-08-30.csv
└── weekly-2026-08-24_2026-08-30.json

data/backups/
├── config-latest.json
└── config-2026-08-30T12-00-00-000Z.json
```

---

## コマンド

| コマンド | 動作 |
|----------|------|
| `/レポート一覧` | index から直近 N 件表示 |
| `/レポート取得` | JSON/CSV 添付。営業日省略時は最新 |
| `/レポート途中` | 営業時間内の暫定 Embed/ファイル |
| `/設定復元` | config バックアップから復元 |

---

## SFTP 取得（Bot-Hosting）

リモート: `/home/container/data/reports/`

```bash
# scripts/sftp-pull-reports.sh 参照
# bot-hosting.sftp.example に接続情報
```

Git の Files タブには **reports は表示されない**（コンテナローカル）。

---

## CSV 形式

日次 CSV は JSON と同内容を表形式化。  
列: boyId, name, onlineMinutes, waitingMinutes, inCallMinutes, …

（詳細は `daily-report-files.js` の `buildDailyReportCsv` を参照）
