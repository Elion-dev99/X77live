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
