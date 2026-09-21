import assert from 'node:assert/strict'
import test from 'node:test'

import { checkPullRequestFiles } from './check-pr-files.mjs'

test('internal maintainer PRs may change control-plane files', () => {
  assert.deepEqual(
    checkPullRequestFiles([
      { filename: '.github/workflows/ci.yml', status: 'modified' },
      { filename: 'package.json', status: 'modified' },
    ], { external: false }),
    { checked: 2, external: false },
  )
})

test('external PRs may change SDK implementation, tests, examples and ordinary docs', () => {
  assert.deepEqual(
    checkPullRequestFiles([
      { filename: 'src/index.ts', status: 'modified' },
      { filename: 'src/index.test.ts', status: 'modified' },
      { filename: 'examples/reflex-agent.ts', status: 'added' },
      { filename: 'README.md', status: 'modified' },
    ], { external: true }),
    { checked: 4, external: true },
  )
})

test('external PRs cannot alter release, workflow, dependency or governance control plane', () => {
  for (const filename of [
    '.github/workflows/ci.yml',
    'scripts/release/prepare.mjs',
    'package.json',
    'pnpm-lock.yaml',
    '.npmrc',
    'SECURITY.md',
    'RELEASING.md',
    'AGENTS.md',
  ]) {
    assert.throws(
      () => checkPullRequestFiles([{ filename, status: 'modified' }], { external: true }),
      /maintainer-only control-plane/u,
    )
  }
})

test('external PRs cannot bypass the boundary by renaming a protected path', () => {
  assert.throws(
    () => checkPullRequestFiles([{
      filename: 'docs/old-security-policy.md',
      previous_filename: 'SECURITY.md',
      status: 'renamed',
    }], { external: true }),
    /maintainer-only control-plane/u,
  )
})
