import { BridaApiError, BridaNetworkError, BridaResponseError } from './errors.js'
import type { BridaOptions } from './types.js'

export const BRIDA_API_URL = 'https://api.brida.ai' as const

export interface BridaRequest {
  readonly method: 'GET' | 'POST'
  readonly body?: Readonly<Record<string, unknown>>
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
}

/** Shared authenticated transport used by every Brida product namespace. */
export class BridaTransport {
  readonly #baseUrl: string
  readonly #apiKey: string
  readonly #fetch: typeof fetch

  constructor(options: BridaOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? BRIDA_API_URL)
    this.#apiKey = boundedToken(options.apiKey, 'apiKey', 512)
    this.#fetch = options.fetch ?? globalThis.fetch
    if (typeof this.#fetch !== 'function') {
      throw new TypeError('A Fetch API implementation is required')
    }
  }

  async request(path: string, input: BridaRequest): Promise<unknown> {
    if (input.signal?.aborted === true) {
      throw new BridaNetworkError(
        'The Brida API request was cancelled by the caller.',
        input.idempotencyKey,
        { cause: input.signal.reason, retryable: false },
      )
    }

    let response: Response
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: input.method,
        headers: {
          accept: 'application/json',
          'x-api-key': this.#apiKey,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(input.idempotencyKey === undefined ? {} : { 'idempotency-key': input.idempotencyKey }),
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        redirect: 'error',
      })
    } catch (cause) {
      const cancelled = Boolean(input.signal?.aborted)
      throw new BridaNetworkError(
        cancelled
          ? 'The Brida API request was cancelled by the caller.'
          : 'The Brida API request failed before receiving an HTTP response.',
        input.idempotencyKey,
        { cause, retryable: !cancelled },
      )
    }

    const body = await readJson(response, input.idempotencyKey)
    if (!response.ok) throw parseApiError(response.status, body, input.idempotencyKey)
    return body
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  const loopbackHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new TypeError('baseUrl must use HTTPS except for loopback HTTP during local development')
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new TypeError('baseUrl must not contain credentials, query parameters or fragments')
  }
  return url.toString().replace(/\/$/u, '')
}

function boundedToken(value: string, field: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${field} must be a non-empty bounded token`)
  }
  return normalized
}

async function readJson(response: Response, idempotencyKey: string | undefined): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    if (!response.ok) {
      throw new BridaApiError(
        `The Brida API returned HTTP ${response.status} with an invalid JSON error body.`,
        response.status,
        'invalid_error_response',
        'api_error',
        undefined,
        undefined,
        idempotencyKey,
      )
    }
    throw new BridaResponseError('The Brida API returned invalid JSON.', { cause })
  }
}

function parseApiError(status: number, value: unknown, idempotencyKey: string | undefined): BridaApiError {
  if (!isRecord(value) || !isRecord(value.error)) {
    return new BridaApiError(
      `The Brida API request failed with HTTP ${status}.`,
      status,
      'unknown_error',
      'api_error',
      optionalString(isRecord(value) ? value.trace_id : undefined),
      undefined,
      idempotencyKey,
    )
  }
  const message = optionalString(value.error.message)
  const code = optionalString(value.error.code)
  const type = optionalString(value.error.type)
  if (message === undefined || code === undefined || type === undefined) {
    return new BridaApiError(
      `The Brida API returned HTTP ${status} with an invalid JSON error envelope.`,
      status,
      'invalid_error_response',
      'api_error',
      optionalString(value.trace_id),
      optionalString(value.error.param),
      idempotencyKey,
    )
  }
  return new BridaApiError(
    message,
    status,
    code,
    type,
    optionalString(value.trace_id),
    optionalString(value.error.param),
    idempotencyKey,
  )
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
