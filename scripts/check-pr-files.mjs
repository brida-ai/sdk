import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PR_FILES_FILE = '.pr-files.json'
const MAINTAINER_ONLY = [
  /^\.github(?:\/|$)/u,
  /^scripts(?:\/|$)/u,
  /^package\.json$/u,
  /^pnpm-lock\.yaml$/u,
  /^\.npmrc$/u,
  /^(?:AGENTS\.md|ARCHITECTURE\.md|GUIDELINES\.md|SECURITY\.md|RELEASING\.md|CONTRIBUTING\.md|LICENSE)$/u,
]
const PRODUCT_CATALOG = /^(?:examples|fixtures|patterns|recipes|skills)(?:\/|$)/u

export function checkExternalPullRequestFiles(files) {
  for (const file of files) {
    const candidates = [file.filename, file.previous_filename].filter((value) => typeof value === 'string')
    for (const path of candidates) {
      if (PRODUCT_CATALOG.test(path)) {
        throw new Error(`product catalog path belongs in a product repository: ${path}`)
      }
      if (MAINTAINER_ONLY.some((pattern) => pattern.test(path))) {
        throw new Error(`external PR may not change maintainer-only control-plane path: ${path}`)
      }
    }
  }
  return Object.freeze({ checked: files.length, external: true })
}

async function runExternalPolicyCheck() {
  const files = JSON.parse(await readFile(PR_FILES_FILE, 'utf8'))
  const result = checkExternalPullRequestFiles(files)
  console.log(`public PR path policy: ${result.checked} files / external / ok`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runExternalPolicyCheck()
}
