import { describe, expect, it, vi } from 'vitest'

import {
  BRIDA_API_URL,
  BridaApiError,
  Brida,
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

const customDefinition = {
  id: 'lead-fit',
  name: 'Lead fit',
  trust_class: 'organization_custom',
  active_version: '1',
  versions: [{
    version: '1',
    status: 'active',
    question_set_version: 'lead-fit-questions@1',
    questions: {
      qualified: { type: 'binary', instructions: 'Is this lead qualified?' },
    },
    policy_version: 'lead-fit-policy@1',
    declarative_policy: {
      type: 'binary',
      questionId: 'qualified',
      trueBranch: 'qualified',
      falseBranch: 'ignore',
      uncertainBranch: 'review',
      trueWhenProbabilityAtLeast: 0.8,
      falseWhenProbabilityAtMost: 0.2,
    },
    fixtures: [{
      id: 'synthetic-qualified',
      evidenceClass: 'synthetic',
      state: { company: 'Synthetic Co' },
      expectedBranch: 'qualified',
    }],
  }],
  input: { max_state_bytes: 8192, data_class: 'non_sensitive' },
  authority: 'recommendation_only',
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

describe('Brida Reflex namespace', () => {
  it('uses the canonical API URL by default and sends only the Brida API credential', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${BRIDA_API_URL}/v1/reflexes`)
      expect(new Headers(init?.headers).get('x-api-key')).toBe('brida_test_key')
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
      expect(init?.redirect).toBe('error')
      return jsonResponse({ object: 'list', data: [definition] })
    })
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.list()).resolves.toEqual({ object: 'list', data: [definition] })
  })

  it('requires HTTPS for credential-bearing remote API endpoints while allowing loopback HTTP', async () => {
    expect(() => new Brida({
      apiKey: 'brida_test_key',
      baseUrl: 'http://api.example.test',
    })).toThrow(/HTTPS/u)

    const fetchMock = vi.fn(async () => jsonResponse({ object: 'list', data: [] }))
    const local = new Brida({
      apiKey: 'brida_test_key',
      baseUrl: 'http://127.0.0.1:8787',
      fetch: fetchMock,
    })
    await local.reflex.list()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('lists and reads immutable Reflex metadata including data class', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname
      return path === '/v1/reflexes'
        ? jsonResponse({ object: 'list', data: [definition] })
        : jsonResponse(definition)
    })
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    const listed = await client.reflex.list()
    const detail = await client.reflex.get('agent-wakeup')
    expect(listed.data[0]?.input.data_class).toBe('non_sensitive')
    expect(detail.active_version).toBe('3')
  })

  it('drafts a bounded Custom Reflex with the exact public authoring contract', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${BRIDA_API_URL}/v1/reflexes/custom`)
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        id: 'lead-fit',
        version: '1',
        name: 'Lead fit',
        max_state_bytes: 8192,
        data_class: 'non_sensitive',
        question_set_version: 'lead-fit-questions@1',
        questions: {
          qualified: { type: 'binary', instructions: 'Is this lead qualified?' },
        },
        policy_version: 'lead-fit-policy@1',
        declarative_policy: {
          type: 'binary',
          questionId: 'qualified',
          trueBranch: 'qualified',
          falseBranch: 'ignore',
          uncertainBranch: 'review',
          trueWhenProbabilityAtLeast: 0.8,
          falseWhenProbabilityAtMost: 0.2,
        },
        fixtures: [{
          id: 'synthetic-qualified',
          evidenceClass: 'synthetic',
          state: { company: 'Synthetic Co' },
          expectedBranch: 'qualified',
        }],
      })
      return jsonResponse({
        ...customDefinition,
        active_version: null,
        versions: [{ ...customDefinition.versions[0], status: 'draft' }],
      }, 201)
    })
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    const drafted = await client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 8192,
      questionSetVersion: 'lead-fit-questions@1',
      questions: {
        qualified: { type: 'binary', instructions: 'Is this lead qualified?' },
      },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'qualified',
        trueBranch: 'qualified',
        falseBranch: 'ignore',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.8,
        falseWhenProbabilityAtMost: 0.2,
      },
      fixtures: [{
        id: 'synthetic-qualified',
        evidenceClass: 'synthetic',
        state: { company: 'Synthetic Co' },
        expectedBranch: 'qualified',
      }],
    })
    expect(drafted).toMatchObject({
      id: 'lead-fit',
      trust_class: 'organization_custom',
      active_version: null,
      versions: [{
        version: '1',
        status: 'draft',
        question_set_version: 'lead-fit-questions@1',
      }],
      authority: 'recommendation_only',
    })
  })

  it('activates and retires Custom Reflex versions through explicit lifecycle endpoints', async () => {
    const requests: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push(`${init?.method} ${new URL(String(url)).pathname}`)
      return jsonResponse(customDefinition)
    })
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.custom.activate('lead-fit', '1')).resolves.toMatchObject({
      id: 'lead-fit',
      trust_class: 'organization_custom',
      active_version: '1',
    })
    await expect(client.reflex.custom.retire('lead-fit', '1')).resolves.toMatchObject({
      id: 'lead-fit',
      trust_class: 'organization_custom',
    })
    expect(requests).toEqual([
      'POST /v1/reflexes/lead-fit/versions/1/activate',
      'POST /v1/reflexes/lead-fit/versions/1/retire',
    ])
  })

  it('rejects malformed Custom Reflex authoring inputs before network execution', async () => {
    const fetchMock = vi.fn()
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.custom.draft({
      id: 'Bad Id',
      version: '1',
      name: 'Bad',
      maxStateBytes: 8192,
      questionSetVersion: 'bad@1',
      questions: {},
      policyVersion: 'bad@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'q',
        trueBranch: 'yes',
        falseBranch: 'no',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.8,
        falseWhenProbabilityAtMost: 0.2,
      },
      fixtures: [],
    })).rejects.toThrow(/reflexId/u)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects Custom Reflex definitions that violate the public schema invariants before network execution', async () => {
    const fetchMock = vi.fn()
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })

    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead-fit-questions@1',
      questions: {
        qualified: { type: 'choice', instructions: 'Choose fit', criteria: { yes: 'yes' } },
      },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'choice',
        questionId: 'qualified',
        branches: { yes: 'qualified' },
        minimumSelectedProbability: 0.8,
        uncertainBranch: 'review',
      },
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
    })).rejects.toThrow(/2 to 32 choices/u)

    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead-fit-questions@1',
      questions: {
        qualified: { type: 'binary', instructions: 'Qualified?' },
      },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'qualified',
        trueBranch: 'qualified',
        falseBranch: 'ignore',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.4,
        falseWhenProbabilityAtMost: 0.6,
      },
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
    })).rejects.toThrow(/thresholds overlap/u)

    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead-fit-questions@1',
      questions: {
        qualified: { type: 'binary', instructions: 'Qualified?' },
      },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'qualified',
        trueBranch: 'qualified',
        falseBranch: 'ignore',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.8,
        falseWhenProbabilityAtMost: 0.2,
      },
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'impossible' }],
    })).rejects.toThrow(/not reachable/u)

    const policyWithExtraField = {
      type: 'binary',
      questionId: 'qualified',
      trueBranch: 'qualified',
      falseBranch: 'ignore',
      uncertainBranch: 'review',
      trueWhenProbabilityAtLeast: 0.8,
      falseWhenProbabilityAtMost: 0.2,
      debug: true,
    } as const
    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead-fit-questions@1',
      questions: { qualified: { type: 'binary', instructions: 'Qualified?' } },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: policyWithExtraField,
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
    })).rejects.toThrow(/unsupported fields/u)

    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead-fit-questions@1',
      questions: { qualified: { type: 'binary', instructions: '   ' } },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'qualified',
        trueBranch: 'qualified',
        falseBranch: 'ignore',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.8,
        falseWhenProbabilityAtMost: 0.2,
      },
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
    })).rejects.toThrow(/non-empty bounded string/u)

    await expect(client.reflex.custom.draft({
      id: 'lead-fit',
      version: '1',
      name: 'Lead fit',
      maxStateBytes: 64,
      questionSetVersion: 'lead fit questions@1',
      questions: { qualified: { type: 'binary', instructions: 'Qualified?' } },
      policyVersion: 'lead-fit-policy@1',
      declarativePolicy: {
        type: 'binary',
        questionId: 'qualified',
        trueBranch: 'qualified',
        falseBranch: 'ignore',
        uncertainBranch: 'review',
        trueWhenProbabilityAtLeast: 0.8,
        falseWhenProbabilityAtMost: 0.2,
      },
      fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
    })).rejects.toThrow(/questionSetVersion is invalid/u)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid Reflex identifiers, versions and client refs before network execution', async () => {
    const fetchMock = vi.fn()
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })

    await expect(client.reflex.get('Bad Id')).rejects.toThrow(/reflexId is invalid/u)
    await expect(client.reflex.run('Bad Id', { state: { synthetic: true } })).rejects.toThrow(/reflexId is invalid/u)
    await expect(client.reflex.run('agent-wakeup', {
      version: 'v3',
      state: { synthetic: true },
    })).rejects.toThrow(/version is invalid/u)
    await expect(client.reflex.run('agent-wakeup', {
      state: { synthetic: true },
      metadata: { clientRef: 'bad client ref' },
    })).rejects.toThrow(/clientRef is invalid/u)

    expect(fetchMock).not.toHaveBeenCalled()
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
    const client = new Brida({
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
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })

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

  it('preserves HTTP status and idempotency semantics for malformed JSON error envelopes', async () => {
    const client = new Brida({
      apiKey: 'brida_test_key',
      fetch: async () => jsonResponse({ error: {}, trace_id: 'trace_bad_error' }, 503),
    })
    const error = await client.reflex.run('agent-wakeup', {
      state: { synthetic: true },
      idempotencyKey: 'logical-run-bad-error',
    }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(BridaApiError)
    if (!(error instanceof BridaApiError)) throw new Error('expected BridaApiError')
    expect(error).toMatchObject({
      status: 503,
      code: 'invalid_error_response',
      type: 'api_error',
      traceId: 'trace_bad_error',
      idempotencyKey: 'logical-run-bad-error',
      retryable: true,
    })
  })

  it('marks explicit caller cancellation as non-retryable without executing fetch', async () => {
    const controller = new AbortController()
    controller.abort(new Error('synthetic caller cancellation'))
    const fetchMock = vi.fn()
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    const error = await client.reflex.run('agent-wakeup', {
      state: { synthetic: true },
      idempotencyKey: 'logical-run-cancelled',
      signal: controller.signal,
    }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(BridaNetworkError)
    if (!(error instanceof BridaNetworkError)) throw new Error('expected BridaNetworkError')
    expect(error.idempotencyKey).toBe('logical-run-cancelled')
    expect(error.retryable).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the generated idempotency key on unknown transport outcome', async () => {
    let observedKey: string | null = null
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      observedKey = new Headers(init?.headers).get('idempotency-key')
      throw new Error('synthetic connection loss')
    })
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    const error = await client.reflex.run('agent-wakeup', { state: { synthetic: true } })
      .catch((value: unknown) => value)
    expect(error).toBeInstanceOf(BridaNetworkError)
    if (!(error instanceof BridaNetworkError)) throw new Error('expected BridaNetworkError')
    expect(observedKey).toMatch(/^brida_[0-9a-f-]{36}$/u)
    expect(error.idempotencyKey).toBe(observedKey)
  })

  it('rejects malformed response shapes instead of casting them blindly', async () => {
    const client = new Brida({
      apiKey: 'brida_test_key',
      fetch: async () => jsonResponse({ object: 'list', data: [{ id: 'missing-contract-fields' }] }),
    })
    await expect(client.reflex.list()).rejects.toBeInstanceOf(BridaResponseError)
  })

  it('rejects malformed detailed Custom Reflex responses instead of trusting TypeScript casts', async () => {
    const malformedCustom = {
      id: 'lead-fit',
      name: 'Lead fit',
      trust_class: 'organization_custom',
      active_version: '1',
      versions: [{
        version: '1',
        status: 'active',
        question_set_version: 'lead-fit-questions@1',
        questions: { qualified: { type: 'binary', instructions: 'Qualified?' } },
        policy_version: 'lead-fit-policy@1',
        declarative_policy: {
          type: 'binary',
          questionId: 'qualified',
          trueBranch: 'qualified',
          falseBranch: 'ignore',
          uncertainBranch: 'review',
          trueWhenProbabilityAtLeast: 0.8,
          falseWhenProbabilityAtMost: 0.2,
          debug: true,
        },
        fixtures: [{ id: 'fixture-1', evidenceClass: 'synthetic', state: { lead: true }, expectedBranch: 'qualified' }],
      }],
      input: { max_state_bytes: 64, data_class: 'non_sensitive' },
      authority: 'recommendation_only',
    }
    const client = new Brida({
      apiKey: 'brida_test_key',
      fetch: async () => jsonResponse(malformedCustom),
    })
    await expect(client.reflex.get('lead-fit')).rejects.toBeInstanceOf(BridaResponseError)
  })

  it('validates caller JSON before network execution', async () => {
    const fetchMock = vi.fn()
    const client = new Brida({ apiKey: 'brida_test_key', fetch: fetchMock })
    await expect(client.reflex.run('agent-wakeup', {
      state: { score: Number.NaN },
    })).rejects.toThrow(/non-finite/u)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates bounded public-safe idempotency keys', () => {
    expect(createIdempotencyKey()).toMatch(/^brida_[0-9a-f-]{36}$/u)
  })
})
