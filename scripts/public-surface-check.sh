#!/usr/bin/env bash
set -euo pipefail

bad=0

while IFS= read -r path; do
  case "$path" in
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      echo "forbidden tracked path: $path"
      bad=1
      ;;
  esac
done < <(git ls-files)

patterns=(
  'BEGIN [A-Z ]*PRIVATE KEY'
  'gh[pousr]_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9_-]{20,}'
  'AKIA[0-9A-Z]{16}'
)

for pattern in "${patterns[@]}"; do
  if git grep -nE "$pattern" -- . ':!scripts/public-surface-check.sh' >/tmp/public-surface-match 2>/dev/null; then
    echo "possible secret pattern: $pattern"
    cat /tmp/public-surface-match
    bad=1
  fi
done

if git grep -nE '(/home/|/Users/|private repo|internal-only|Route Passport)' -- . ':!AGENTS.md' ':!GUIDELINES.md' ':!SECURITY.md' ':!scripts/public-surface-check.sh' >/tmp/public-surface-context 2>/dev/null; then
  echo "possible private-context leak:"
  cat /tmp/public-surface-context
  bad=1
fi

exit "$bad"
