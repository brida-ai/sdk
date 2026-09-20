#!/usr/bin/env bash
set -euo pipefail

bad=0
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
inventory="$tmpdir/files.z"

# Public validation must fail closed if Git cannot enumerate the committed tree.
git ls-files --cached -z >"$inventory"
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
  'private-key|BEGIN [A-Z ]*PRIVATE KEY'
  'github-token|gh[pousr]_[A-Za-z0-9_]{20,}'
  'openai-key|sk-[A-Za-z0-9_-]{20,}'
  'aws-access-key|AKIA[0-9A-Z]{16}'
)

for entry in "${patterns[@]}"; do
  label="${entry%%|*}"
  pattern="${entry#*|}"
  for path in "${files[@]}"; do
    [[ -f "$path" && ! -L "$path" ]] || continue
    if grep -I -qE "$pattern" -- "$path" 2>/dev/null; then
      echo "possible secret pattern: rule=$label path=$path (content redacted)"
      bad=1
    fi
  done
done

context_pattern='(/home/|/Users/|private repo|internal-only|non-public hostname|internal account ID)'
for path in "${files[@]}"; do
  [[ -f "$path" && ! -L "$path" ]] || continue
  case "$path" in
    AGENTS.md|GUIDELINES.md|SECURITY.md|scripts/public-surface-check.sh|scripts/history-leak-check.sh)
      continue
      ;;
  esac
  if grep -I -qE "$context_pattern" -- "$path" 2>/dev/null; then
    echo "possible private-context leak: path=$path (content redacted)"
    bad=1
  fi
done

if ! bash scripts/history-leak-check.sh; then
  bad=1
fi

exit "$bad"
