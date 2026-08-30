# X77live 大阪店 オンライン監視 Bot

[x77.jp/live/twoshot_liverlist.php](https://x77.jp/live/twoshot_liverlist.php?search_tribe=1&search_group_id=2&search_shop_id=4) から **大阪店ボーイのみ** の稼働状況を自動監視し、Discord に定期通知する Bot です。

## 仕様書（開発・運用）

**コードの管理・改修用ドキュメント**: [docs/README.md](./docs/README.md)

| ドキュメント | 内容 |
|-------------|------|
| [docs/00-overview.md](./docs/00-overview.md) | システム概要 |
| [docs/01-architecture.md](./docs/01-architecture.md) | モジュール構成・起動フロー |
| [docs/02-environment-and-config.md](./docs/02-environment-and-config.md) | 環境変数・config.json |
| [docs/03-monitoring-and-scraping.md](./docs/03-monitoring-and-scraping.md) | 監視・スクレイプ |
| [docs/04-notifications.md](./docs/04-notifications.md) | 通知仕様 |
| [docs/05-shift-integration.md](./docs/05-shift-integration.md) | シフト連携 |
| [docs/06-reports-and-backups.md](./docs/06-reports-and-backups.md) | レポート・バックアップ |
| [docs/07-commands-and-auth.md](./docs/07-commands-and-auth.md) | コマンド・認証 |
| [docs/08-operations.md](./docs/08-operations.md) | デプロイ・運用 |
| [docs/09-development.md](./docs/09-development.md) | 開発ガイド |
| [docs/site-access-log.md](./docs/site-access-log.md) | 外部サイトアクセス一覧 |

## 監視ステータス

| ステータス | 意味 | 取得方法 |
|-----------|------|---------|
| 🟢 **待機中** | オンラインで待機中 | `live_situation02` 表示 |
| 📞 **通話中** | 2ショット通話中 | `live_situation01` 表示 |
| ⚪ **オフライン** | オンライン未接続 | ライバーリストに表示あるが上記なし |

## データソース

- **ロスター（在籍ボーイ一覧）**: `dgdgdg.com/boy/list.php?shop_id=4`（大阪店）
- **稼働状況**: `x77.jp/live/twoshot_liverlist.php?search_tribe=1&search_group_id=2&search_shop_id=4`（大阪店所属ライバー）
- **出勤シフト**: [EX](https://github.com/Elion-dev99/EX) API（`ex-shift.elion-dev08.workers.dev`）→ 失敗時 `dgdgdg.com/boy/shift.php?shop_id=4`

## コマンド

### 一般（誰でも可）
| コマンド | 説明 |
|----------|------|
| `/状況` | 現在の待機中/通話中/オフライン一覧 |
| `/一覧` | 全ボーイのステータス一覧 |
| `/更新` | x77.jp から即時取得 |
| `/履歴` | ステータス変更履歴 |
| `/ヘルプ` | コマンド一覧 |

### カスタマイズ（🔒 パスワード必須）
| コマンド | 説明 |
|----------|------|
| `/認証` | 管理パスワードでログイン |
| `/ログアウト` | セッション終了 |
| `/設定` | 通知間隔・表示項目等を変更 |
| `/設定確認` | 現在の設定 |
| `/通知テスト` | 定期通知プレビュー |
| `/監視除外` / `/監視再開` | 監視対象の管理 |
| `/パスワード変更` | 管理パスワードを変更 |
| `/出勤チェック` | 今日のシフトとオンライン状態の不一致を確認 |

`/認証` でログイン後、8時間（変更可）はパスワードなしでカスタマイズ可能。未ログイン時は各コマンドの `パスワード` オプションでも実行できます。

## 自動動作

- **2分ごと**（カスタマイズ可）: x77.jp をスクレイプ（**営業時間 13:00〜翌01:00 のみ**、デフォルト）
- **10分ごと**（カスタマイズ可）: Discord チャンネルに Embed 通知（待機中/通話中 + シフト不一致）
- **ステータス変更時**: 即時通知（例: オフライン → 待機中）
- **シフト照合**（営業時間内）: 出勤シフトとオンライン状態を照合
- **未オンライン / シフト外オンライン** は10分ごとの定期通知 Embed に含める（要問合せシフトは未オンライン対象外）

### シフト照合で検出する不一致

| 種類 | 意味 |
|------|------|
| 🚨 出勤シフトなのに未オンライン | シフト時間内（開始+15分猶予後）なのに待機中/通話中ではない |
| ⚠️ シフト未登録なのにオンライン | 今日のシフトに載っていないのにオンライン中 |

EX リポジトリ（[Elion-dev99/EX](https://github.com/Elion-dev99/EX)）の `/api/shop/schedule?shop_id=4` をデフォルトで利用します。EX が利用できない場合は dgdgdg シフトページにフォールバックします。`EX_SHIFT_ENABLED=false` で EX 連携を無効化できます。

## 定期通知の例

```
📡 大阪店 — オンライン稼働状況
👥 監視対象: 137 名 | 🟢 待機中: 5 名 | 📞 通話中: 2 名 | ⚪ オフライン: 130 名

📞 通話中 (2)
  たいら / なおと

🟢 待機中 (5)
  かいき / しゅんた / つむぎ / ...

⚪ オフライン (130)
  あつき / いくま / ...
```

## Monkey Network デプロイ（無料・Bot 最大4体）

1. [Monkey Network](https://monkey-network.xyz/) → [ダッシュボード](https://dash.monkey-network.xyz) で Node.js サーバー作成
2. SFTP で `/home/container/` にアップロード（`scripts/pack-deploy.sh` で zip 作成可）
3. Console で `npm install` → 環境変数設定 → `npm start`

詳細: [MONKEY-NETWORK.md](./MONKEY-NETWORK.md) / [monkey-network.env.example](./monkey-network.env.example)

| 項目 | 内容 |
|------|------|
| Bot 数 | **最大4** / アカウント |
| RAM | **2GB** / Bot |
| 更新 | **14日ごと** にダッシュボードで確認 |

## Bot-Hosting.net デプロイ（無料）

1. [Bot-Hosting.net](https://bot-hosting.net/) で GitHub リポジトリ `Elion-dev99/X77live` を Import
2. **Startup** → Entry File: `index.js`
3. **Env Variables** に設定（詳細は [BOT-HOSTING.md](./BOT-HOSTING.md) / [bot-hosting.env.example](./bot-hosting.env.example)）

| 変数 | 必須 | 説明 |
|------|------|------|
| `DISCORD_TOKEN` | ✅ | Bot トークン |
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_GUILD_ID` | 推奨 | サーバー ID |
| `NOTIFY_CHANNEL_ID` | 推奨 | 通知先チャンネル |
| `SHOP_ID` | 任意 | 大阪店 = `4` |
| `ADMIN_PASSWORD` | ✅ | カスタマイズ用パスワード |
| `DATA_DIR` | 推奨 | `data` |

4. Start → Console でログイン成功を確認

## Railway デプロイ

1. [Railway](https://railway.com/) で GitHub リポジトリを Import
2. **Variables** に設定:

| 変数 | 必須 | 説明 |
|------|------|------|
| `DISCORD_TOKEN` | ✅ | Bot トークン |
| `DISCORD_CLIENT_ID` | ✅ | Application ID |
| `DISCORD_GUILD_ID` | 推奨 | サーバー ID |
| `NOTIFY_CHANNEL_ID` | 推奨 | 通知先チャンネル |
| `SHOP_ID` | 任意 | 大阪店 = `4`（デフォルト） |
| `POLL_INTERVAL_MINUTES` | 任意 | 監視間隔（デフォルト 2） |
| `NOTIFY_INTERVAL_MINUTES` | 任意 | 通知間隔（デフォルト 10） |
| `DATA_DIR` | 推奨 | Volume 使用時 `/data` |
| `ADMIN_PASSWORD` | ✅ | カスタマイズコマンド用パスワード |
| `AUTH_SESSION_HOURS` | 任意 | 認証セッション時間（デフォルト 8） |

3. **Volume** を `/data` にマウント
4. Deploy 後 `/更新` で動作確認

## カスタマイズ（`/設定`）

| 項目 | 説明 | 例 |
|------|------|-----|
| 通知間隔 | 定期通知の間隔（分） | `10` |
| 監視間隔 | x77.jp チェック間隔（分） | `2` |
| 待機中/通話中/オフライン一覧 | 表示 ON/OFF | `true` |
| 通知停止時間帯 | 指定時間は通知しない | `02:00` 〜 `06:00` |
| ステータス変更通知 | 変更時の即時通知 | `true` |

## ローカル開発

```bash
npm install
cp .env.example .env
npm start
npm test
```

## 注意事項

- x77.jp は年齢確認ページがあるため、Bot は自動的にセッション Cookie を取得します
- 大阪店以外のボーイはロスター（shop_id=4）でフィルタリングされます
- x77.jp の HTML 構造が変わった場合は `src/scraper.js` の更新が必要です
