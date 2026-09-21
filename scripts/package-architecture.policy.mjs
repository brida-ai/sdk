import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const rootSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

const PRODUCT_CATALOG_DIRS = ['examples', 'fixtures', 'patterns', 'recipes', 'skills']

test('publishes one canonical Brida SDK with one root package export', () => {
  assert.equal(pkg.name, '@brida/sdk')
  assert.deepEqual(Object.keys(pkg.exports), ['.'])
  assert.equal(pkg.exports['.'].types, './dist/index.d.ts')
  assert.equal(pkg.exports['.'].import, './dist/index.js')
  assert.equal(pkg.exports['.'].default, './dist/index.js')
  assert.equal(pkg.publishConfig?.access, 'public')
})

test('keeps product catalogs out of the shared SDK repository', () => {
  for (const directory of PRODUCT_CATALOG_DIRS) {
    assert.equal(existsSync(new URL(`../${directory}/`, import.meta.url)), false, `${directory}/ belongs in a product repository`)
  }
})

test('keeps the root public facade product-neutral', () => {
  assert.match(rootSource, /export \{ Brida \}/u)
  assert.doesNotMatch(rootSource, /BridaClient/u)
  assert.ok(rootSource.split('\n').length < 80, 'src/index.ts must remain a facade, not a product implementation')
})
