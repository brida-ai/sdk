#!/usr/bin/env bash
set -euo pipefail

bad=0
files=()
while IFS= read -r -d '' path; do
  files+=("$path")
done < <(git ls-files --cached -z)

for path in "${files[@]}"; do
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
    [[ -f "$path" ]] || continue
    if grep -I -nE "$pattern" -- "$path" >/tmp/public-surface-match 2>/dev/null; then
      echo "possible secret pattern in $path: $pattern"
      cat /tmp/public-surface-match
      bad=1
    fi
  done
}

for pattern in "${patterns[@]}"; do
  scan_pattern "$pattern"
done

context_pattern='(/home/|/Users/|private repo|internal-only|non-public hostname|internal account ID)'
for path in "${files[@]}"; do
  [[ -f "$path" ]] || continue
  case "$path" in
    AGENTS.md|GUIDELINES.md|SECURITY.md|scripts/public-surface-check.sh)
      continue
      ;;
  esac
  if grep -I -nE "$context_pattern" -- "$path" >/tmp/public-surface-context 2>/dev/null; then
    echo "possible private-context leak in $path:"
    cat /tmp/public-surface-context
    bad=1
  fi
done

rm -f /tmp/public-surface-match /tmp/public-surface-context
exit "$bad"
