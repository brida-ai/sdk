#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

import { nextVersion } from './version.mjs'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function parseArgs(argv) {
  const options = { impact: null, apply: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--impact') options.impact = argv[++index] ?? null
    else if (arg === '--apply') options.apply = true
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
if (options.impact === null) {
  console.error('usage: node scripts/release/prepare.mjs --impact patch|minor|major [--apply]')
  process.exit(2)
}

const tags = git('tag', '--list').split('\n').filter(Boolean)
const plan = nextVersion(tags, options.impact)

if (!plan.release) {
  process.stdout.write(`${JSON.stringify({ event: 'release_refused', ...plan })}\n`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
if (options.apply) {
  manifest.version = plan.version
  writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`)
}

process.stdout.write(`${JSON.stringify({
  event: options.apply ? 'release_prepared' : 'release_planned',
  ...plan,
})}\n`)
