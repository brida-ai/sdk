import { describe, expect, it, vi } from 'vitest'

import {
  BRIDA_API_URL,
  BridaApiError,
  BridaClient,
  BridaNetworkError,
  BridaResponseError,
  createIdempotencyKey,
} from './index.js'

const definition = {
  id: 'agent-wakeup',
  name: 'Agent wakeup',
  trust_class: 'official',
  active_version: '3',
  versions: [
    { version: '1', status: 'retired' },
    { version: '2', status: 'retired' },
    { version: '3', status: 'active' },
  ],
  input: { max_state_bytes: 32768, data_class: 'non_sensitive' },
}

const run = {
  id: 'rfxrun_1',
  object: 'reflex.run',
  reflex: { id: 'agent-wakeup', version: '3' },
  decision: {
    branch: 'wake_worker',
    data: { worker: 'engineering' },
    reason: 'high_actionable_engineering',
    evidence_status: 'resolved',
  },
  evidence: {
    actionable: { type: 'binary', value: true, confidence: 0.93 },
    workClass: { type: 'choice', value: 'engineering', confidence: 1 },
  },
  usage: { input_tokens: 470, output_tokens: 51, decision_capacity: 1 },
  capacity: { kind: 'reflex_free', remaining: 2, resets_at: '2026-10-01T00:00:00.000Z' },
  receipt_id: 'rfxrcpt_1',
  trace_id: 'trace_1',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('BridaClient Reflex', () => {
  it('uses the canonical API URL by default and sends only the Brida API credential', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${BRIDA_API_URL}/v1/reflexes`)
      expect(new Headers(init?.headers).get('x-api-key')).toBe('brida_test_key')
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
      return jsonResponse({ object: 'list', data: [definition] })
    })
    const client = new BridaClient({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.list()).resolves.toEqual({ object: 'list', data: [definition] })
  })

  it('lists and reads immutable Reflex metadata including data class', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname
      return path === '/v1/reflexes'
        ? jsonResponse({ object: 'list', data: [definition] })
        : jsonResponse(definition)
    })
    const client = new BridaClient({ apiKey: 'brida_test_key', fetch: fetchMock })
    const listed = await client.reflex.list()
    const detail = await client.reflex.get('agent-wakeup')
    expect(listed.data[0]?.input.data_class).toBe('non_sensitive')
    expect(detail.active_version).toBe('3')
  })

  it('maps the public run contract and preserves caller idempotency exactly', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://preview.brida.test/v1/reflexes/agent-wakeup/runs')
      const headers = new Headers(init?.headers)
      expect(headers.get('idempotency-key')).toBe('logical-run-123')
      expect(JSON.parse(String(init?.body))).toEqual({
        version: '3',
        state: { source: 'github', event: 'check_run', conclusion: 'failure' },
        metadata: { client_ref: 'ci-42' },
      })
      return jsonResponse(run)
    })
    const client = new BridaClient({
      apiKey: 'brida_test_key',
      baseUrl: 'https://preview.brida.test/',
      fetch: fetchMock,
    })
    await expect(client.reflex.run('agent-wakeup', {
      version: '3',
      idempotencyKey: 'logical-run-123',
      state: { source: 'github', event: 'check_run', conclusion: 'failure' },
      metadata: { clientRef: 'ci-42' },
    })).resolves.toEqual(run)
  })

  it('surfaces the idempotency key on API errors for explicit safe retry', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      error: {
        message: 'Reflex Free capacity is temporarily unavailable.',
        type: 'api_error',
        code: 'free_capacity_temporarily_unavailable',
      },
      trace_id: 'trace_api_error',
    }, 503))
    const client = new BridaClient({ apiKey: 'brida_test_key', fetch: fetchMock })

    const error = await client.reflex.run('agent-wakeup', {
      idempotencyKey: 'logical-run-retry',
      state: { synthetic: true },
    }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(BridaApiError)
    if (!(error instanceof BridaApiError)) throw new Error('expected BridaApiError')
    expect(error).toMatchObject({
      status: 503,
      code: 'free_capacity_temporarily_unavailable',
      traceId: 'trace_api_error',
      idempotencyKey: 'logical-run-retry',
      retryable: true,
    })
  })

  it('surfaces the generated idempotency key on unknown transport outcome', async () => {
    let observedKey: string | null = null
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      observedKey = new Headers(init?.headers).get('idempotency-key')
      throw new Error('synthetic connection loss')
    })
    const client = new BridaClient({ apiKey: 'brida_test_key', fetch: fetchMock })
    const error = await client.reflex.run('agent-wakeup', { state: { synthetic: true } })
      .catch((value: unknown) => value)
    expect(error).toBeInstanceOf(BridaNetworkError)
    if (!(error instanceof BridaNetworkError)) throw new Error('expected BridaNetworkError')
    expect(observedKey).toMatch(/^brida_[0-9a-f-]{36}$/u)
    expect(error.idempotencyKey).toBe(observedKey)
  })

  it('rejects malformed response shapes instead of casting them blindly', async () => {
    const client = new BridaClient({
      apiKey: 'brida_test_key',
      fetch: async () => jsonResponse({ object: 'list', data: [{ id: 'missing-contract-fields' }] }),
    })
    await expect(client.reflex.list()).rejects.toBeInstanceOf(BridaResponseError)
  })

  it('validates caller JSON before network execution', async () => {
    const fetchMock = vi.fn()
    const client = new BridaClient({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.run('agent-wakeup', {
      state: { score: Number.NaN },
    })).rejects.toThrow(/non-finite/u)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates bounded public-safe idempotency keys', () => {
    expect(createIdempotencyKey()).toMatch(/^brida_[0-9a-f-]{36}$/u)
  })
})
