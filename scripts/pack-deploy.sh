#!/usr/bin/env bash
# Monkey Network / SFTP 用デプロイ zip（node_modules 除外）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/x77live-deploy.zip}"

cd "$ROOT"
zip -r "$OUT" . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x "data/*" \
  -x ".env" \
  -x "test/*" \
  -x "*.zip" \
  -x ".cursor/*"

echo "Created: $OUT"
echo "Upload to /home/container/ via SFTP, then: npm install && npm start"
