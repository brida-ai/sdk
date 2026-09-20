#!/usr/bin/env bash
set -euo pipefail

if [[ "$(git rev-parse --is-shallow-repository)" == "true" ]]; then
  echo "history leak scan requires a full Git history; refusing shallow repository"
  exit 1
fi

bad=0
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
objects="$tmpdir/objects"

# Keep output metadata-only: never print matched blob content.
git rev-list --objects --all >"$objects"

patterns=(
  'private-key|BEGIN [A-Z ]*PRIVATE KEY'
  'github-token|gh[pousr]_[A-Za-z0-9_]{20,}'
  'openai-key|sk-[A-Za-z0-9_-]{20,}'
  'aws-access-key|AKIA[0-9A-Z]{16}'
)
context_pattern='(/home/|/Users/|private repo|internal-only|non-public hostname|internal account ID)'

while IFS=' ' read -r object path; do
  [[ -n "$object" && -n "${path:-}" ]] || continue
  [[ "$(git cat-file -t "$object" 2>/dev/null || true)" == "blob" ]] || continue

  case "$path" in
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      echo "forbidden historical path: object=$object path=$path"
      bad=1
      ;;
  esac

  # Skip binary/empty blobs for textual pattern matching.
  if ! git cat-file blob "$object" | grep -Iq .; then
    continue
  fi

  for entry in "${patterns[@]}"; do
    label="${entry%%|*}"
    pattern="${entry#*|}"
    if git cat-file blob "$object" | grep -IqE "$pattern"; then
      echo "historical secret candidate: rule=$label object=$object path=$path (content redacted)"
      bad=1
    fi
  done

  case "$path" in
    AGENTS.md|GUIDELINES.md|SECURITY.md|scripts/public-surface-check.sh|scripts/history-leak-check.sh)
      continue
      ;;
  esac
  if git cat-file blob "$object" | grep -IqE "$context_pattern"; then
    echo "historical private-context candidate: object=$object path=$path (content redacted)"
    bad=1
  fi
done <"$objects"

if [[ "$bad" -eq 0 ]]; then
  echo "full-history leak scan: ok"
fi
exit "$bad"
