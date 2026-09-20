import { describe, expect, it } from 'vitest'

import {
  formatTag,
  highestVersion,
  nextVersion,
  parseVersionTag,
} from './version.mjs'

describe('public SDK release version planner', () => {
  it('parses only stable semantic release tags', () => {
    expect(parseVersionTag('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 })
    expect(parseVersionTag('0.1.0')).toBeNull()
    expect(parseVersionTag('v0.1.0-rc.1')).toBeNull()
    expect(parseVersionTag('backup/pre-release')).toBeNull()
  })

  it('finds the highest numeric version', () => {
    expect(highestVersion(['v0.1.9', 'v0.1.10', 'backup/pre-release']))
      .toEqual({ major: 0, minor: 1, patch: 10 })
  })

  it('refuses to invent the first public SDK release', () => {
    const plan = nextVersion([], 'patch')
    expect(plan.release).toBe(false)
    expect(plan.reason).toBe('bootstrap_required')
  })

  it('advances patch, minor, and major from release history', () => {
    expect(nextVersion(['v0.1.0'], 'patch').tag).toBe('v0.1.1')
    expect(nextVersion(['v0.1.7'], 'minor').tag).toBe('v0.2.0')
    expect(nextVersion(['v0.9.9'], 'major').tag).toBe('v1.0.0')
  })

  it('rejects unknown release impacts', () => {
    expect(() => nextVersion(['v0.1.0'], 'banana')).toThrow(/patch, minor, or major/u)
  })

  it('formats a release tag symmetrically', () => {
    const tag = formatTag({ major: 2, minor: 3, patch: 4 })
    expect(tag).toBe('v2.3.4')
    expect(parseVersionTag(tag)).toEqual({ major: 2, minor: 3, patch: 4 })
  })
})
