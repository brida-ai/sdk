/** Create a bounded Brida logical-operation idempotency key. */
export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() is required to create an idempotency key')
  }
  return `brida_${globalThis.crypto.randomUUID()}`
}

export function validateIdempotencyKey(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u.test(normalized)) {
    throw new TypeError('idempotencyKey is invalid')
  }
  return normalized
}
