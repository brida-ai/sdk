import assert from 'node:assert/strict'
import test from 'node:test'

import { checkExternalPullRequestFiles } from './check-pr-files.mjs'

test('external PRs may change SDK implementation, tests, examples and ordinary docs', () => {
  assert.deepEqual(
    checkExternalPullRequestFiles([
      { filename: 'src/index.ts', status: 'modified' },
      { filename: 'src/index.test.ts', status: 'modified' },
      { filename: 'examples/reflex-agent.ts', status: 'added' },
      { filename: 'README.md', status: 'modified' },
    ]),
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
      () => checkExternalPullRequestFiles([{ filename, status: 'modified' }]),
      /maintainer-only control-plane/u,
    )
  }
})

test('external PRs cannot bypass the boundary by renaming a protected path', () => {
  assert.throws(
    () => checkExternalPullRequestFiles([{
      filename: 'docs/old-security-policy.md',
      previous_filename: 'SECURITY.md',
      status: 'renamed',
    }]),
    /maintainer-only control-plane/u,
  )
})
