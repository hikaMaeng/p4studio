#!/usr/bin/env bash
# Monorepo Architecture Guard — mechanical checks.
#
# Verifies the machine-decidable subset of the skill contract so a review does
# not rely on prompt reading alone. Prints one `check ... status=ok|violation`
# line per rule and a final `arch-check status=ok|violation violations=N` line.
# Exit code: 0 when clean, 1 when any violation, 2 on a setup error.
#
# The prose-only rules (helper-decomposition taste, class-as-namespace, "domain
# logic lives in the paired package") still need human judgment; this script
# covers only what greps and file structure can prove.
#
# Usage:
#   bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh [repo-root]
#
# Foreign-runtime apps (Python, native, etc.) carry no root package.json and are
# not JS/TS workspace members, so they are auto-exempted from the *_domain
# pairing rule with no project-specific configuration.
#
# Optional env:
#   ARCH_RUNTIME_ONLY_APPS  extra space-separated app names to exempt from the
#                           pairing rule beyond the package.json auto-detection.
#                           Default: empty.

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

root="$( resolve_root "${1:-}" )"
cd "$root" || exit 2

runtime_only_apps=" ${ARCH_RUNTIME_ONLY_APPS:-} "
violations=0

emit() {
  # emit <name> <ok|violation> <detail...>
  local name="$1" status="$2"
  shift 2
  echo "check name=$name status=$status ${*:-}"
  [[ "$status" == "violation" ]] && violations=$((violations + 1)) || true
}

is_runtime_only() {
  local needle="$1"
  [[ "$runtime_only_apps" == *" $needle "* ]]
}

# 1. root package.json declares npm workspaces
if [[ -f package.json ]] && grep -Eq '"workspaces"[[:space:]]*:' package.json; then
  emit workspaces ok
else
  emit workspaces violation detail=root-package.json-declares-no-workspaces
fi

# 2. npm is the only package manager declared by the repository.
if node -e 'const p=require("./package.json"); process.exit(/^npm@/.test(p.packageManager || "") ? 0 : 1)'; then
  emit package-manager ok detail=npm
else
  emit package-manager violation detail=root-package-manager-is-not-npm
fi

# 3. package-lock.json committed. It is what makes `npm ci` reproducible; the
#    scaffold has none until the first install, so this is a warn there.
if [[ -f package-lock.json ]]; then
  emit lockfile-present ok
elif [[ -d node_modules ]]; then
  emit lockfile-present violation detail=installed-without-package-lock.json
else
  emit lockfile-present warn detail=not-installed-yet
fi

# 5. packages/* must never import from apps/*  (reverse dependency)
reverse_hits=""
if [[ -d packages ]]; then
  reverse_hits="$(grep -REn \
    --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.cts' \
    "(from[[:space:]]+['\"]|require\(['\"]|import\(['\"])(apps/|\.\./\.\./apps/)" \
    packages 2>/dev/null || true)"
fi
if [[ -z "$reverse_hits" ]]; then
  emit no-package-imports-app ok
else
  emit no-package-imports-app violation detail=packages-import-apps
  printf '%s\n' "$reverse_hits" | sed 's/^/  reverse-import: /'
fi

# 6. each apps/<svc> pairs with packages/<svc>_domain (runtime-only apps exempt)
if [[ -d apps ]]; then
  for app_dir in apps/*/; do
    [[ -d "$app_dir" ]] || continue
    app="$(basename "$app_dir")"
    # Foreign-runtime app (no package.json => not a JS/TS workspace member).
    if [[ ! -f "$app_dir/package.json" ]]; then
      emit "pair:$app" ok detail=foreign-runtime-exempt
      continue
    fi
    if is_runtime_only "$app"; then
      emit "pair:$app" ok detail=runtime-only-exempt
      continue
    fi
    if [[ -d "packages/${app}_domain" ]]; then
      emit "pair:$app" ok
    else
      emit "pair:$app" violation detail="missing-packages/${app}_domain"
    fi
  done
fi

# 7. non-exact versions in dependencies/devDependencies of any workspace manifest
#    (peerDependencies are allowed ranges and are skipped).
#
#    A dependency on another package in this repository is exempt: it resolves
#    to a symlink, so the range never selects anything and pinning it only
#    creates a second place to edit on every version bump.
local_packages="$(find apps packages -maxdepth 2 -name package.json \
  -not -path '*/node_modules/*' -type f 2>/dev/null \
  | while IFS= read -r m; do node -p "require('./${m#./}').name" 2>/dev/null; done \
  | paste -sd ',' -)"

range_hits=""
while IFS= read -r manifest; do
  block="$(node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const local = new Set((process.argv[2] || "").split(",").filter(Boolean));
    const out = [];
    for (const field of ["dependencies", "devDependencies"]) {
      const deps = m[field] || {};
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec !== "string") continue;
        if (local.has(name)) continue;
        if (/^(workspace:|file:|link:|portal:|patch:|npm:.*@)/.test(spec)) continue;
        if (/[\^~]|\s-\s|\|\||\bx\b|\.\*/.test(spec) || spec === "*" || spec === "latest") {
          out.push(`${field}:${name}@${spec}`);
        }
      }
    }
    if (out.length) console.log(process.argv[1] + " => " + out.join(", "));
  ' "$manifest" "$local_packages" 2>/dev/null || true)"
  [[ -n "$block" ]] && range_hits="$range_hits$block"$'\n'
done < <(find . -name package.json \
  -not -path '*/node_modules/*' -not -path '*/dist/*' \
  -type f 2>/dev/null | sort)
if [[ -z "$range_hits" ]]; then
  emit exact-versions ok
else
  emit exact-versions violation detail=non-exact-version-ranges
  printf '%s' "$range_hits" | sed 's/^/  range: /'
fi

# 8. Folder granularity. Containment against model-driven edits comes from
#    folder boundaries, so a folder holding many files is the signal that the
#    split tracked size instead of rate of change. Judgment call, so `warn`.
crowded_limit="${ARCH_FOLDER_FILE_LIMIT:-8}"
crowded=""
while IFS= read -r dir; do
  count="$(find "$dir" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l)"
  [[ "$count" -gt "$crowded_limit" ]] && crowded="$crowded  crowded-folder: ${dir#./} ($count files)"$'\n'
done < <(find apps packages -type d -path '*/src/*' \
  -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null | sort)

if [[ -z "$crowded" ]]; then
  emit folder-granularity ok
else
  emit folder-granularity warn detail="folders above $crowded_limit source files"
  printf '%s' "$crowded"
fi

# 9. Protocol purity. `common/protocol` is the wire-contract dependency sink, so
#    both client and server can reach it; it must import nothing from front,
#    server, or a feature model. Unambiguous, so a hard violation.
protocol_files="$(find packages/*/src/common/protocol -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null || true)"
if [[ -z "$protocol_files" ]]; then
  emit protocol-purity ok detail=no-protocol-dir
else
  impure="$(grep -En "(from|import\()[[:space:]]*['\"][^'\"]*/(front|server)(/|['\"])" $protocol_files 2>/dev/null || true)"
  if [[ -z "$impure" ]]; then
    emit protocol-purity ok
  else
    emit protocol-purity violation detail=protocol-imports-front-or-server
    printf '%s\n' "$impure" | sed 's/^/  impure-import: /'
  fi
fi

# 10. Protocol structure. One purpose folder per wire domain, each with an
#     `index.ts` barrel; no loose files directly under `common/protocol`.
protocol_dirs="$(find packages/*/src/common/protocol -maxdepth 0 -type d 2>/dev/null || true)"
if [[ -z "$protocol_dirs" ]]; then
  emit protocol-structure ok detail=no-protocol-dir
else
  struct_bad=""
  while IFS= read -r pdir; do
    [[ -z "$pdir" ]] && continue
    loose="$(find "$pdir" -maxdepth 1 -type f -name '*.ts' 2>/dev/null || true)"
    [[ -n "$loose" ]] && struct_bad="$struct_bad  loose-file-outside-purpose-folder: $(printf '%s ' $loose)"$'\n'
    while IFS= read -r purpose; do
      [[ -z "$purpose" ]] && continue
      [[ -f "$purpose/index.ts" ]] || struct_bad="$struct_bad  purpose-folder-missing-index: ${purpose#./}"$'\n'
    done < <(find "$pdir" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
  done <<< "$protocol_dirs"
  if [[ -z "$struct_bad" ]]; then
    emit protocol-structure ok
  else
    emit protocol-structure violation detail=protocol-folder-shape
    printf '%s' "$struct_bad"
  fi
fi

# 11. Wire shapes belong in `common/protocol`. Naming-based detection, so `warn`
#     (a react `*Event` or an internal `*Request` can be a false positive). A
#     wire type under `src/front`/`src/server` is the real leak: the boundary
#     stops the other side from sharing it, so the two drift.
wire_re='export (interface|type) [A-Za-z0-9_]*(Request|Response|Snapshot|Message|Event|Payload|Command|Envelope|Frame|Notification)\b'
wire_hits="$(grep -REn "$wire_re" packages/*/src --include='*.ts' 2>/dev/null | grep -v '/common/protocol/' || true)"
wire_boundary="$(printf '%s\n' "$wire_hits" | grep -E '/src/(front|server)/' || true)"
wire_outside="$(printf '%s\n' "$wire_hits" | grep -Ev '/src/(front|server)/' | grep -E '/src/' || true)"
if [[ -z "$wire_boundary" ]]; then
  emit wire-in-app-boundary ok
else
  emit wire-in-app-boundary warn detail="wire types under src/front or src/server; move to common/protocol"
  printf '%s\n' "$wire_boundary" | sed 's/^/  wire-boundary: /'
fi
if [[ -n "$wire_outside" ]]; then
  emit wire-outside-protocol warn detail="$(printf '%s\n' "$wire_outside" | grep -c .) wire types in common but outside common/protocol"
fi

echo "arch-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
