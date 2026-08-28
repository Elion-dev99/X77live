# Monkey Network デプロイ手順

[Monkey Network](https://monkey-network.xyz/) は **Bot 最大4体・2GB RAM/体** の無料 Discord Bot ホスティングです。

## リンク

| 用途 | URL |
|------|-----|
| ダッシュボード | https://dash.monkey-network.xyz |
| FAQ | https://monkey-network.xyz/faq.html |
| 機能 | https://monkey-network.xyz/features.html |
| Discord | http://us.monkey-network.xyz:5014 |
| サポート | monkeybyteshosting@gmail.com |

## 1. アカウント & サーバー作成

1. https://dash.monkey-network.xyz で登録・メール認証
2. **Create Server** → **Node.js**
3. 名前例: `x77live`

## 2. メンテナンスモード ON

デプロイ前にパネルで **Maintenance Mode** を有効化。

## 3. SFTP でファイルアップロード

パネルの **SFTP** タブから接続情報を取得。  
アップロード先: `/home/container/`

**載せるもの（ルート）:**

```
index.js
package.json
package-lock.json
src/
scripts/
.env.example          （参考用、トークンは載せない）
```

**載せないもの:**

```
node_modules/
.git/
data/config.json      （初回は空で OK、Bot が自動作成）
.env                  （トークンはパネルの環境変数へ）
```

ローカルからアップロードする場合:

```bash
# node_modules を除いて zip 作成
zip -r x77live-deploy.zip . \
  -x "node_modules/*" -x ".git/*" -x "data/*" -x ".env"
```

## 4. コンソールで依存関係インストール

メンテナンスモード ON のまま、パネル **Console**:

```bash
npm install --no-fund --no-audit
```

## 5. 環境変数

パネル **Startup / Variables** に設定（`monkey-network.env.example` 参照）:

| 変数 | 必須 |
|------|------|
| `DISCORD_TOKEN` | ✅ |
| `DISCORD_CLIENT_ID` | ✅ |
| `DISCORD_GUILD_ID` | 推奨 |
| `NOTIFY_CHANNEL_ID` | 推奨 |
| `SHOP_ID` | 任意（`4`） |
| `ADMIN_PASSWORD` | ✅ |
| `DATA_DIR` | `data` |

## 6. 起動コマンド

| 項目 | 値 |
|------|-----|
| Startup | `npm start` または `node index.js` |

## 7. 起動

1. メンテナンスモード **OFF**
2. **Start**
3. Console で確認:

```
ログイン完了: X77live 0#7952
スラッシュコマンドをギルド ... に登録しました (13件)
```

4. Discord `#x77live` で `/更新` → `/状況`

## 8. Bot-Hosting から移行する場合

1. **Bot-Hosting の x77live を Stop**（二重起動防止）
2. Monkey Network にデプロイ
3. 動作確認後、Bot-Hosting 側は削除しても可

## 9. 14日確認（重要）

**14日ごと** にダッシュボードでサーバー生存確認（1クリック）。  
忘れるとサーバーが回収される可能性があります。

## 10. 集金bot を2台目に載せる

同じアカウントで **サーバー2つ目** を作成（最大4台まで無料）。  
`Elion-dev99/bot` を同様に SFTP デプロイ。

## 注意

- トークンをコードに書かない（環境変数のみ）
- Cloud Agent / ローカルで Bot を **同時起動しない**
- 設定は `data/config.json` に永続化される
