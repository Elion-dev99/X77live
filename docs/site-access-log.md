# 外部サイトアクセス一覧（X77live Bot）

幹部・店舗向け説明用。**公式APIは使用せず、公開Webページをブラウザと同様に閲覧しているだけ**です。

## サマリー

| 項目 | 内容 |
|------|------|
| 方式 | HTTP **GET のみ**（HTML / JSON 取得） |
| ログイン | **なし**（ID・パスワード送信なし） |
| 書き込み | **なし**（データ変更・POST なし） |
| 監視間隔 | デフォルト **2分**（`POLL_INTERVAL_MINUTES`） |
| 通知間隔 | デフォルト **10分**（`NOTIFY_INTERVAL_MINUTES`） |
| 監視時間帯 | デフォルト **13:00〜翌01:00 JST**（`MONITOR_BUSINESS_HOURS_ONLY=true`） |
| 対象店舗 | 大阪店（`shop_id=4`） |

---

## 1. x77.jp

| # | メソッド | URL | タイミング | 頻度目安 | 目的 | 取得データ |
|---|----------|-----|------------|----------|------|------------|
| 1 | GET | `https://x77.jp/?mode=1&ref=…` | 監視開始時 / Cookie 期限切れ | **約30分に1回** | 年齢確認 Cookie 取得 | `view_mode`, `X_LIVE_SERVICE` 等 |
| 2 | GET | `https://x77.jp/live/twoshot_liverlist.php?search_tribe=1&search_group_id=2&search_shop_id=4&search_page_max=50&search_pageno=1` | 2分監視のたび | **2分に1回** | ライバー一覧 1ページ目 | boy_id, 名前, 待機/通話/オフライン |
| 3 | GET | 同上 `search_pageno=2,3,…` | 件数が50超のとき | **2分に1回**（1〜2追加） | 一覧ページング | 同上 |

### ステータス判定（HTML 内の表示）

| 表示クラス / 文言 | Bot の判定 |
|-------------------|------------|
| `live_situation02` | 🟢 待機中 |
| `live_situation01` | 📞 通話中 |
| 上記なし | ⚪ オフライン |

### リクエストヘッダ（主要）

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; …) Chrome/120.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml
Accept-Language: ja,en;q=0.9
Cookie: （年齢確認で取得した Cookie）
```

---

## 2. dgdgdg.com（男子学園 公式）

| # | メソッド | URL | タイミング | 頻度目安 | 目的 | 取得データ |
|---|----------|-----|------------|----------|------|------------|
| 1 | GET | `https://www.dgdgdg.com/boy/list.php?shop_id=4` | 2分監視のたび | **2分に1回** | 大阪店在籍ボーイ一覧 | boy_id, 名前 |
| 2 | GET | `https://www.dgdgdg.com/boy/shift.php?shop_id=4` | EX API 失敗時のみ | **通常0回**（障害時のみ） | 出勤シフト（フォールバック） | 日付, boy_id, 名前, シフト時間 |

### シフト時間の例

- `13:00～LAST`
- `13:00～21:00`
- `要問合せ`

---

## 3. EX API（開発者所有・シフト中継）

| # | メソッド | URL | タイミング | 頻度目安 | 目的 | 取得データ |
|---|----------|-----|------------|----------|------|------------|
| 1 | GET | `https://ex-shift.elion-dev08.workers.dev/api/shop/schedule?shop_id=4` | シフト照合時 | **2分 + 10分通知時** | 今日の出勤シフト（JSON） | boy_id, 名前, timeText |

- **dgdgdg シフトページの代替**（EX 内でスクレイプ済み）
- EX 障害時 → 上記 dgdgdg `shift.php` にフォールバック
- `EX_SHIFT_ENABLED=false` の場合は EX を使わず dgdgdg 直接

---

## 4. 手動実行時（幹部コマンド）

| コマンド | 追加アクセス |
|----------|--------------|
| `/更新` | x77 + dgdgdg ロスター（監視1回分と同じ） |
| `/出勤チェック` | 上記 + EX API（または dgdgdg shift） |
| `/レポート途中` | 上記 + 内部集計のみ（追加サイトアクセスなし） |

---

## 5. 1時間あたりのリクエスト目安（通常運用）

| 先 | 回数/時間（目安） |
|----|-------------------|
| x77.jp 年齢確認 | 2回 |
| x77.jp ライバー一覧 | 60〜90回（2〜3ページ × 30回監視） |
| dgdgdg list.php | 30回 |
| EX API（シフト） | 30〜35回（監視 + 10分通知） |
| dgdgdg shift.php | 0回（EX 正常時） |

**合計: 約 120〜160 GET / 時間**（POST・ログインなし）

---

## 6. やっていないこと

- ボーイ・幹部アカウントでのログイン
- プロフィール・シフトの編集
- 通話・チャット操作
- 決済・個人情報の送信
- 画像・動画の一括ダウンロード
- 秒単位の高頻度アクセス

---

## 7. データの流れ（図）

```
dgdgdg list.php ──► 在籍一覧（監視対象 ~135名）
        +
x77 liverlist   ──► 待機 / 通話 / オフライン
        │
        ▼
   Bot 内部（config.json）
        │
EX API / dgdgdg shift ──► 今日の出勤シフト
        │
        ▼
   シフト照合（未オンライン等）
        │
        ▼
   Discord #x77live（通知のみ）
```

---

## 8. 環境変数（アクセス先の変更）

| 変数 | 効果 |
|------|------|
| `SHOP_ID` | dgdgdg / x77 の店舗ID（デフォルト `4` = 大阪） |
| `POLL_INTERVAL_MINUTES` | x77 / ロスター取得間隔（デフォルト `2`） |
| `MONITOR_BUSINESS_HOURS_ONLY` | `false` で 24 時間監視 |
| `BUSINESS_HOURS_OPEN` / `CLOSE` | 監視・通知の営業時間帯 |
| `EX_SHIFT_ENABLED` | `false` で EX を使わず dgdgdg shift 直接 |
| `EX_SHIFT_JSON_URL` | シフト JSON の URL を変更 |

---

*最終更新: X77live リポジトリ `src/scraper.js`, `src/shift-scraper.js` に基づく*
