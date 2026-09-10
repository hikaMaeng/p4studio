#!/usr/bin/env bash
# React Model Render — primitive scaffolder.
#
# Copies the STABLE, known-good model primitives verbatim into a target instead
# of letting the model regenerate them (regeneration is where subscribe/emit and
# the tearing contract get subtly broken). Only the primitives are copied; the
# feature model + view are authored by adapting the examples.
#
#   Verbatim-copy (never regenerate):
#     assets/model/Emitter.ts      -> <domain-model-dir>/Emitter.ts
#     assets/model/SliceModel.ts   -> <domain-model-dir>/SliceModel.ts
#     assets/react/useModel.ts     -> <app-model-dir>/useModel.ts   (--app only)
#
#   Adapt-and-author (NOT copied by this script; read as examples):
#     assets/model/registry.ts, assets/model/SessionModel.ts,
#     assets/react/SessionView.tsx  — see references/model-decomposition.md.
#
# Safety: existing files are never overwritten (prints `skip existing`), so the
# script is idempotent and safe to re-run.
# Portable: resolves its own asset dir relative to the script; bash + cp only.
#
# Usage:
#   bash .codex/skills/react-model-render/scripts/scaffold-model.sh \
#       --domain packages/<service>_domain/src/front/model \
#       [--app apps/<service>/src/front/model]

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
assets="$script_dir/../assets"

domain_dir=""
app_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) domain_dir="$2"; shift 2 ;;
    --app) app_dir="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$domain_dir" ]]; then
  echo "usage: scaffold-model.sh --domain <domain-model-dir> [--app <app-model-dir>]" >&2
  exit 2
fi

copied=0
skipped=0

copy_one() {
  local src="$1" dest="$2"
  if [[ ! -f "$src" ]]; then
    echo "scaffold-model error=missing-asset src=$src" >&2
    exit 2
  fi
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" ]]; then
    echo "scaffold-model skip existing=$dest"
    skipped=$((skipped + 1))
    return
  fi
  cp "$src" "$dest"
  echo "scaffold-model copied=$dest"
  copied=$((copied + 1))
}

copy_one "$assets/model/Emitter.ts" "$domain_dir/Emitter.ts"
copy_one "$assets/model/SliceModel.ts" "$domain_dir/SliceModel.ts"

if [[ -n "$app_dir" ]]; then
  copy_one "$assets/react/useModel.ts" "$app_dir/useModel.ts"
fi

echo "scaffold-model status=ok copied=$copied skipped=$skipped"
echo "next: author the feature model by adapting assets/model/{registry,SessionModel}.ts and assets/react/SessionView.tsx; see references/model-decomposition.md"
