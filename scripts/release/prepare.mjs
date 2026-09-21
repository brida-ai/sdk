#!/usr/bin/env node
import { execFileSync } from 'node:child_process'

import { nextVersion } from './version.mjs'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const impact = process.argv[2] ?? ''
const tags = git('tag', '--list').split('\n').filter(Boolean)
const plan = nextVersion(tags, impact)

if (!plan.release) {
  process.stdout.write(`${JSON.stringify({ event: 'release_refused', ...plan })}\n`)
  process.exit(1)
}

process.stdout.write(`${JSON.stringify({ event: 'release_planned', ...plan })}\n`)
