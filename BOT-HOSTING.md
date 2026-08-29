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
