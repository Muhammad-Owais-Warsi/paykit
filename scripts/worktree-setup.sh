#!/usr/bin/env bash
set -euo pipefail

CURRENT=$(pwd -P)
ROOT=$(git worktree list | head -1 | awk '{print $1}')
ROOT=$(cd "$ROOT" && pwd -P)

if [ "$CURRENT" = "$ROOT" ]; then
  echo "Refusing to run worktree:setup in the primary worktree ($ROOT)." >&2
  exit 1
fi

# alias .env files to root
ln -sf "$ROOT/.env" ./
ln -sf "$ROOT/.dev.vars" ./apps/wh/
ln -sf "$ROOT/apps/web/.env" ./apps/web/
ln -sf "$ROOT/apps/demo/.env" ./apps/demo/
ln -sf "$ROOT/ob" ./ob

pnpm install
