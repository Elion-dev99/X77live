# サンドボックス環境（機能テスト用）

本番 Bot（Bot-Hosting 本番デプロイ）に影響を出さず、新機能を試すための **サンドボックスモード** です。

## 原則

| 項目 | 本番 | サンドボックス |
|------|------|----------------|
| Discord Bot | X77live 本番 | **別 Application 推奨** |
| サーバー / チャンネル | `#x77live` | **テスト用チャンネル** |
| データ | `data/` | `data-sandbox/` |
| 定期通知 | ON | **既定 OFF** |
| ステータス変更 ping | ON | **既定 OFF** |
| Embed | 通常 | タイトルに 🧪 |

**同じ `DISCORD_TOKEN` で本番とサンドボックスを同時起動しないでください**（接続競合します）。

---

## 1. テスト用 Discord Bot を用意

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**（例: `X77live SANDBOX`）
2. Bot → Token 発行
3. テスト用 Discord サーバーに Invite（`applications.commands` + 必要権限）
4. テスト用テキストチャンネルを作成

---

## 2. ローカルでサンドボックス起動

```bash
cp sandbox.env.example .env.sandbox
# .env.sandbox にテスト Bot の Token / ID を記入

npm run sandbox        # 通常起動
npm run dev:sandbox    # ファイル変更を監視して再起動
```

起動ログ例:

```
[boot] BOT_MODE= sandbox 🧪
[boot] DATA_DIR= data-sandbox
[boot] 🧪 サンドボックス: 本番とは別 DATA_DIR / 別 Bot トークンで運用してください
[boot] 定期通知: OFF（サンドボックス既定）
```

---

## 3. Bot-Hosting にサンドボックス用デプロイを追加（任意）

本番とは **別の Application デプロイ** を作成:

1. Bot-Hosting → **New Deployment**
2. 同じ GitHub リポジトリ `Elion-dev99/X77live`（ブランチ `main` または feature ブランチ）
3. `bot-hosting.sandbox.env.example` を参考に Env Variables を設定
4. 必須: `BOT_MODE=sandbox`

本番 Bot は **Stop せず**、サンドボックス Bot だけ Start してテストできます（トークンが別なら）。

---

## 4. 環境変数

| 変数 | 説明 |
|------|------|
| `BOT_MODE=sandbox` | サンドボックスモード ON |
| `DATA_DIR` | 既定 `data-sandbox` |
| `NOTIFY_ENABLED` | 既定 `false` |
| `PING_ON_STATUS_CHANGE` | 既定 `false` |
| `STORE_NAME` | 自動で `[SANDBOX]`  suffix |
| `SANDBOX_ENV_FILE` | 既定 `.env.sandbox`（ローカル用） |

テスト中だけ通知を試す場合:

```
NOTIFY_ENABLED=true
NOTIFY_CHANNEL_ID=テスト用チャンネルID
```

---

## 5. 機能テストの流れ

1. feature ブランチを checkout
2. `npm run dev:sandbox` でローカル確認 **または** Bot-Hosting サンドボックスデプロイで Pull → Restart
3. テスト用 Discord でスラッシュコマンドを確認
4. 問題なければ `main` にマージ → **本番デプロイのみ** Pull → Restart

---

## 6. データの削除

サンドボックスデータだけ消す場合:

```bash
rm -rf data-sandbox/
```

本番 `data/` には触れません。

---

## 7. ヘルスチェック

`http://localhost:8080/` → `ok mode=sandbox`
