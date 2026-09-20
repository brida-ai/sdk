import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatTag,
  highestVersion,
  nextVersion,
  parseVersionTag,
} from './version.mjs'

test('parses only stable semantic release tags', () => {
  assert.deepEqual(parseVersionTag('v0.1.0'), { major: 0, minor: 1, patch: 0 })
  assert.equal(parseVersionTag('0.1.0'), null)
  assert.equal(parseVersionTag('v0.1.0-rc.1'), null)
  assert.equal(parseVersionTag('backup/pre-release'), null)
})

test('finds the highest numeric version', () => {
  assert.deepEqual(
    highestVersion(['v0.1.9', 'v0.1.10', 'backup/pre-release']),
    { major: 0, minor: 1, patch: 10 },
  )
})

test('refuses to invent the first public SDK release', () => {
  const plan = nextVersion([], 'patch')
  assert.equal(plan.release, false)
  assert.equal(plan.reason, 'bootstrap_required')
})

test('advances patch, minor, and major from release history', () => {
  assert.equal(nextVersion(['v0.1.0'], 'patch').tag, 'v0.1.1')
  assert.equal(nextVersion(['v0.1.7'], 'minor').tag, 'v0.2.0')
  assert.equal(nextVersion(['v0.9.9'], 'major').tag, 'v1.0.0')
})

test('rejects unknown release impacts', () => {
  assert.throws(() => nextVersion(['v0.1.0'], 'banana'), /patch, minor, or major/u)
})

test('formats a release tag symmetrically', () => {
  const tag = formatTag({ major: 2, minor: 3, patch: 4 })
  assert.equal(tag, 'v2.3.4')
  assert.deepEqual(parseVersionTag(tag), { major: 2, minor: 3, patch: 4 })
})
