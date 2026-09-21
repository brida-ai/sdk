import assert from 'node:assert/strict'
import test from 'node:test'

import { checkExternalPullRequestFiles } from './check-pr-files.mjs'

test('external PRs may change SDK implementation, tests and ordinary docs', () => {
  assert.deepEqual(
    checkExternalPullRequestFiles([
      { filename: 'src/index.ts', status: 'modified' },
      { filename: 'src/index.test.ts', status: 'modified' },
      { filename: 'src/reflex/client.ts', status: 'modified' },
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
    'ARCHITECTURE.md',
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


test('external PRs cannot add product catalogs to the shared SDK', () => {
  for (const filename of [
    'examples/reflex.ts',
    'recipes/example.yaml',
    'skills/reflex/SKILL.md',
    'patterns/reflex.md',
    'fixtures/reflex.json',
  ]) {
    assert.throws(
      () => checkExternalPullRequestFiles([{ filename, status: 'added' }]),
      /product catalog path belongs in a product repository/u,
    )
  }
})
