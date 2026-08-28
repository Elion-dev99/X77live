# Railway デプロイ手順

## 方法A: GitHub 連携（推奨・5分）

1. **https://railway.com/new** を開く
2. **Deploy from GitHub repo** → `Elion-dev99/X77live` を選択
3. ブランチ: `main` を選択
4. **Variables** に以下を追加:

| Variable | 値 |
|----------|-----|
| `DISCORD_TOKEN` | Bot トークン |
| `DISCORD_CLIENT_ID` | `1542843731219185704` |
| `DISCORD_GUILD_ID` | `1533753990196625461` |
| `NOTIFY_CHANNEL_ID` | `1542848670221860884` |
| `ADMIN_PASSWORD` | カスタマイズ用パスワード |
| `DATA_DIR` | `/data` |
| `SHOP_ID` | `4` |
| `STORE_NAME` | `大阪店` |

5. **Volume** を追加 → Mount Path: `/data`
6. **Settings** → Healthcheck Path を **空** にする
7. Deploy 完了後、ローカル Bot を停止（同じトークンで2台起動しない）

## 方法B: CLI（Account Token がある場合）

```bash
export RAILWAY_API_TOKEN=your_account_token
bash scripts/railway-setup.sh
```

## 注意

- Cloud Agent 上で動いている Bot と Railway Bot が **同時起動** すると Discord 接続が競合します
- Railway デプロイ後は Cloud Agent 側の Bot を止めてください
- `ADMIN_PASSWORD` は必ず設定してください
