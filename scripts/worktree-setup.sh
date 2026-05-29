#!/usr/bin/env bash
set -euo pipefail

CURRENT=$(pwd -P)
ROOT=$(git worktree list | head -1 | awk '{print $1}')
ROOT=$(cd "$ROOT" && pwd -P)

link_from_root() {
  local source_rel="$1"
  local dest_rel="$2"
  local source="$ROOT/$source_rel"
  local dest="$CURRENT/$dest_rel"

  if [ "$source" = "$dest" ]; then
    echo "Refusing to link $dest_rel to itself. Run worktree:setup only from a secondary worktree." >&2
    exit 1
  fi

  ln -sfn "$source" "$dest"
}

if [ "$CURRENT" = "$ROOT" ]; then
  echo "Refusing to run worktree:setup in the primary worktree ($ROOT)." >&2
  exit 1
fi

# alias .env files to root
link_from_root ".env" ".env"
link_from_root ".dev.vars" "apps/wh/.dev.vars"
link_from_root "apps/web/.env" "apps/web/.env"
link_from_root "apps/demo/.env" "apps/demo/.env"
link_from_root "ob" "ob"

pnpm install
