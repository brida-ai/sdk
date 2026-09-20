import { readFileSync } from 'node:fs'

const bodyPath = process.argv[2]
if (!bodyPath) {
  console.error('usage: node scripts/check-pr-metadata.mjs <pr-body-file>')
  process.exit(2)
}

const body = readFileSync(bodyPath, 'utf8')
const impact = body.match(/^\s*-\s*release-impact:\s*(none|patch|minor|major)\s*$/imu)?.[1]
const note = body.match(/^\s*-\s*release-note:\s*(.+?)\s*$/imu)?.[1]?.trim()
const qa = body.match(/^\s*-\s*qa-scope:\s*(.+?)\s*$/imu)?.[1]?.trim()

const errors = []
if (!impact) errors.push('release-impact must be one of none|patch|minor|major')
if (!note) errors.push('release-note must be present and non-empty')
if (!qa) errors.push('qa-scope must be present and non-empty')

const notePlaceholder = 'Describe the public-facing change, or `none` when no release note is needed.'
const qaPlaceholder = 'Describe the exact public checks required for this change.'
if (note === notePlaceholder) errors.push('release-note must replace the PR-template placeholder')
if (qa === qaPlaceholder) errors.push('qa-scope must replace the PR-template placeholder')
if (impact !== undefined && impact !== 'none' && note?.toLowerCase() === 'none') {
  errors.push('a versioned release-impact requires a real release-note')
}
if (qa?.toLowerCase() === 'none') errors.push('qa-scope cannot be none')

if (errors.length > 0) {
  for (const error of errors) console.error(`::error title=Public PR metadata::${error}`)
  process.exit(1)
}

console.log(`Public PR metadata valid: impact=${impact}`)
