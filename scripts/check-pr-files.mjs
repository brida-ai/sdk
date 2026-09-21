import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAINTAINER_ONLY = [
  /^\.github(?:\/|$)/u,
  /^scripts(?:\/|$)/u,
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^\.npmrc$/u,
  /^(?:AGENTS\.md|GUIDELINES\.md|SECURITY\.md|RELEASING\.md|CONTRIBUTING\.md|LICENSE)$/u,
]

export function checkPullRequestFiles(files, { external }) {
  if (!external) return Object.freeze({ checked: files.length, external: false })

  for (const file of files) {
    const candidates = [file.filename, file.previous_filename].filter((value) => typeof value === 'string')
    for (const path of candidates) {
      if (MAINTAINER_ONLY.some((pattern) => pattern.test(path))) {
        throw new Error(`external PR may not change maintainer-only control-plane path: ${path}`)
      }
    }
  }

  return Object.freeze({ checked: files.length, external: true })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2]
  if (path === undefined) throw new Error('usage: check-pr-files.mjs <files.json> [--external]')
  const files = JSON.parse(await readFile(path, 'utf8'))
  const result = checkPullRequestFiles(files, { external: process.argv.includes('--external') })
  console.log(`public PR path policy: ${result.checked} files / ${result.external ? 'external' : 'internal'} / ok`)
}
