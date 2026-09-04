# 02. 環境変数と config.json

## 環境変数一覧

初回起動時に `defaultConfig()` へ反映。以降は `config.json` が優先（`loadConfig()` で env デフォルトとマージ）。

### 必須

| 変数 | 説明 |
|------|------|
| `DISCORD_TOKEN` | Bot トークン。未設定 or `your_bot_token_here` で起動失敗 |
| `DISCORD_CLIENT_ID` | Application ID（スラッシュ登録） |
| `ADMIN_PASSWORD` | 管理コマンド用。初回起動時に scrypt ハッシュ化して config 保存 |

### Discord

| 変数 | デフォルト | config フィールド |
|------|-----------|------------------|
| `DISCORD_GUILD_ID` | なし | —（ギルド限定登録に使用） |
| `NOTIFY_CHANNEL_ID` | なし | `notifyChannelId` |
| `ADMIN_USER_ID` | なし | `adminUserId`, `adminUserIds[]`（カンマ区切り可） |
| `ADMIN_ROLE_IDS` | 空 | `adminRoleIds[]` ※認証未使用 |
| `MENTION_ROLE_ID` | なし | `mentionRoleId` |

### 監視・通知

| 変数 | デフォルト | config フィールド |
|------|-----------|------------------|
| `STORE_NAME` | `大阪店` | `storeName` |
| `SHOP_ID` | `4` | `shopId` |
| `POLL_INTERVAL_MINUTES` | `2` | `pollIntervalMinutes` |
| `NOTIFY_INTERVAL_MINUTES` | `10` | `notifyIntervalMinutes` |
| `NOTIFY_ENABLED` | `true` | `notifyEnabled` |
| `DATA_DIR` | `data` | —（ファイルパスのみ） |
| `PORT` | `8080` | —（health server、`/` → `ok`） |
| `LOG_LEVEL` | `INFO` | `logger.js`: DEBUG / INFO / WARN / ERROR |
| `SESSION_TOKEN` | なし | 環境変数セッション（高度・通常不要） |

### 認証

| 変数 | デフォルト | config フィールド |
|------|-----------|------------------|
| `AUTH_SESSION_HOURS` | `8` | `auth.sessionHours` |
| `ADMIN_PASSWORD_RESET` | なし | `true`/`1` で env パスワード再設定 |

### 営業時間・監視

| 変数 | デフォルト | config フィールド |
|------|-----------|------------------|
| `BUSINESS_HOURS_OPEN` | `13:00` | `settings.businessHoursOpen` |
| `BUSINESS_HOURS_CLOSE` | `01:00` | `settings.businessHoursClose` |
| `MONITOR_BUSINESS_HOURS_ONLY` | `true` | `settings.monitorBusinessHoursOnly` |
| `DAILY_SUMMARY_AT` | `01:00` | `settings.dailySummaryAt` |

### アラート・バックアップ

| 変数 | デフォルト | settings フィールド |
|------|-----------|---------------------|
| `SCRAPE_ALERT_ENABLED` | `true` | `scrapeAlertEnabled` |
| `SCRAPE_ALERT_THRESHOLD` | `3` | `scrapeAlertThreshold` |
| `REPORT_BACKUP_ENABLED` | `true` | `reportBackupEnabled` |
| `REPORT_BACKUP_INTERVAL_HOURS` | `3` | `reportBackupIntervalHours` |
| `REPORT_BACKUP_NOTIFY_ADMIN` | `true` | `reportBackupNotifyAdmin` |
| `CONFIG_BACKUP_ENABLED` | `true` | `configBackupEnabled` |
| `CONFIG_BACKUP_INTERVAL_HOURS` | `3` | `configBackupIntervalHours` |
| `BOT_LIVENESS_ENABLED` | `true` | `botLivenessEnabled` |
| `BOT_LIVENESS_MINUTES` | `10` | `botLivenessMinutes` |
| `WEEKLY_SUMMARY_ENABLED` | `true` | `weeklySummaryEnabled` |

### シフト

| 変数 | デフォルト | 備考 |
|------|-----------|------|
| `SHIFT_CHECK_ENABLED` | `true` | `settings.shiftCheckEnabled` |
| `SHIFT_ALERT_ENABLED` | `true` | **未使用**（config 保存のみ） |
| `SHIFT_GRACE_MINUTES` | `15` | `settings.shiftGraceMinutes` |
| `EX_SHIFT_ENABLED` | `true` | `false` のみ無効。config 非保存、env 直読 |
| `EX_SHIFT_JSON_URL` | EX デフォルト URL | `settings.exShiftJsonUrl` でも上書き可 |

---

## config.json スキーマ

パス: `{DATA_DIR}/config.json`

### トップレベル

```typescript
{
  storeName: string;              // "大阪店"
  shopId: string;                 // "4"
  notifyChannelId: string | null;
  adminUserId: string | null;
  adminUserIds: string[];
  notifyIntervalMinutes: number;  // 10
  pollIntervalMinutes: number;    // 2
  notifyEnabled: boolean;
  adminRoleIds: string[];         // 未使用
  mentionRoleId: string | null;

  auth: AuthConfig;
  boys: Record<boyId, BoyMeta>;
  boyStatuses: Record<boyId, BoyStatus>;
  history: HistoryEntry[];

  dailyOnlineStats: DailyStats | null;
  lastDailySummarySessionKey: string | null;
  lastReportBackupAt: string | null;       // ISO
  lastReportBackupSessionKey: string | null;
  lastConfigBackupAt: string | null;
  lastWeeklySummaryWeekKey: string | null; // "2026-08-24_2026-08-30"

  lastShiftFetch: ShiftFetchMeta | null;
  lastShiftCompare: ShiftCompareResult | null;
  shiftAlertState: object;         // レガシー・未使用

  botLiveness: { alertSent: boolean; lastAlertAt: string | null };
  scrapeHealth: ScrapeHealth;

  settings: Settings;
  lastNotifyAt: string | null;
  lastScrapeAt: string | null;
  lastSummary: Summary | null;
}
```

### boys[boyId]

```typescript
{
  name: string;
  excluded: boolean;   // true = 監視除外
  addedAt: string;     // ISO
}
```

### boyStatuses[boyId]

```typescript
{
  name: string;
  liveName: string | null;
  status: "待機中" | "通話中" | "オフライン";
  updatedAt: string;   // ISO（最終スクレイプ時刻）
}
```

### lastSummary

```typescript
{
  total: number;
  waiting: number;
  inCall: number;
  offline: number;
}
```

### dailyOnlineStats

```typescript
{
  sessionKey: string;           // "2026-08-30"
  boys: Record<boyId, {
    name: string;
    onlineMinutes: number;
    waitingMinutes: number;
    inCallMinutes: number;
  }>;
  lastTickAt: string | null;
}
```

### lastShiftCompare

```typescript
{
  at: string;
  dateKey: string;
  source: "ex-api" | "dgdgdg" | string;
  scheduledCount: number;
  scheduledNotOnline: Array<{
    boyId, name, shiftTime, status
  }>;
  onlineNotScheduled: Array<{
    boyId, name, status
  }>;
}
```

### scrapeHealth

```typescript
{
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastError: string | null;
  alertSent: boolean;
  lastSuccessAt: string | null;
}
```

### settings（全フィールド）

| フィールド | 型 | デフォルト |
|-----------|-----|-----------|
| `showWaitingList` | boolean | true |
| `showInCallList` | boolean | true |
| `showOfflineList` | boolean | true |
| `embedColorWaiting` | string | `#57F287` |
| `embedColorInCall` | string | `#FEE75C` |
| `embedColorOffline` | string | `#99AAB5` |
| `embedColorSummary` | string | `#5865F2` |
| `quietHoursStart` | string\|null | null |
| `quietHoursEnd` | string\|null | null |
| `pingOnStatusChange` | boolean | true |
| `pingOnNewBoy` | boolean | true |
| `dailySummaryEnabled` | boolean | true |
| `businessHoursOpen` | string | `13:00` |
| `businessHoursClose` | string | `01:00` |
| `monitorBusinessHoursOnly` | boolean | true |
| `dailySummaryAt` | string | `01:00` |
| `scrapeAlertEnabled` | boolean | true |
| `scrapeAlertThreshold` | number | 3 |
| `reportBackupEnabled` | boolean | true |
| `reportBackupIntervalHours` | number | 3 |
| `reportBackupNotifyAdmin` | boolean | true |
| `configBackupEnabled` | boolean | true |
| `configBackupIntervalHours` | number | 3 |
| `botLivenessEnabled` | boolean | true |
| `botLivenessMinutes` | number | 10 |
| `weeklySummaryEnabled` | boolean | true |
| `shiftCheckEnabled` | boolean | true |
| `shiftAlertEnabled` | boolean | true ※未使用 |
| `shiftGraceMinutes` | number | 15 |
| `statusChangeChannelId` | string\|null | null |
| `maxHistoryEntries` | number | 200 |
| `sortBy` | `"name"`\|`"status"` | `"name"` |
| `footerText` | string | `X77live 大阪店 オンライン監視` |
| `liveUrl` | string | x77 liverlist URL |

### history[].type 一覧

| type | 主なフィールド |
|------|---------------|
| `status_change` | boyId, name, from, to |
| `boy_new` | boyId, name |
| `boy_exclude` / `boy_include` | boyId, name |
| `daily_summary` | sessionKey, onlineCount, reportJson, reportCsv |
| `weekly_summary` | weekKey, weekStart, weekEnd, … |
| `report_backup` | sessionKey, onlineCount, … |
| `scrape_failure` / `scrape_alert` / `scrape_recovered` | consecutiveFailures, error |
| `bot_liveness_alert` | thresholdMinutes, lastScrapeAt |
| `bot_restart` | userId, userTag |

全 entry に `at: ISO` が `addHistory()` で付与される。
