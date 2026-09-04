# 08. 運用・デプロイ

## Bot-Hosting.net（本番）

📖 **詳細手順**: [BOT-HOSTING.md](../BOT-HOSTING.md) を参照  
📝 **環境変数テンプレート**: [bot-hosting.env.example](../bot-hosting.env.example)

### セットアップクイックスタート

1. [Bot-Hosting.net](https://bot-hosting.net/) にログイン
2. **New Deployment** → **Application**
3. GitHub: `Elion-dev99/X77live` / `main` ブランチ
4. Runtime: **Node.js 18+**
5. Entry File: **`index.js`**
6. Environment Variables: [bot-hosting.env.example](../bot-hosting.env.example) をコピー
7. **Start** → Console ログ確認

### 必須環境変数（本番）

```
DISCORD_TOKEN=your_bot_token_here         (Secret)
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
NOTIFY_CHANNEL_ID=...                      (#x77live のID)
ADMIN_PASSWORD=...                         (Secret)
ADMIN_USER_ID=...                          (管理者のDiscord ID)
DATA_DIR=data
```

その他の推奨環境変数は [BOT-HOSTING.md § 3](../BOT-HOSTING.md#3-環境変数) を参照。

### 起動成功時のログ

```
[boot] using DATA_DIR= /home/container/data
ログイン完了: X77live#1234
[monitor] 監視開始: 2分間隔
[notifier] 定期通知を開始: 10分間隔
スラッシュコマンドをギルド ... に登録しました (18件)
```

### GitHub からの自動更新

**Bot-Hosting ダッシュボード:**

1. **Git** タブ → リポジトリ接続
2. **Auto Pull** を ON
3. `main` ブランチ push 後、自動同期・再起動

手動更新:

```
/再起動
```

詳細: [BOT-HOSTING.md § 5](../BOT-HOSTING.md#5-github-自動更新)

---

## ヘルスチェック・ロギング

### ヘルスチェック API

```bash
curl http://localhost:8080/
# → ok
```

現行 `src/health.js` は **ルート `/` にプレーンテキスト `ok` のみ** 返します。  
JSON の `/health` エンドポイントは **未実装**（BOT-HOSTING.md の JSON 例は将来案）。

Bot-Hosting Health Check 設定例:

```
Endpoint: /
Interval: 30s
```

### ログレベル設定

運用フェーズに応じて `LOG_LEVEL` 環境変数で調整:

```
LOG_LEVEL=ERROR      → エラーのみ（本番推奨）
LOG_LEVEL=WARN       → 警告+エラー
LOG_LEVEL=INFO       → 情報+警告+エラー（デバッグ時推奨）
LOG_LEVEL=DEBUG      → 全ログ（開発時のみ）
```

詳細: [BOT-HOSTING.md § 7](../BOT-HOSTING.md#7-ヘルスチェック機能)

---

## セッション・認証管理

### セッション永続化

**現行本番（デフォルト）**: `config.json` 内 `auth.sessions[userId]` に ISO 期限を保存。再起動後も `loadConfig()` で復元。

**Copilot 追加（オプション）**: `data/sessions.json` + トークンキー。  
`config.auth.sessions` オブジェクトが存在する限り **レガシー方式が優先** され、sessions.json は使われない。

詳細: [10-copilot-additions.md § セッション](./10-copilot-additions.md#1-セッション管理は二重構造)

---

## ネットワークエラー対応

x77.jp / dgdgdg.com / EX API へのアクセスが失敗した場合、自動的に再試行します：

```
再試行戦略: 指数バックオフ
最大試行: 3回 + 初回 = 4回
リトライト対象: HTTP 429/503/504, ネットワークエラー, タイムアウト
```

詳細: [BOT-HOSTING.md § 9](../BOT-HOSTING.md#9-ネットワークエラー自動リトライト)

---

## 二重起動防止

| 対策 | 説明 |
|------|------|
| **instance-lock.js** | 同一 `DATA_DIR` で PID ロック。2 プロセス目は exit(1) |
| **運用ルール** | **Bot-Hosting と ローカル / Cloud Agent を同時に動かさない** |

---

## データ永続化・バックアップ

| パス | 内容 | 自動バックアップ |
|------|------|------------------|
| `data/config.json` | 全状態（boy 情報、設定値） | 3時間ごと |
| `data/sessions.json` | セッション情報 | （毎回保存） |
| `data/reports/` | 日次/週次レポート（JSON/CSV） | 営業中 3時間ごと |
| `data/backups/` | config スナップショット | 自動 + 手動 list |

### レポート取得

**Discord コマンド**（管理者パスワード必須）:

```
/レポート一覧
/レポート取得 営業日:2026-08-28 形式:CSV
```

**SFTP で一括取得**:

```bash
bash scripts/sftp-pull-reports.sh
```

詳細: [BOT-HOSTING.md § 6](../BOT-HOSTING.md#6-sftpレポートファイル取得)

---

## トラブルシューティング

### よくある問題

| 症状 | 原因 | 対処 |
|------|------|------|
| Bot が起動しない | トークン設定ミス / npm インストール失敗 | [BOT-HOSTING.md § 10](../BOT-HOSTING.md#10-トラブルシューティング) 参照 |
| Discord に通知が来ない | チャンネル ID や 権限の設定ミス | [BOT-HOSTING.md § 10](../BOT-HOSTING.md#10-トラブルシューティング) 参照 |
| x77.jp スクレイプ失敗 | VPN / プロキシの影響、API 変更 | [BOT-HOSTING.md § 10](../BOT-HOSTING.md#10-トラブルシューティング) 参照 |
| メモリ不足エラー | レポートファイル蓄積 | [BOT-HOSTING.md § 10](../BOT-HOSTING.md#10-トラブルシューティング) 参照 |

### Console ログの確認

Bot-Hosting ダッシュボード → **Console** タブ。  
Copilot 追加後は `[timestamp] [LEVEL] [module]` 形式と `[monitor]` 等の旧形式が混在する場合あり。

### 通知が来ない / 重複 / スクレイプ失敗

→ 各項目は [04-notifications.md](./04-notifications.md)、[03-monitoring-and-scraping.md](./03-monitoring-and-scraping.md) 参照。

---

## セキュリティ

| 項目 | 対策 |
|------|------|
| 管理コマンド | パスワード + セッション |
| env | `DISCORD_TOKEN`, `ADMIN_PASSWORD` は Secret |
| config.json | SFTP アクセス制限。パスワード hash のみ保存 |
| 外部サイト | GET のみ、ログインなし |

---

## 本番 Guild 情報（参考）

| 項目 | 値 |
|------|-----|
| Guild | DGOSK幹部 |
| 通知 CH | `#x77live` |
| ADMIN_USER_ID | 環境変数で設定 |

---

## その他ホスティング

| プラットフォーム | ドキュメント |
|-----------------|-------------|
| Railway | README.md |
| Monkey Network | MONKEY-NETWORK.md |

いずれも **Entry: index.js**, **DATA_DIR を Volume に** 推奨。
