import assert from 'node:assert/strict'
import test from 'node:test'

import { checkPullRequestMetadata, withDependabotDefaults } from './check-pr-metadata.mjs'

test('accepts complete release and QA metadata', () => {
  const result = checkPullRequestMetadata('- release-impact: patch\n- release-note: Fix public SDK parsing.\n- qa-scope: pnpm check\n')
  assert.deepEqual(result.errors, [])
  assert.equal(result.impact, 'patch')
})

test('rejects missing or invalid metadata', () => {
  const result = checkPullRequestMetadata('- release-impact: banana\n- release-note:\n')
  assert.match(result.errors.join('\n'), /release-impact/u)
  assert.match(result.errors.join('\n'), /release-note/u)
  assert.match(result.errors.join('\n'), /qa-scope/u)
})

test('rejects untouched template placeholders', () => {
  const result = checkPullRequestMetadata([
    '- release-impact: none',
    '- release-note: Describe the public-facing change, or `none` when no release note is needed.',
    '- qa-scope: Describe the exact public checks required for this change.',
  ].join('\n'))
  assert.match(result.errors.join('\n'), /placeholder/u)
})

test('requires real release notes for versioned changes and real QA scope', () => {
  const result = checkPullRequestMetadata('- release-impact: minor\n- release-note: none\n- qa-scope: none\n')
  assert.match(result.errors.join('\n'), /real release-note/u)
  assert.match(result.errors.join('\n'), /qa-scope cannot be none/u)
})

test('defaults Dependabot pull requests from this repository to no release', () => {
  const body = withDependabotDefaults('Bumps a dependency.', { author: 'dependabot[bot]', sameRepository: true })
  const result = checkPullRequestMetadata(body)
  assert.deepEqual(result.errors, [])
  assert.equal(result.impact, 'none')
})

test('keeps metadata a maintainer added to a Dependabot pull request', () => {
  const body = withDependabotDefaults('- release-impact: patch\n- release-note: Patch a vulnerable dependency.\n- qa-scope: pnpm check\n', { author: 'dependabot[bot]', sameRepository: true })
  assert.equal(checkPullRequestMetadata(body).impact, 'patch')
})

test('does not default metadata for other authors or for forks', () => {
  for (const context of [
    { author: 'someone', sameRepository: true },
    { author: 'dependabot[bot]', sameRepository: false },
    { author: undefined, sameRepository: undefined },
  ]) {
    assert.equal(withDependabotDefaults('Bumps a dependency.', context), 'Bumps a dependency.')
  }
})
