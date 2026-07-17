#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting MongoDB + Redis..."
docker compose -f docker/docker-compose.yml up -d

echo "Installing dependencies..."
npm install

echo "Building shared package..."
npm run build --workspace=@codexcareer/shared

echo "Ready. Next:"
echo "  npm run dev:server"
echo "  npm run dev:client"
echo "  npm run build --workspace=@codexcareer/extension"
