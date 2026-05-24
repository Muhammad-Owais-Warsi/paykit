#!/usr/bin/env bash
set -euo pipefail

# discover root worktree dir
ROOT=$(git worktree list | head -1 | awk '{print $1}')

# alias .env files to root
ln -sf "$ROOT/.env" ./
ln -sf "$ROOT/.dev.vars" ./apps/wh/
ln -sf "$ROOT/apps/web/.env" ./apps/web/
ln -sf "$ROOT/apps/demo/.env" ./apps/demo/
ln -sf "$ROOT/ob" ./ob

pnpm install
