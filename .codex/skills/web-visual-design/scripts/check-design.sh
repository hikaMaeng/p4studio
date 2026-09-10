#!/usr/bin/env bash
# Web Visual Design - mechanical checks.
#
# Decides the countable rules: color and font literals outside the token site,
# font stacks with no generic fallback, animation with no reduced-motion branch,
# focus visibility removed with nothing put back, and imagery that carries
# neither an alt nor aria-hidden.
#
# Glyph coverage is not decidable here; declared families are printed as a warn
# line so a reviewer reads them against the required language set.
#
# Prints one `check name=<rule> status=ok|violation|warn detail=...` line per
# rule and a final `design-check status=... violations=N` line.
# Exit code: 0 when no violation, 1 otherwise, 2 on a setup error.
#
# Usage:
#   bash .codex/skills/web-visual-design/scripts/check-design.sh [repo-root]

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

# Front-end sources. Views live in apps; a package may hold front-end code too.
front_dirs=()
while IFS= read -r dir; do
  front_dirs+=("$dir")
done < <(find apps packages -maxdepth 4 -type d -path '*/src/front' 2>/dev/null | sort)

if [[ ${#front_dirs[@]} -eq 0 ]]; then
  emit front-present violation "no <workspace>/src/front directory"
  echo "design-check status=violation violations=$violations root=$root"
  exit 1
fi

# The token site: the one place a raw color or a font face may be written.
# Everything else consumes names.
is_token_path() {
  case "$1" in
    */styles.css | */theme/* | */tailwind.config.ts | */tailwind.config.js) return 0 ;;
    *) return 1 ;;
  esac
}

front_files=()
while IFS= read -r file; do
  front_files+=("$file")
done < <(
  for dir in "${front_dirs[@]}"; do
    find "$dir" -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.html' \) 2>/dev/null
  done | sort
)

component_files=()
token_files=()
for file in "${front_files[@]}"; do
  if is_token_path "$file"; then
    token_files+=("$file")
  else
    component_files+=("$file")
  fi
done
# Tailwind config sits beside the app, not under src/front, and is a token site.
while IFS= read -r file; do
  [[ -n "$file" ]] && token_files+=("$file")
done < <(find apps packages -maxdepth 3 -name 'tailwind.config.*' 2>/dev/null | sort)

# 1. no color literal outside the token site. Tailwind arbitrary values such as
#    bg-[#0f172a] are literals too - the token is what survives a re-theme.
if [[ ${#component_files[@]} -eq 0 ]]; then
  emit color-literal ok "no component files"
else
  emit_each color-literal "colors come from tokens" < <(
    grep -HnE '#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b|\b(rgba?|hsla?|oklch|color-mix)\(' \
      "${component_files[@]}" 2>/dev/null | head -20
  )
fi

# 2. no font declared outside the token site
if [[ ${#component_files[@]} -eq 0 ]]; then
  emit font-declaration ok "no component files"
else
  emit_each font-declaration "fonts declared in the token site only" < <(
    grep -HnE 'font-family|fontFamily|@font-face|fonts\.(googleapis|gstatic|bunny)|font-\[' \
      "${component_files[@]}" 2>/dev/null | head -20
  )
fi

# 3. every declared stack ends in a generic family, so an unavailable face
#    degrades instead of falling back to the browser default nobody chose
if [[ ${#token_files[@]} -eq 0 ]]; then
  emit font-fallback ok "no token site"
else
  emit_each font-fallback "every stack ends in a generic family" < <(
    grep -HnE 'font-family' "${token_files[@]}" 2>/dev/null \
      | grep -vE '(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded)[^;]*;?[[:space:]]*$' \
      | head -20
  )
fi

# 4. declared families, for the coverage read a script cannot make
if [[ ${#token_files[@]} -gt 0 ]]; then
  families="$(
    grep -hE 'font-family' "${token_files[@]}" 2>/dev/null \
      | sed -E 's/.*font-family[^:]*:?[[:space:]]*//; s/[;,].*//; s/["'"'"']//g' \
      | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
      | grep -v '^$' | sort -u | tr '\n' ' '
  )"
  if [[ -n "$families" ]]; then
    emit font-coverage warn "verify ko/zh/hi/ar glyphs: ${families% }"
  else
    emit font-coverage ok "no custom family declared"
  fi
else
  emit font-coverage ok "no token site"
fi

# 5. real animation needs a reduced-motion branch. Colour transitions are not
#    the vestibular problem, so they do not arm this rule.
motion_hits="$(
  grep -rlE '@keyframes|animation:|animate-\[|animate-(spin|ping|pulse|bounce)|from "(motion|framer-motion)' \
    "${front_files[@]}" 2>/dev/null | head -10
)"
if [[ -z "$motion_hits" ]]; then
  emit reduced-motion ok "no animation declared"
elif grep -rqE 'prefers-reduced-motion' "${front_files[@]}" 2>/dev/null; then
  emit reduced-motion ok "reduced-motion branch present"
else
  emit reduced-motion violation "animation without prefers-reduced-motion: $(printf '%s' "$motion_hits" | tr '\n' ' ')"
fi

# 6. removing the outline is allowed; removing the focus state is not
emit_each focus-visibility "focus stays visible" < <(
  grep -HnE 'outline-none|outline:[[:space:]]*none' "${front_files[@]}" 2>/dev/null \
    | grep -v 'focus-visible' | head -20
)

# 7. imagery is either meaningful and labelled, or decorative and hidden
emit_each imagery-semantics "imagery is labelled or hidden" < <(
  node -e '
const fs = require("node:fs");
for (const file of process.argv.slice(1)) {
  if (!file.endsWith(".tsx") && !file.endsWith(".html")) continue;
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/<(img|svg|picture)\b[^>]*>/gs)) {
    const tag = match[0];
    if (/alt=|aria-hidden|aria-label|aria-labelledby|role="img"/.test(tag)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    console.log(`${file}:${line}: <${match[1]}> has neither an alt/label nor aria-hidden`);
  }
}
' "${front_files[@]}" 2>/dev/null | head -20
)

echo "design-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
