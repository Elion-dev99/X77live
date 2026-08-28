#!/usr/bin/env bash
# Bot-Hosting から営業日レポート (data/reports) を SFTP で取得
#
# 準備:
#   cp bot-hosting.sftp.example .env.sftp
#   # .env.sftp に SFTP ユーザー名・パスワードを記入
#
# 実行:
#   bash scripts/sftp-pull-reports.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${SFTP_ENV_FILE:-$ROOT/.env.sftp}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE がありません。"
  echo "   cp bot-hosting.sftp.example .env.sftp して接続情報を設定してください。"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${SFTP_HOST:?SFTP_HOST が未設定}"
: "${SFTP_PORT:=2022}"
: "${SFTP_USER:?SFTP_USER が未設定}"
: "${SFTP_PASSWORD:?SFTP_PASSWORD が未設定}"
: "${SFTP_REMOTE_REPORTS:=/home/container/data/reports}"
: "${SFTP_LOCAL_DIR:=$ROOT/downloads/reports}"

mkdir -p "$SFTP_LOCAL_DIR"

BATCH="$(mktemp)"
trap 'rm -f "$BATCH"' EXIT

cat >"$BATCH" <<EOF
cd ${SFTP_REMOTE_REPORTS}
lcd ${SFTP_LOCAL_DIR}
mget *.json
mget *.csv
get index.json
bye
EOF

echo "📥 SFTP 取得: ${SFTP_USER}@${SFTP_HOST}:${SFTP_PORT}"
echo "   リモート: ${SFTP_REMOTE_REPORTS}"
echo "   ローカル: ${SFTP_LOCAL_DIR}"

if command -v sshpass >/dev/null 2>&1; then
  SSHPASS="$SFTP_PASSWORD" sshpass -e sftp \
    -P "$SFTP_PORT" \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile=/dev/null \
    -b "$BATCH" \
    "${SFTP_USER}@${SFTP_HOST}"
else
  echo "⚠️ sshpass がありません。パスワード入力が必要です。"
  echo "   macOS: brew install sshpass / Linux: apt install sshpass"
  sftp \
    -P "$SFTP_PORT" \
    -o StrictHostKeyChecking=accept-new \
    -b "$BATCH" \
    "${SFTP_USER}@${SFTP_HOST}"
fi

echo "✅ 完了: $SFTP_LOCAL_DIR"
ls -la "$SFTP_LOCAL_DIR"
