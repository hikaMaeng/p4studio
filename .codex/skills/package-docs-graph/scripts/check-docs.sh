#!/usr/bin/env bash
# Package Docs Graph — mechanical checks.
#
# Enforces the machine-decidable subset of the docs-graph contract so a review
# does not depend on a model prose-reading every package: required-doc presence,
# README nav-table completeness (every required doc linked), and architecture.md
# path-table drift against real `src/*`. Prints one
# `check pkg=<p> name=<rule> status=ok|violation|warn ...` line per rule and a
# final `docs-check status=ok|violation violations=N` line.
# Exit: 0 when no hard violation, 1 on any violation, 2 on a setup error.
#
# Portable: bash + grep + find only; relative paths; no project-specific names.
#
# Usage:
#   bash .codex/skills/package-docs-graph/scripts/check-docs.sh [repo-root] [--include-apps]

set -euo pipefail

# Resolve the repository root from this script's own location, so the checker is
# correct wherever this skill was copied and whatever the caller's working
# directory is. An explicit argument still wins.
resolve_root() {
  if [[ -n "${1:-}" ]]; then
    ( cd "$1" && pwd -P )
    return
  fi
  local dir
  dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd -P )"
  while [[ "$dir" != "/" && -n "$dir" ]]; do
    if [[ -f "$dir/package.json" && -d "$dir/.codex" ]]; then
      printf '%s\n' "$dir"
      return
    fi
    dir="$( dirname "$dir" )"
  done
  pwd -P
}

root=""
include_apps=0
for arg in "$@"; do
  case "$arg" in
    --include-apps) include_apps=1 ;;
    *) root="$arg" ;;
  esac
done
root="$( resolve_root "$root" )"
cd "$root" || exit 2

required=(overview architecture api usage constraints internals testing)
violations=0

emit() {
  local pkg="$1" name="$2" status="$3"
  shift 3
  echo "check pkg=$pkg name=$name status=$status ${*:-}"
  [[ "$status" == "violation" ]] && violations=$((violations + 1)) || true
}

check_unit() {
  local dir="$1" pkg
  pkg="$(basename "$dir")"

  # Only doc-bearing workspace members: must have a src/ tree.
  [[ -d "$dir/src" ]] || return 0

  if [[ ! -f "$dir/README.md" ]]; then
    emit "$pkg" readme violation detail=missing-README.md
    return 0
  fi
  emit "$pkg" readme ok

  local doc missing_files="" missing_links=""
  for doc in "${required[@]}"; do
    [[ -f "$dir/docs/$doc.md" ]] || missing_files="$missing_files $doc"
    grep -q "docs/$doc.md" "$dir/README.md" || missing_links="$missing_links $doc"
  done

  if [[ -z "$missing_files" ]]; then
    emit "$pkg" required-docs ok
  else
    emit "$pkg" required-docs violation detail="missing:${missing_files# }"
  fi

  if [[ -z "$missing_links" ]]; then
    emit "$pkg" nav-links ok
  else
    emit "$pkg" nav-links violation detail="README-missing-links:${missing_links# }"
  fi

  # architecture.md path-table drift vs real src/*
  local arch="$dir/docs/architecture.md"
  if [[ -f "$arch" ]]; then
    local table_dirs real_dirs entry name stale="" undocumented=""
    # `|| true` is load-bearing: under `set -o pipefail` a grep with no match
    # fails the assignment and `set -e` kills the run mid-package, which reads
    # as a clean pass to anything that only looks for violation lines.
    table_dirs="$(grep -oE '`src/[^`/]+' "$arch" 2>/dev/null | sed 's/`src\///' | sort -u || true)"
    real_dirs="$(find "$dir/src" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | sort -u || true)"

    # architecture.md is the router node. Without a path table there is nothing
    # to drill down from, and drift can never be detected either.
    if [[ -z "$table_dirs" && -n "$real_dirs" ]]; then
      emit "$pkg" arch-router violation detail=architecture.md-has-no-src-path-table
    else
      emit "$pkg" arch-router ok
    fi
    while IFS= read -r entry; do
      [[ -z "$entry" ]] && continue
      [[ -d "$dir/src/$entry" ]] || stale="$stale $entry"
    done <<< "$table_dirs"
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      grep -q "\`src/$name" "$arch" || undocumented="$undocumented $name"
    done <<< "$real_dirs"

    if [[ -n "$stale" ]]; then
      emit "$pkg" arch-drift violation detail="table-entry-missing-in-src:${stale# }"
    elif [[ -n "$undocumented" ]]; then
      emit "$pkg" arch-drift warn detail="src-dir-absent-from-table:${undocumented# }"
    else
      emit "$pkg" arch-drift ok
    fi
  fi
}

for dir in packages/*/; do
  [[ -d "$dir" ]] && check_unit "$dir"
done
if [[ "$include_apps" -eq 1 ]]; then
  for dir in apps/*/; do
    # Foreign-runtime apps (no package.json) are not doc-graph units here.
    [[ -d "$dir" && -f "$dir/package.json" ]] && check_unit "$dir"
  done
fi

echo "docs-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
