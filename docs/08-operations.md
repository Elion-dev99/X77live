# 08. 運用・デプロイ

## Bot-Hosting.net（本番）

詳細手順: [BOT-HOSTING.md](../BOT-HOSTING.md)  
env テンプレート: [bot-hosting.env.example](../bot-hosting.env.example)

### セットアップ

1. GitHub `Elion-dev99/X77live` / branch `main` を Import
2. **Runtime**: Node.js 18+
3. **Entry file**: `index.js`
4. **Environment Variables**: テンプレートをコピー
5. Start → Console ログ確認

### 必須 env（本番）

```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...          # ギルド限定コマンド（推奨）
NOTIFY_CHANNEL_ID=...         # #x77live
ADMIN_PASSWORD=...
ADMIN_USER_ID=...             # 管理者 DM 先
DATA_DIR=data
```

### 起動成功ログの例

```
[boot] using DATA_DIR= /home/container/data
ログイン完了: X77live#1234
[monitor] 監視開始: 2分間隔
[notifier] 定期通知を開始: 10分間隔
スラッシュコマンドをギルド ... に登録しました (18件)
```

### 更新反映

1. GitHub `main` に merge
2. Bot-Hosting **Git タブ → Auto Pull** または手動 Pull
3. **Restart**（Console）

`/再起動` スラッシュコマンドでも可（Bot-Hosting が自動再起動）。

---

## 二重起動防止

| 対策 | 説明 |
|------|------|
| `instance-lock.js` | 同一 `DATA_DIR` で PID ロック。2 プロセス目は exit(1) |
| 運用ルール | **Cloud Agent / ローカルと Bot-Hosting を同時に動かさない** |
| 同一トークン | Discord 上で両方 online になると通知が2倍 |

---

## ヘルスチェック

```
GET http://0.0.0.0:{PORT}/
→ 200 "ok"
```

デフォルト PORT=8080。Bot-Hosting のヘルスチェックに利用可。

---

## データ永続化

| パス | 内容 | バックアップ |
|------|------|-------------|
| `data/config.json` | 全状態 | 3h 自動 + `/設定復元` |
| `data/reports/` | 日次/週次 | SFTP / `/レポート取得` |
| `data/backups/` | config スナップショット | 手動 list |

**注意**: 無料プランは **4 日ごと** に Renew が必要。

---

## SFTP

レポート回収:

```bash
bash scripts/sftp-pull-reports.sh
```

設定例: `bot-hosting.sftp.example`

リモートパス: `/home/container/data/reports/`

---

## 障害対応

### 通知が来ない

1. `notifyEnabled` / `notifyChannelId` 確認（`/設定確認`）
2. 営業時間内か（01:00〜13:00 は定期通知停止）
3. quiet hours 設定
4. オンライン 0 かつシフト不一致なし → 意図的スキップ
5. Bot online か（Discord）

### 同じ通知が複数

1. Bot プロセス数（Console）
2. ローカル開発 Bot が起動していないか
3. PR #24 以降: デデュープ + instance-lock 確認

### スクレイプ失敗

1. Console: `[monitor] スクレイプ失敗`
2. 連続 3 回で管理者 DM
3. x77 障害 / Cookie / HTML 変更を疑う

### Bot 死活アラート

- `lastScrapeAt` が N 分更新なし（営業時間内）
- 監視ループ停止 / プロセス死 / 営業時間外で lastScrape 更新なし

### `/レポート途中` エラー

- 営業時間外 → 正常メッセージ
- `getCurrentBusinessDayStats` import 要確認（`commands.js`）

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
