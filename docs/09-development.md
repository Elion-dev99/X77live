# 09. 開発ガイド

## ローカルセットアップ

```bash
git clone https://github.com/Elion-dev99/X77live.git
cd X77live
npm install
cp .env.example .env
# .env を編集（DISCORD_TOKEN, DISCORD_CLIENT_ID, ADMIN_PASSWORD 等）
npm start
npm test
```

**注意**: 本番 Bot と **同じ DISCORD_TOKEN を使わない**（二重起動）。

---

## npm scripts

| コマンド | 内容 |
|----------|------|
| `npm start` | `node index.js` |
| `npm test` | `node --test test/*.test.js` |

---

## テスト構成

| ファイル | カバー範囲 |
|----------|-----------|
| `bot.test.js` | scraper パース、embed、config |
| `auth.test.js` | パスワード、セッション、ADMIN_COMMANDS |
| `monitor-business-hours.test.js` | 営業時間ゲート |
| `notify-dedupe.test.js` | 通知デデュープ、シフト外 Embed |
| `daily-summary.test.js` | 営業日、集計、レポートファイル |
| `shift-integration.test.js` | シフトパース、照合 |
| `scrape-health-report-backup.test.js` | 死活、バックアップ |
| `new-features.test.js` | 週次、config backup |
| `restart.test.js` | プロセス再起動 |

Fixtures: `test/fixtures/*.html`

---

## 機能追加の典型パターン

### 新しいスラッシュコマンド

1. `src/slash-commands.js` — `buildSlashCommands()` に追加
2. `src/slash-commands.js` — `parseSlashInteraction()` に case 追加
3. `src/commands.js` — `handleCommand()` に case 追加
4. 管理コマンドなら `src/auth.js` — `ADMIN_COMMANDS` に追加
5. `test/` にテスト追加
6. `docs/07-commands-and-auth.md` 更新

### 新しい env / config 設定

1. `src/store.js` — `defaultConfig().settings` に追加
2. `.env.example`, `bot-hosting.env.example` に追記
3. `docs/02-environment-and-config.md` 更新
4. `/設定` から変更可能にする場合 → `src/config.js` SETTING_KEYS

### 新しい通知種別

1. `src/notifier.js` または該当モジュールに送信関数
2. `src/format.js` にメッセージ/Embed ビルダー
3. `docs/04-notifications.md` 更新

### スクレイプ対象変更

1. `src/scraper.js` — パーサー修正
2. `test/fixtures/` に HTML サンプル追加
3. `test/bot.test.js` にパーステスト
4. `docs/site-access-log.md` 更新

---

## 主要関数リファレンス

### monitor.js

```javascript
runScrape(getConfig, persistConfig, client?, { force?, now? })
startMonitor(client, getConfig, persistConfig)
stopMonitor()
restartMonitor(...)
```

### notifier.js

```javascript
sendPeriodicNotification(getConfig, saveConfigFn, buildEmbed, { force?, skipIfRecent?, now? })
shouldSkipDuplicateNotification(config, now?)
startNotifier(...) / stopNotifier()
```

### shift-monitor.js

```javascript
runShiftCheck(config, statuses, client?, now?) → result | null
```

### business-hours.js

```javascript
isWithinBusinessHours(date?, settings?)
shouldRunScheduledMonitoring(date?, settings?)
getBusinessSessionKey(date?, settings?)
getEndedSessionKey(date?, settings?)
```

---

## デバッグ

### ログプレフィックス

| プレフィックス | モジュール |
|---------------|-----------|
| `[monitor]` | スクレイプ |
| `[notifier]` | 定期通知 |
| `[shift]` | シフト（旧即時通知ログは削除） |
| `[daily-summary]` | 01:00 サマリー |
| `[report-backup]` | 途中バックアップ |
| `[config-backup]` | config 保存 |
| `[bot-liveness]` | 死活 |
| `[boot]` | 起動 |

### config 確認

```bash
cat data/config.json | jq '.lastSummary, .lastShiftCompare, .lastScrapeAt'
```

---

## コード規約（既存に合わせる）

- ESM (`import` / `export`)
- JSDoc `@param` / `@type` を主要関数に
- 設定は `config.settings` 経由、env は初回デフォルトのみ
- Discord 送信は `allowedMentions: { parse: [] }` がデフォルト
- 履歴は `addHistory(config, entry)` 経由

---

## 既知の TODO / 不整合

| 項目 | 状態 |
|------|------|
| README「シフト外即時30分」 | 実装削除済み → README 更新推奨 |
| `shiftAlertEnabled` | config のみ、未参照 |
| `adminRoleIds` 認証 | 未実装 |
| `commands.js` | `getCurrentBusinessDayStats` import 要確認 |

---

## 関連リポジトリ

| Repo | 関係 |
|------|------|
| [Elion-dev99/EX](https://github.com/Elion-dev99/EX) | シフト API（Workers） |
| [Elion-dev99/X77live](https://github.com/Elion-dev99/X77live) | 本 Bot |

EX API を変更した場合は `shift-scraper.js` のパースと `test/shift-integration.test.js` を更新する。
