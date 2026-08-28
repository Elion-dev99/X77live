#!/usr/bin/env bash
# Railway 初回セットアップ用（ローカルで RAILWAY_API_TOKEN を設定して実行）
set -euo pipefail

if [[ -z "${RAILWAY_API_TOKEN:-}" ]]; then
  echo "RAILWAY_API_TOKEN が未設定です。"
  echo "https://railway.com/account/tokens で Account Token を作成してください。"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "=== Railway プロジェクト作成 ==="
npx railway login --browserless 2>/dev/null || true

npx railway up --name x77live-bot --yes --detach

echo ""
echo "=== 次のステップ（Railway Dashboard）==="
echo "1. Variables に以下を設定:"
echo "   DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID"
echo "   NOTIFY_CHANNEL_ID=1542848670221860884"
echo "   ADMIN_PASSWORD, DATA_DIR=/data"
echo "2. Volume を追加 → マウントパス /data"
echo "3. Settings → Healthcheck Path を空にする"
