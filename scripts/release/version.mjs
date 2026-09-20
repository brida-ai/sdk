export const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/u
export const RELEASE_IMPACTS = new Set(['patch', 'minor', 'major'])

export function parseVersionTag(tag) {
  const match = TAG_PATTERN.exec(String(tag).trim())
  if (match === null) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

export function highestVersion(tags = []) {
  const versions = tags.map(parseVersionTag).filter((version) => version !== null)
  if (versions.length === 0) return null
  return versions.sort(compareVersions).at(-1)
}

export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`
}

export function formatTag(version) {
  return `v${formatVersion(version)}`
}

export function nextVersion(tags, impact) {
  if (!RELEASE_IMPACTS.has(impact)) {
    throw new Error('release impact must be patch, minor, or major')
  }
  const current = highestVersion(tags)
  if (current === null) {
    return {
      release: false,
      reason: 'bootstrap_required',
      detail: 'No public release tag exists. Complete the one-time npm bootstrap before using the release controller.',
    }
  }
  const next = impact === 'patch'
    ? { ...current, patch: current.patch + 1 }
    : impact === 'minor'
      ? { major: current.major, minor: current.minor + 1, patch: 0 }
      : { major: current.major + 1, minor: 0, patch: 0 }
  return {
    release: true,
    impact,
    previousVersion: formatVersion(current),
    version: formatVersion(next),
    tag: formatTag(next),
  }
}
