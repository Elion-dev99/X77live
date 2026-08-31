# X77live 仕様書インデックス

大阪店（`shop_id=4`）向け Discord Bot **X77live** の開発・運用・改修用ドキュメントです。
コードと照合しながら読むことを前提に、**現行実装（`main` ブランチ）** に基づいて記載しています。

## 読み方

| 順序 | ドキュメント | 内容 |
|------|-------------|------|
| 1 | [00-overview.md](./00-overview.md) | システム概要・用語・ビジネス前提 |
| 2 | [01-architecture.md](./01-architecture.md) | モジュール構成・起動フロー・データフロー |
| 3 | [02-environment-and-config.md](./02-environment-and-config.md) | 環境変数・`config.json` 全フィールド |
| 4 | [03-monitoring-and-scraping.md](./03-monitoring-and-scraping.md) | 監視・スクレイプ・営業時間 |
| 5 | [04-notifications.md](./04-notifications.md) | 通知種別・トリガー・Embed 仕様 |
| 6 | [05-shift-integration.md](./05-shift-integration.md) | EX API・シフト照合ロジック |
| 7 | [06-reports-and-backups.md](./06-reports-and-backups.md) | 日次/週次レポート・バックアップ |
| 8 | [07-commands-and-auth.md](./07-commands-and-auth.md) | スラッシュコマンド・認証 |
| 9 | [08-operations.md](./08-operations.md) | Bot-Hosting デプロイ・運用・障害対応 |
| 10 | [09-development.md](./09-development.md) | ローカル開発・テスト・拡張ガイド |
| — | [site-access-log.md](./site-access-log.md) | 外部サイトアクセス一覧（幹部向け） |
| — | **[10-copilot-additions.md](./10-copilot-additions.md)** | **Copilot 追加分の整理（2026-08-31）** |

## 関連ファイル（リポジトリ内）

| パス | 用途 |
|------|------|
| `README.md` | ユーザー向け概要 |
| `BOT-HOSTING.md` | Bot-Hosting 手順 |
| `.env.example` | ローカル開発用 env テンプレート |
| `bot-hosting.env.example` | 本番 env テンプレート |
| `src/` | Bot 本体ソース（25 モジュール） |
| `test/` | Node.js 組み込みテスト |

## 改修時のチェックリスト

1. 仕様変更 → 該当 `docs/0x-*.md` を更新
2. 環境変数追加 → `02-environment-and-config.md` + `.env.example` + `bot-hosting.env.example`
3. コマンド追加 → `07-commands-and-auth.md` + `src/slash-commands.js` + `src/commands.js`
4. 外部アクセス変更 → `site-access-log.md`
5. `npm test` で全テスト pass を確認

*最終更新: 2026-08-30*
