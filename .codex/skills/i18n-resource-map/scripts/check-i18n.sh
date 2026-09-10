#!/usr/bin/env bash
# i18n Resource Map - mechanical checks.
#
# Decides the countable rules: the required language set, key-set parity across
# languages, the enum-name derivation, keys referenced but not defined, and
# user-visible string literals left in views.
#
# Prints one `check name=<rule> status=ok|violation|warn detail=...` line per
# rule and a final `i18n-check status=... violations=N` line.
# Exit code: 0 when no violation, 1 otherwise, 2 on a setup error.
#
# Usage:
#   bash .codex/skills/i18n-resource-map/scripts/check-i18n.sh [repo-root]

set -uo pipefail

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

required_languages="ar en es fr hi ko pt zh"
violations=0

emit() {
  local name="$1" status="$2" detail="${3:-}"
  echo "check name=$name status=$status detail=$detail"
  [[ "$status" == "violation" ]] && violations=$((violations + 1))
  return 0
}

emit_each() {
  # one violation per stdin line, or a single ok when there is none
  local name="$1" ok_detail="$2" found=0 line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    emit "$name" violation "$line"
    found=1
  done
  [[ "$found" -eq 0 ]] && emit "$name" ok "$ok_detail"
  return 0
}

app_dirs=()
while IFS= read -r dir; do
  app_dirs+=("$dir")
done < <(find apps -maxdepth 3 -type d -name i18n -path '*/assets/*' 2>/dev/null | sed 's#/assets/i18n$##' | sort)

if [[ ${#app_dirs[@]} -eq 0 ]]; then
  emit i18n-present violation "no apps/<service>/assets/i18n directory"
  echo "i18n-check status=violation violations=$violations root=$root"
  exit 1
fi

for app in "${app_dirs[@]}"; do
  service="${app#apps/}"
  i18n_dir="$app/assets/i18n"

  # 1. required language set
  missing=""
  for lang in $required_languages; do
    [[ -f "$i18n_dir/$lang.json" ]] || missing="$missing $lang"
  done
  if [[ -n "$missing" ]]; then
    emit "languages:$service" violation "missing:${missing# }"
  else
    emit "languages:$service" ok "$(ls "$i18n_dir"/*.json 2>/dev/null | wc -l) bundles"
  fi

  # 2. every bundle carries the identical key set, and 3. flat keys only
  emit_each "key-parity:$service" "all bundles agree" < <(
    node -e '
const fs = require("node:fs");
const dir = process.argv[1];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
if (files.length === 0) process.exit(0);
const read = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
const bundles = files.map((f) => [f, read(f)]);
for (const [file, bundle] of bundles) {
  for (const [key, value] of Object.entries(bundle)) {
    if (typeof value !== "string") console.log(`${file}: key "${key}" is not a string - bundles must be flat`);
  }
}
const union = [...new Set(bundles.flatMap(([, b]) => Object.keys(b)))].sort();
for (const [file, bundle] of bundles) {
  for (const key of union) {
    if (!(key in bundle)) console.log(`${file}: missing key "${key}"`);
  }
}
' "$i18n_dir"
  )

  # 4. resource.ts maps: enum name derivation, and keys that exist
  while IFS= read -r map; do
    [[ -z "$map" ]] && continue
    emit_each "map:${map#apps/}" "keys defined and named mechanically" < <(
      node -e '
const fs = require("node:fs");
const [mapPath, i18nDir] = process.argv.slice(1);
const source = fs.readFileSync(mapPath, "utf8");
const files = fs.readdirSync(i18nDir).filter((f) => f.endsWith(".json"));
const known = new Set(files.flatMap((f) => Object.keys(JSON.parse(fs.readFileSync(`${i18nDir}/${f}`, "utf8")))));
const entries = [...source.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]+)"/gm)];
for (const [, name, key] of entries) {
  const expected = key.replace(/\./g, "_").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  if (name !== expected) console.log(`${name} should be ${expected} for key "${key}"`);
  if (!known.has(key)) console.log(`key "${key}" is not defined in any language bundle`);
}
' "$map" "$i18n_dir"
    )
  done < <(find "$app/src" -name 'resource.ts' 2>/dev/null | sort)
done

# 5. no raw-string key lookups - they defeat the map entirely
emit_each raw-key-lookup "no t[\"...\"] lookups" < <(
  grep -rnE 't\[["'"'"']' --include=*.tsx --include=*.ts apps/*/src 2>/dev/null | sed 's/:.*t\[/: t[/' | head -20
)

# 6. no component reads a bundle directly
emit_each direct-bundle-import "no component imports a language bundle" < <(
  grep -rn 'assets/i18n/' --include=*.tsx apps/*/src 2>/dev/null | head -20
)

# 7. user-visible attributes must not hold literals
emit_each literal-attribute "no literal user-visible attributes" < <(
  grep -rnE '(aria-label|title|placeholder|alt|label)="[^"{}]*[A-Za-z]{2}' --include=*.tsx apps/*/src 2>/dev/null \
    | grep -vE '(aria-labelledby|data-)' | head -20
)

# 8. JSX text nodes, on one line or standing alone. A bare text line counts
#    only when the previous line closed a tag, which is what distinguishes a
#    rendered string from a continuation line of ordinary code.
emit_each literal-text "no literal JSX text" < <(
  {
    grep -rnE '>[[:space:]]*[A-Za-z][A-Za-z ,.!?'"'"'-]{2,}[[:space:]]*<' --include=*.tsx apps/*/src 2>/dev/null \
      | grep -v '{'
    find apps/*/src -name '*.tsx' 2>/dev/null | while IFS= read -r file; do
      awk -v f="$file" '
        { line = $0; sub(/^[[:space:]]+/, "", line); sub(/[[:space:]]+$/, "", line) }
        prev ~ />$/ && line ~ /^[A-Za-z][A-Za-z0-9 ,.!?'"'"'-]*$/ { print f ":" NR ": " line }
        { prev = line }
      ' "$file"
    done
  } | head -20
)

echo "i18n-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
