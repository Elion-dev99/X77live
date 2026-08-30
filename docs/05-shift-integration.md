# 05. シフト連携

## 概要

今日の出勤シフトと x77 オンライン状態を照合し、不一致を `config.lastShiftCompare` に保存。定期 Discord 通知に反映する。

**データソース優先順位**:

```
1. EX API（JSON）
2. dgdgdg shift.php（HTML）— EX 失敗 or 空のときのみ
```

---

## EX API（shift-scraper.js）

### デフォルト URL

```
https://ex-shift.elion-dev08.workers.dev/api/shop/schedule?shop_id=4
```

上書き:

- 環境変数 `EX_SHIFT_JSON_URL`
- `config.settings.exShiftJsonUrl`

無効化: `EX_SHIFT_ENABLED=false`

### 対応 JSON 形式

**API レスポンス**（shop schedule）:

```json
{
  "shopId": 4,
  "days": [{
    "date": "2026-08-30",
    "boys": [{
      "boyId": 10235,
      "name": "つむぎ",
      "timeText": "13:00～LAST",
      "status": "work"
    }]
  }]
}
```

**手動エクスポート**:

```json
{
  "date": "2026-08-30",
  "boys": [{
    "boyId": "10235",
    "name": "つむぎ",
    "start": "13:00",
    "end": "21:00"
  }]
}
```

正規化後の boy:

```typescript
{ boyId: string, name: string, shiftTime: string, night?: boolean|null }
// shiftTime 例: "13:00～21:00", "13:00～LAST", "要問合せ"
```

---

## dgdgdg フォールバック

URL: `https://www.dgdgdg.com/boy/shift.php?shop_id={shopId}`

HTML パターン:

```html
<h2><span>8/30(土)</span>の出勤ボーイ情報</h2>
<li>… boy_id=10235 … boy_data_name"><span>つむぎ</span> … class="time">13:00～LAST</li>
```

`parseShiftPage()` → 日付ごとの `boys[]`

---

## 照合タイミング

| トリガー | force スクレイプ | 営業時間 |
|----------|-----------------|----------|
| 各スクレイプ成功後 | — | 要 |
| 定期通知直前 | — | 要 |
| `/出勤チェック` | ✅ | 要（手動は scrape force） |

`shiftCheckEnabled === false` → 全スキップ

---

## 照合ロジック（shift-compare.js）

### A. 出勤なのに未オンライン（scheduledNotOnline）

各 scheduled boy について、以下 **いずれか** でスキップ:

1. `boys[boyId].excluded`
2. `isInquiryShiftTime(shiftTime)` — `/要問/i` マッチ
3. `!isWithinShiftWindow(shiftTime, now)` — シフト時間外
4. `!hasShiftStarted(shiftTime, now, graceMinutes)` — 開始+猶予前

残りで `status` が待機中/通話中でなければフラグ。

### B. シフト外オンライン（onlineNotScheduled）

- オンライン中（待機/通話）
- 今日のシフト一覧に boy_id がない
- excluded でない

### シフト時間パース（isWithinShiftWindow）

| shiftTime | 終了時刻 |
|-----------|----------|
| `要問合せ` | 営業時間 open〜close |
| `13:00～LAST` | `businessHoursClose`（01:00） |
| `13:00～21:00` | 21:00 |
| パース不可 | **常に true**（安全側） |

跨ぎシフト（start > end）: 深夜跨ぎとして処理。

### 猶予（hasShiftStarted）

シフト開始時刻 + `shiftGraceMinutes`（デフォルト **15 分**）経過後から未オンライン判定。

---

## 結果の保存（lastShiftCompare）

```json
{
  "at": "2026-08-30T13:24:00.000Z",
  "dateKey": "2026-08-30",
  "source": "ex-api",
  "scheduledCount": 12,
  "scheduledNotOnline": [...],
  "onlineNotScheduled": [...]
}
```

---

## 手動 `/出勤チェック`

1. `runScrape(..., { force: true })`
2. `fetchTodayShift()` + `compareShiftWithStatuses()`
3. `buildShiftCheckEmbed()` で結果表示（チャンネル投稿なし、ephemeral）

---

## EX リポジトリ

開発者所有: [Elion-dev99/EX](https://github.com/Elion-dev99/EX)

Bot は EX を **読み取り専用** で利用。シフト編集は EX 側で行う。

---

## 設定

| 設定 | 効果 |
|------|------|
| `SHIFT_CHECK_ENABLED=false` | 照合オフ |
| `SHIFT_GRACE_MINUTES=20` | 猶予 20 分 |
| `EX_SHIFT_ENABLED=false` | dgdgdg 直接 |
| `SHOP_ID=9` | 他店舗（要 EX URL も変更） |

---

## 要問合せシフト

`要問合せ` / `要問い合わせ` を含む shiftTime は **未オンラインアラート対象外**。  
（時間未定のため誤検知防止）
