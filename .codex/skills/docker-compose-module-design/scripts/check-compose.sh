#!/usr/bin/env bash
# Docker Compose Module Design — mechanical checks.
#
# Verifies the machine-decidable subset of the skill contract without needing a
# running Docker daemon: it parses root docker-compose.yml for `dockerfile:`
# references and inspects only those compose-referenced runtime Dockerfiles.
# Prints one `check ... status=ok|violation|warn` line per rule and a final
# `compose-check status=ok|violation violations=N` line.
# Exit code: 0 when no hard violation, 1 on any violation, 2 on a setup error.
#
# Scope note (avoids false positives):
#   * Native/toolchain Dockerfiles that build artifacts (e.g. compiled or
#     GPU runtimes) and are NOT referenced by root compose are out of scope for
#     the dist-copy rule; the skill preserves those native build layers.
#   * Root compose overrides (docker-compose.<platform>.yml) are a legitimate
#     pattern and are reported as `warn`, not a violation. A compose file that
#     defines services from a SUBDIRECTORY (apps/**, packages/**) is a real
#     out-of-band flow and is a violation.
#
# Usage:
#   bash .codex/skills/docker-compose-module-design/scripts/check-compose.sh [repo-root]

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

violations=0

emit() {
  local name="$1" status="$2"
  shift 2
  echo "check name=$name status=$status ${*:-}"
  [[ "$status" == "violation" ]] && violations=$((violations + 1)) || true
}

# 1. root docker-compose.yml is the entrypoint
if [[ -f docker-compose.yml ]]; then
  emit root-compose-present ok
else
  emit root-compose-present violation detail=missing-root-docker-compose.yml
  echo "compose-check status=violation violations=$violations root=$root"
  exit 1
fi

# 2. no compose file that defines services from a subdirectory (out-of-band flow)
sub_compose="$(find apps packages -type f \
  \( -name 'docker-compose*.y*ml' -o -name 'compose*.y*ml' \) \
  -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null || true)"
if [[ -z "$sub_compose" ]]; then
  emit no-subdir-compose ok
else
  emit no-subdir-compose violation detail=compose-outside-root
  printf '%s\n' "$sub_compose" | sed 's/^/  stray-compose: /'
fi

# 2b. report root compose overrides informationally (not a violation)
root_overrides="$(find . -maxdepth 1 -type f \
  \( -name 'docker-compose.*.y*ml' -o -name 'compose.*.y*ml' \) 2>/dev/null || true)"
if [[ -n "$root_overrides" ]]; then
  while IFS= read -r f; do
    [[ -n "$f" ]] && emit root-compose-override warn detail="${f#./}"
  done <<< "$root_overrides"
fi

# 3. every `dockerfile:` referenced by root compose is module-owned and
#    contains no project-build command (native cmake/make stays allowed).
dockerfiles=()
while IFS= read -r dockerfile; do
  dockerfiles+=("$dockerfile")
done < <(grep -E '^[[:space:]]*dockerfile:' docker-compose.yml \
  | sed -E 's/^[[:space:]]*dockerfile:[[:space:]]*//; s/["'\'']//g' | sort -u)

if [[ ${#dockerfiles[@]} -eq 0 ]]; then
  emit compose-dockerfiles warn detail=no-build-services-declared
fi

build_cmd_re='npm[[:space:]]+(install|ci)|turbo[[:space:]]+run|vite[[:space:]]+build|tsc([[:space:]]|$)|npm[[:space:]]+run[[:space:]]+build'

for df in "${dockerfiles[@]}"; do
  [[ -z "$df" ]] && continue

  # module-ownership: apps/<svc>/docker/... path shape
  if [[ "$df" =~ ^apps/[^/]+/docker/ ]]; then
    emit "owned:$df" ok
  else
    emit "owned:$df" violation detail=dockerfile-not-under-apps-service-docker
  fi

  if [[ ! -f "$df" ]]; then
    emit "exists:$df" violation detail=referenced-dockerfile-missing
    continue
  fi

  hits="$(grep -EnI "^[[:space:]]*RUN[[:space:]].*($build_cmd_re)" "$df" 2>/dev/null || true)"
  if [[ -z "$hits" ]]; then
    emit "runtime-only:$df" ok
  else
    emit "runtime-only:$df" violation detail=project-build-command-in-runtime-dockerfile
    printf '%s\n' "$hits" | sed "s|^|  $df: |"
  fi

  # How the container runs, not just what it contains. Both of these are
  # invisible until something goes wrong in production.
  if grep -qEI '^[[:space:]]*USER[[:space:]]+[^r]' "$df" 2>/dev/null; then
    emit "non-root:$df" ok
  else
    emit "non-root:$df" violation detail=no-USER-directive-container-runs-as-root
  fi

  if grep -qEI '^[[:space:]]*HEALTHCHECK[[:space:]]' "$df" 2>/dev/null; then
    emit "healthcheck:$df" ok
  else
    emit "healthcheck:$df" violation detail=no-HEALTHCHECK-compose-cannot-report-health
  fi
done

echo "compose-check status=$([[ $violations -eq 0 ]] && echo ok || echo violation) violations=$violations root=$root"
[[ $violations -eq 0 ]]
