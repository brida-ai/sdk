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

if (errors.length > 0) {
  for (const error of errors) console.error(`::error title=Public PR metadata::${error}`)
  process.exit(1)
}

console.log(`Public PR metadata valid: impact=${impact}`)
