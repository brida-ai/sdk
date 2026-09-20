#!/usr/bin/env bash
set -euo pipefail

bad=0
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
inventory="$tmpdir/files.z"

# Do not hide Git failures behind process substitution: if the repository cannot
# be enumerated, public-surface validation must fail closed.
git ls-files --cached --others --exclude-standard -z >"$inventory"
files=()
while IFS= read -r -d '' path; do
  files+=("$path")
done <"$inventory"

for path in "${files[@]}"; do
  if [[ -L "$path" ]]; then
    echo "forbidden public symlink: $path"
    bad=1
    continue
  fi
  case "$path" in
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      echo "forbidden public path: $path"
      bad=1
      ;;
  esac
done

patterns=(
  'BEGIN [A-Z ]*PRIVATE KEY'
  'gh[pousr]_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9_-]{20,}'
  'AKIA[0-9A-Z]{16}'
)

scan_pattern() {
  local pattern="$1"
  local path
  for path in "${files[@]}"; do
    [[ -f "$path" && ! -L "$path" ]] || continue
    if grep -I -nE "$pattern" -- "$path" >"$tmpdir/public-surface-match" 2>/dev/null; then
      echo "possible secret pattern in $path: $pattern"
      cat "$tmpdir/public-surface-match"
      bad=1
    fi
  done
}

for pattern in "${patterns[@]}"; do
  scan_pattern "$pattern"
done

context_pattern='(/home/|/Users/|private repo|internal-only|Route Passport)'
for path in "${files[@]}"; do
  [[ -f "$path" && ! -L "$path" ]] || continue
  case "$path" in
    AGENTS.md|GUIDELINES.md|SECURITY.md|scripts/public-surface-check.sh)
      continue
      ;;
  esac
  if grep -I -nE "$context_pattern" -- "$path" >"$tmpdir/public-surface-context" 2>/dev/null; then
    echo "possible private-context leak in $path:"
    cat "$tmpdir/public-surface-context"
    bad=1
  fi
done

exit "$bad"
