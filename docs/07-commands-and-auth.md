# 07. コマンドと認証

## スラッシュコマンド一覧（18 件）

Guild 内のみ（DM 不可）。`DISCORD_GUILD_ID` 設定時はギルド登録（即反映）。

### 公開コマンド

| コマンド | 内部 ID | 説明 |
|----------|---------|------|
| `/状況` | `status` | 待機/通話/オフライン Embed |
| `/一覧` | `members` | 全 boy ステータス一覧 |
| `/ヘルプ` | `help` | コマンド一覧 |

### 管理コマンド（認証必要）

`ADMIN_COMMANDS` に含まれる。セッション or `パスワード` オプション必須。

| コマンド | 内部 ID | 主な動作 |
|----------|---------|----------|
| `/認証` | `login` | パスワードでセッション作成 |
| `/ログアウト` | `logout` | セッション削除 |
| `/更新` | `refresh` | 即時スクレイプ（force） |
| `/履歴` | `history` | 変更履歴（件数 1〜50） |
| `/設定` | `setting` | 設定変更 |
| `/設定確認` | `settings_show` | 設定 Embed |
| `/通知テスト` | `notify_test` | scrape + 定期通知 force |
| `/監視除外` | `exclude_boy` | boy_id 除外 |
| `/監視再開` | `include_boy` | 除外解除 + scrape |
| `/パスワード変更` | `change_password` | 全セッション無効化 |
| `/再起動` | `restart_server` | process.exit(0) |
| `/レポート一覧` | `report_list` | 保存レポート一覧 |
| `/レポート取得` | `report_download` | ファイル DL |
| `/レポート途中` | `report_interim` | 暫定レポート |
| `/出勤チェック` | `shift_check` | 手動シフト照合 |
| `/設定復元` | `restore_config` | config バックアップ復元 |

---

## 認証（auth.js）

### パスワード

- アルゴリズム: **scrypt**（salt 16 byte hex, hash 64 byte hex）
- 初回: `ADMIN_PASSWORD` env → `initPasswordFromEnv()` で hash 化
- 検証: `verifyPassword(password, config)`

### セッション

```javascript
config.auth.sessions[userId] = expiryISO
```

- 有効期間: `auth.sessionHours`（デフォルト 8 時間）
- `/認証` で作成、`/ログアウト` で削除
- `/パスワード変更` で全 sessions クリア

### requireAdminAuth

```javascript
requireAdminAuth(interaction, config, parsedPassword)
// → null（OK）| { type: "text", content: "...", ephemeral: true }
```

1. 有効セッション → OK  
2. `parsedPassword` が正しい → OK  
3. 否则 → エラーメッセージ

---

## `/設定` 変更可能項目

| 項目 value | 説明 | 制約 |
|------------|------|------|
| `storeName` | 店舗名 | 文字列 |
| `shopId` | shop_id | 文字列 |
| `notifyChannel` | 通知 CH | ID or `<#id>` |
| `notifyInterval` | 通知間隔（分） | 1〜1440 |
| `pollInterval` | 監視間隔（分） | 1〜60、monitor 再起動 |
| `notifyEnabled` | 定期通知 ON/OFF | notifier 再起動 |
| `mentionRole` | メンションロール | ID or `<@&id>` |
| `showWaiting` | 待機一覧 | boolean |
| `showInCall` | 通話一覧 | boolean |
| `showOffline` | オフライン一覧 | boolean |
| `pingOnChange` | 変更通知 | boolean |
| `quietStart` | 通知停止開始 | HH:MM or 空 |
| `quietEnd` | 通知停止終了 | HH:MM or 空 |
| `footerText` | Embed フッター | 文字列 |
| `sortBy` | 並び | `name` / `status` |
| `sessionHours` | 認証時間 | 1〜168 |

---

## コマンド実装の所在

| レイヤ | ファイル |
|--------|----------|
| Discord 定義 | `src/slash-commands.js` → `buildSlashCommands()` |
| パース | `src/slash-commands.js` → `parseSlashInteraction()` |
| 実行 | `src/commands.js` → `handleCommand()` |
| 応答 | `src/index.js` → InteractionCreate handler |

### 応答 type

| type | 用途 |
|------|------|
| `embed` | Embed 返信 |
| `text` | テキスト返信 |
| `deferred` | defer 後 editReply |
| `files` | ファイル添付 |
| `restart` | 返信後 process 再起動 |

---

## 手動コマンド登録

```bash
node scripts/register-commands.js
```

`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` 必要。

---

## 招待 URL

```bash
node scripts/invite-url.js
```

Bot に `applications.commands` スコープが必要。
