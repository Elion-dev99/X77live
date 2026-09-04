# Bot-Hosting.net デプロイ手順

## 1. デプロイ作成

1. [Bot-Hosting.net](https://bot-hosting.net/) にログイン
2. **New Deployment** → **Application**
3. **Source**: GitHub → `Elion-dev99/X77live` / ブランチ `main`
4. **Runtime**: Node.js（18以上）
5. 作成

## 2. Startup 設定

**Startup** タブ:

| 項目 | 値 |
|------|-----|
| Entry File (STARTUP_FILE) | `index.js` |
| Runtime | Node.js 18+ |

`package.json` と `package-lock.json` がルートにあるので、依存関係は起動時に自動インストールされます。

## 3. 環境変数

**Startup → Env Variables** に `bot-hosting.env.example` を参考に設定:

| 変数 | 必須 | 説明 |
|------|------|------|
| `DISCORD_TOKEN` | ✅ | Bot トークン（Secret） |
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_GUILD_ID` | 推奨 | サーバー ID |
| `NOTIFY_CHANNEL_ID` | 推奨 | 通知先チャンネル |
| `SHOP_ID` | 任意 | 大阪店 = `4` |
| `ADMIN_PASSWORD` | ✅ | 管理者コマンド用パスワード（Secret） |
| `ADMIN_PASSWORD_RESET` | 任意 | `true` で再起動時に `ADMIN_PASSWORD` で上書き（1回だけ使う） |
| `DATA_DIR` | 推奨 | `data` |
| `ADMIN_USER_ID` | ✅ | **管理者の Discord ユーザー ID**（取得失敗アラート等を DM 送信） |
| `POLL_INTERVAL_MINUTES` | 任意 | x77.jp 監視間隔（分）。デフォルト `2` |
| `NOTIFY_INTERVAL_MINUTES` | 任意 | 定期通知間隔（分）。デフォルト `10` |
| `NOTIFY_ENABLED` | 任意 | 定期通知 ON/OFF。デフォルト `true` |
| `STORE_NAME` | 任意 | 店舗名。デフォルト `大阪店` |
| `AUTH_SESSION_HOURS` | 任意 | 認証セッション有効時間。デフォルト `8` |
| `BUSINESS_HOURS_OPEN` | 任意 | 営業開始。デフォルト `13:00` |
| `BUSINESS_HOURS_CLOSE` | 任意 | 営業終了。デフォルト `01:00` |
| `DAILY_SUMMARY_AT` | 任意 | 日次サマリー送信時刻。デフォルト `01:00` |
| `DAILY_CHART_DM_ENABLED` | 任意 | 01:00 稼働グラフを管理者DMへ送信。デフォルト `true` |
| `QUICKCHART_URL` | 任意 | グラフ生成 API。デフォルト `https://quickchart.io/chart` |
| `SCRAPE_ALERT_THRESHOLD` | 任意 | 連続取得失敗の閾値。デフォルト `3` |
| `SCRAPE_ALERT_ENABLED` | 任意 | 取得失敗アラート。デフォルト `true` |
| `REPORT_BACKUP_INTERVAL_HOURS` | 任意 | 営業中バックアップ間隔（時間）。デフォルト `3` |
| `REPORT_BACKUP_ENABLED` | 任意 | 自動バックアップ。デフォルト `true` |
| `REPORT_BACKUP_NOTIFY_ADMIN` | 任意 | バックアップ完了を管理者 DM。デフォルト `true` |
| `CONFIG_BACKUP_INTERVAL_HOURS` | 任意 | config.json 自動バックアップ間隔（時間）。デフォルト `3` |
| `CONFIG_BACKUP_ENABLED` | 任意 | config 自動バックアップ。デフォルト `true` |
| `BOT_LIVENESS_MINUTES` | 任意 | 監視停止とみなす分数。デフォルト `10` |
| `BOT_LIVENESS_ENABLED` | 任意 | Bot 死活監視（管理者 DM）。デフォルト `true` |
| `WEEKLY_SUMMARY_ENABLED` | 任意 | 週次レポート（日曜営業終了後=月01:00）。デフォルト `true` |
| `SHIFT_CHECK_ENABLED` | 任意 | シフト照合の自動実行。デフォルト `true` |
| `SHIFT_ALERT_ENABLED` | 任意 | 不一致時の `#x77live` 通知。デフォルト `true` |
| `SHIFT_GRACE_MINUTES` | 任意 | シフト開始後の猶予（分）。デフォルト `15` |
| `EX_SHIFT_ENABLED` | 任意 | EX API 連携。デフォルト `true`（`false` で dgdgdg のみ） |
| `EX_SHIFT_JSON_URL` | 任意 | カスタムシフト JSON URL（省略時は EX 本番 API） |
| `LOG_LEVEL` | 任意 | ログ出力レベル。`DEBUG`, `INFO`, `WARN`, `ERROR` から選択。デフォルト `INFO` |
| `SESSION_TOKEN` | 任意 | セッション永続化用トークン（高度な設定、通常不要） |

### 管理者 DM（ADMIN_USER_ID）の取得

1. Discord 設定 → **詳細設定** → **開発者モード** を ON
2. 自分のアイコンを右クリック → **ユーザーIDをコピー**
3. Bot-Hosting の `ADMIN_USER_ID` に貼り付け

サーバー管理用アラート（x77.jp 取得失敗・復旧、レポート自動バックアップ）は **#x77live ではなくあなた個人の DM** に届きます。  
初回 DM 前に、Bot がいるサーバーで Bot と一度やり取り（例: `/ヘルプ`）しておくと確実です。

## 4. 起動

1. **Start** をクリック
2. Console で以下を確認:

```
[boot] using DATA_DIR= .../data
ログイン完了: X77live 0#7952
スラッシュコマンドをギルド ... に登録しました (13件)
```

3. Discord `#x77live` に通知が届くか確認
4. `/更新` → `/状況` で動作確認

## 5. GitHub 自動更新

**Git** タブでリポジトリをリンクし、**Auto Pull** を ON にすると `main` 更新時に自動同期できます。

## 6. SFTP（レポートファイル取得）

Bot-Hosting の **Files** タブは Git 用のため、Bot が保存する `data/reports/` は表示されません。**SFTP** で取得します。

### 接続情報の確認

Bot-Hosting ダッシュボード → 対象 Bot → **Settings** → **SFTP** に表示されます。

| 項目 | 例 |
|------|-----|
| Host | `fi3.bot-hosting.net` |
| Port | `2022` |
| Username | `xxxx.jtd4xxqy`（Bot ごとに異なる） |
| Password | SFTP 画面に表示（Secret） |

### FileZilla / Cyberduck（GUI）

| 項目 | 値 |
|------|-----|
| プロトコル | SFTP |
| ホスト | `fi3.bot-hosting.net` |
| ポート | `2022` |
| ユーザー名 | SFTP 画面の Username |
| パスワード | SFTP 画面の Password |

接続後、リモート側で次のフォルダを開きます:

```
/home/container/data/reports/
├── index.json
├── 2026-08-28.json
└── 2026-08-28.csv
```

### コマンドで一括取得（ローカル PC）

```bash
cp bot-hosting.sftp.example .env.sftp
# .env.sftp に Username / Password を記入

bash scripts/sftp-pull-reports.sh
```

`./downloads/reports/` に JSON / CSV が保存されます。

`sshpass` があるとパスワード自動入力できます（macOS: `brew install sshpass`）。

### Discord から取得

SFTP 不要で、Discord 上からも取得できます:

```
/レポート一覧
/レポート取得 営業日:2026-08-28 形式:CSV
```

（管理者パスワード必須）

## 注意

- **4日ごとに Renew**（無料プラン）
- Cloud Agent / ローカル / Railway 等で **同時起動しない**（Discord 接続が競合します）
- トークンをチャット等に出した場合は [Discord Developer Portal](https://discord.com/developers/applications) で再発行してください

---

## 7. ヘルスチェック機能

Bot は自動的にヘルスチェック HTTP エンドポイントを起動します（`PORT=8080` デフォルト）。

### 監視ツールからの確認

```bash
# ローカルテスト
curl -s http://localhost:8080/health | jq .

# 出力例
{
  "status": "healthy",
  "uptime": 3600,
  "lastScrapeAt": "2026-08-31T12:34:56Z",
  "scrapesPerformed": 45,
  "boys_online": 3,
  "sessionCount": 2
}
```

Bot-Hosting の **Health Check** 設定:

| 項目 | 値 |
|------|-----|
| Endpoint | `/health` |
| Interval | `30s` |
| Timeout | `5s` |

### ログレベル設定

運用中のログ出力を制御:

```
LOG_LEVEL=ERROR      → エラーのみ（本番推奨）
LOG_LEVEL=WARN       → 警告+エラー
LOG_LEVEL=INFO       → 情報+警告+エラー（デバッグ時推奨）
LOG_LEVEL=DEBUG      → 全ログ（開発時のみ）
```

Console で以下が表示されます:

```
[2026-08-31T12:20:08.043+09:00] [INFO] [scraper] 取得成功: 45名
[2026-08-31T12:20:09.050+09:00] [DEBUG] [monitor] 差分検出: {from: "待機中", to: "通話中"}
```

---

## 8. セッション・認証システム

### セッション永続化

管理者認証後のセッションは自動的に `data/sessions.json` に保存されます：

```json
{
  "sessions": {
    "abc123def456...": {
      "userId": "879683856121364490",
      "createdAt": "2026-08-31T12:00:00Z",
      "expiresAt": "2026-08-31T20:00:00Z"
    }
  },
  "lastCleanup": "2026-08-31T10:00:00Z"
}
```

- **プロセス再起動後も有効** → セッション情報が保持される
- **24時間ごとに自動クリーンアップ** → 期限切れセッションは自動削除
- **メモリのみへの依存を解消** → データの永続化

### セッション有効期限

デフォルト `8時間`（`AUTH_SESSION_HOURS` で変更可能）:

```
/認証 パスワード:****
→ セッション作成、8時間有効
→ 以後、同じユーザーは認証なしでコマンド実行可能
```

---

## 9. ネットワークエラー自動リトライト

外部 API（x77.jp, dgdgdg.com, EX シフト等）へのアクセスが失敗した場合、自動的に再試行します：

### リトライト戦略

```
初回試行: 即座
再試行1: 1秒後
再試行2: 2秒後（指数バックオフ）
再試行3: 4秒後
最大: 30秒

リトライト対象:
- HTTP 429 (Rate Limited)
- HTTP 503 (Service Unavailable)
- HTTP 504 (Gateway Timeout)
- ネットワークエラー
- タイムアウト
```

Console ログ例:

```
[ERROR] [scraper] fetch失敗: https://x77.jp/live/...
[WARN] [scraper] https://x77.jp/live/... エラー - 再試行 (1/3) 1000ms後
[INFO] [scraper] https://x77.jp/live/... 再試行成功 (2試行目)
```

---

## 10. トラブルシューティング

### Bot が起動しない

**確認事項:**

```bash
# Console を確認
# 1. エラーメッセージをスクリーンショット
# 2. 以下の環境変数を確認
```

| 症状 | 原因 | 対処 |
|------|------|------|
| `DISCORD_TOKEN が未設定です` | トークンが未入力 | Bot-Hosting の `DISCORD_TOKEN` を設定（Secret） |
| `HTTP 401 Unauthorized` | トークンが無効 | Discord Developer Portal で再発行 |
| `Cannot find package 'discord.js'` | npm インストール失敗 | **Console で `npm install` 実行後、再起動** |
| `EACCES: permission denied` | ファイル権限エラー | Bot-Hosting サポートに連絡 |

### Discord に通知が来ない

| 症状 | 原因 | 対処 |
|------|------|------|
| Bot アイコンがサーバーに表示されない | Bot 招待失敗 | `/招待` でリンク再生成し招待 |
| #x77live にメッセージが表示されない | チャンネル ID が異なる | `NOTIFY_CHANNEL_ID` を確認（右クリック → ID コピー） |
| 管理者 DM が届かない | ADMIN_USER_ID が未設定 | Bot-Hosting で `ADMIN_USER_ID` を設定後、Bot と `/ヘルプ` でやり取り |

### ログが出力されない

```bash
# LOG_LEVEL を確認
# デフォルト: INFO（INFO以上のログが表示）
# DEBUG ログが見たい場合: LOG_LEVEL=DEBUG に変更
```

**変更後は再起動が必要:**

1. Bot-Hosting ダッシュボード → **Stop**
2. 環境変数 `LOG_LEVEL=DEBUG` に変更
3. **Start**

### x77.jp スクレイプが失敗する

```
[ERROR] [scraper] HTTP 403 for https://x77.jp/live/...
```

**対処:**

1. x77.jp にアクセス可能か確認（VPN/プロキシの影響）
2. `POLL_INTERVAL_MINUTES` を増やす（例: 5分に変更）
3. 一時的に Cookie キャッシュをリセット

Bot-Hosting コンソール:

```bash
rm -rf data/
```

**⚠️ 警告: 上記コマンドでレポートも削除されます。バックアップを取ってください。**

### メモリ不足エラー

```
JavaScript heap out of memory
```

**対処:**

1. レポートファイル数を確認 → SFTP で古いファイルを削除
2. `data/sessions.json` の容量確認
3. Bot-Hosting で メモリプラン をアップグレード

---

## 11. 定期保守チェックリスト

| 項目 | 頻度 | 方法 |
|------|------|------|
| レポート取得 | 週1回 | `/レポート一覧` または SFTP |
| セッション確認 | 月1回 | SFTP で `data/sessions.json` をダウンロード |
| ログ確認 | 異常時 | Bot-Hosting Console の Logs タブ |
| パスワード変更 | 3ヶ月ごと | `ADMIN_PASSWORD` を変更 → `ADMIN_PASSWORD_RESET=true` |
| Env 更新 | 月1回 | `docs/02-environment-and-config.md` と Bot-Hosting の値を同期 |

---

## 12. 本番運用のベストプラクティス

### 推奨設定

```
LOG_LEVEL=WARN              # エラー・警告のみ表示
NOTIFY_ENABLED=true         # 定期通知を有効
SCRAPE_ALERT_ENABLED=true   # x77.jp 取得失敗時に管理者 DM
BOT_LIVENESS_ENABLED=true   # Bot 死活監視
REPORT_BACKUP_ENABLED=true  # レポート自動バックアップ
ADMIN_PASSWORD_RESET=false  # （常に false）
```

### 再起動が必要な変更

以下を変更した場合は **Bot を再起動してください**：

```
✓ DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID
✓ LOG_LEVEL
✓ 環境変数の追加・削除
✓ package.json の依存関係更新

✗ `data/config.json` の変更 → 再起動不要（自動反映）
```

**再起動手順:**

1. Bot-Hosting ダッシュボード → **Stop**（完全停止を待つ 10秒）
2. 環境変数を変更（Env Variables タブ）
3. **Start**
4. Console で起動ログを確認

---
