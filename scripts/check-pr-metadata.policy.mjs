import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

function run(body) {
  const dir = mkdtempSync(join(tmpdir(), 'brida-pr-metadata-'))
  const path = join(dir, 'body.md')
  writeFileSync(path, body)
  const result = spawnSync(process.execPath, ['scripts/check-pr-metadata.mjs', path], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  rmSync(dir, { recursive: true, force: true })
  return result
}

test('accepts complete release and QA metadata', () => {
  const result = run('- release-impact: patch\n- release-note: Fix public SDK parsing.\n- qa-scope: pnpm check\n')
  assert.equal(result.status, 0, result.stderr)
})

test('rejects missing or invalid metadata', () => {
  const result = run('- release-impact: banana\n- release-note:\n')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /release-impact/u)
  assert.match(result.stderr, /release-note/u)
  assert.match(result.stderr, /qa-scope/u)
})

test('rejects untouched template placeholders', () => {
  const result = run([
    '- release-impact: none',
    '- release-note: Describe the public-facing change, or `none` when no release note is needed.',
    '- qa-scope: Describe the exact public checks required for this change.',
  ].join('\n'))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /placeholder/u)
})

test('requires real release notes for versioned changes and real QA scope', () => {
  const result = run('- release-impact: minor\n- release-note: none\n- qa-scope: none\n')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /real release-note/u)
  assert.match(result.stderr, /qa-scope cannot be none/u)
})
