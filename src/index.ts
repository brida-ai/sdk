export const BRIDA_API_URL = 'https://api.brida.ai' as const

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type DecisionInput = string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type ReflexDataClass =
  | 'legacy_unspecified'
  | 'non_sensitive'
  | 'sensitive_personal'
  | 'regulated_sensitive'
  | (string & {})

export type ReflexVersionStatus = 'draft' | 'active' | 'retired' | (string & {})

export type ReflexQuestion =
  | Readonly<{
      type: 'binary'
      instructions: DecisionInput
      criteria?: Readonly<{ true?: DecisionInput | null; false?: DecisionInput | null }>
    }>
  | Readonly<{
      type: 'choice'
      instructions: DecisionInput
      criteria: Readonly<Record<string, DecisionInput | null>>
    }>
  | Readonly<{
      type: 'score'
      instructions: DecisionInput
      criteria: readonly (DecisionInput | null)[]
    }>

export type ReflexDeclarativePolicy =
  | Readonly<{
      type: 'binary'
      questionId: string
      trueBranch: string
      falseBranch: string
      uncertainBranch: string
      trueWhenProbabilityAtLeast: number
      falseWhenProbabilityAtMost: number
    }>
  | Readonly<{
      type: 'choice'
      questionId: string
      branches: Readonly<Record<string, string>>
      minimumSelectedProbability: number
      uncertainBranch: string
    }>
  | Readonly<{
      type: 'score'
      questionId: string
      thresholds: readonly Readonly<{ atLeast: number; branch: string }>[]
      belowBranch: string
    }>

export interface CustomReflexFixture {
  readonly id: string
  readonly evidenceClass: 'synthetic' | 'redacted'
  readonly state: JsonValue
  readonly expectedBranch: string
}

export interface ReflexVersionDefinition {
  readonly version: string
  readonly status: ReflexVersionStatus
  readonly question_set_version?: string
  readonly questions?: Readonly<Record<string, ReflexQuestion>>
  readonly policy_version?: string
  readonly declarative_policy?: ReflexDeclarativePolicy
  readonly fixtures?: readonly CustomReflexFixture[]
}

export interface ReflexDefinition {
  readonly id: string
  readonly name: string
  readonly trust_class: 'official' | 'organization_custom' | (string & {})
  readonly active_version: string | null
  readonly versions: readonly ReflexVersionDefinition[]
  readonly input: Readonly<{
    max_state_bytes: number
    data_class: ReflexDataClass
  }>
  readonly authority?: 'recommendation_only' | (string & {}) | undefined
}

export interface ReflexListResponse {
  readonly object: 'list'
  readonly data: readonly ReflexDefinition[]
}

export type ReflexEvidence =
  | Readonly<{ type: 'binary'; value: boolean; confidence: number }>
  | Readonly<{ type: 'choice'; value: string; confidence?: number }>
  | Readonly<{ type: 'score'; value: number }>

export interface ReflexRunResult {
  readonly id: string
  readonly object: 'reflex.run'
  readonly reflex: Readonly<{ id: string; version: string }>
  readonly decision: Readonly<{
    branch: string
    reason: string
    evidence_status: string
    data?: JsonValue
  }>
  readonly evidence: Readonly<Record<string, ReflexEvidence>>
  readonly usage: Readonly<{
    input_tokens?: number
    output_tokens?: number
    decision_capacity: number
  }>
  readonly capacity: Readonly<{
    kind: 'reflex_free'
    remaining: number
    resets_at: string
  }>
  readonly receipt_id: string
  readonly trace_id: string
}

export interface DraftCustomReflexOptions {
  readonly id: string
  readonly version: string
  readonly name: string
  readonly maxStateBytes: number
  readonly questionSetVersion: string
  readonly questions: Readonly<Record<string, ReflexQuestion>>
  readonly policyVersion: string
  readonly declarativePolicy: ReflexDeclarativePolicy
  readonly fixtures: readonly CustomReflexFixture[]
  readonly signal?: AbortSignal
}

export interface CustomReflexVersionOptions {
  readonly signal?: AbortSignal
}

export interface RunReflexOptions {
  readonly state: JsonValue
  readonly version?: string
  readonly metadata?: Readonly<{ clientRef?: string }>
  /**
   * Logical-run identity. Reuse the same key only when retrying the exact same
   * Reflex request after an unknown transport outcome.
   *
   * If omitted, the SDK creates one for this call. Transport/API errors expose
   * the key on the thrown error so a caller can safely retry the same request.
   */
  readonly idempotencyKey?: string
  readonly signal?: AbortSignal
}

export interface BridaClientOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly fetch?: typeof fetch
}

export interface BridaErrorEnvelope {
  readonly error: Readonly<{
    message: string
    type: string
    code: string
    param?: string
  }>
  readonly trace_id?: string
}

export class BridaApiError extends Error {
  override readonly name = 'BridaApiError'

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly type: string,
    readonly traceId: string | undefined,
    readonly param: string | undefined,
    readonly idempotencyKey: string | undefined,
  ) {
    super(message)
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export class BridaNetworkError extends Error {
  override readonly name = 'BridaNetworkError'
  readonly retryable: boolean

  constructor(
    message: string,
    readonly idempotencyKey: string | undefined,
    options?: ErrorOptions & Readonly<{ retryable?: boolean }>,
  ) {
    super(message, options)
    this.retryable = options?.retryable ?? true
  }
}

export class BridaResponseError extends Error {
  override readonly name = 'BridaResponseError'
  readonly retryable = false
}

export class BridaClient {
  readonly #baseUrl: string
  readonly #apiKey: string
  readonly #fetch: typeof fetch

  readonly reflex: Readonly<{
    list(): Promise<ReflexListResponse>
    get(reflexId: string): Promise<ReflexDefinition>
    run(reflexId: string, options: RunReflexOptions): Promise<ReflexRunResult>
    custom: Readonly<{
      draft(options: DraftCustomReflexOptions): Promise<ReflexDefinition>
      activate(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
      retire(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
    }>
  }>

  constructor(options: BridaClientOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? BRIDA_API_URL)
    this.#apiKey = boundedToken(options.apiKey, 'apiKey', 512)
    this.#fetch = options.fetch ?? globalThis.fetch
    if (typeof this.#fetch !== 'function') {
      throw new TypeError('A Fetch API implementation is required')
    }

    this.reflex = Object.freeze({
      list: () => this.#listReflexes(),
      get: (reflexId) => this.#getReflex(reflexId),
      run: (reflexId, runOptions) => this.#runReflex(reflexId, runOptions),
      custom: Object.freeze({
        draft: (draftOptions: DraftCustomReflexOptions) => this.#draftCustomReflex(draftOptions),
        activate: (reflexId: string, version: string, versionOptions?: CustomReflexVersionOptions) => this.#changeCustomReflexVersion(
          'activate',
          reflexId,
          version,
          versionOptions,
        ),
        retire: (reflexId: string, version: string, versionOptions?: CustomReflexVersionOptions) => this.#changeCustomReflexVersion(
          'retire',
          reflexId,
          version,
          versionOptions,
        ),
      }),
    })
  }

  async #listReflexes(): Promise<ReflexListResponse> {
    const body = await this.#request('/v1/reflexes', { method: 'GET' })
    return parseReflexList(body)
  }

  async #getReflex(reflexId: string): Promise<ReflexDefinition> {
    const id = validateReflexId(reflexId)
    const body = await this.#request(`/v1/reflexes/${encodeURIComponent(id)}`, { method: 'GET' })
    return parseReflexDefinition(body)
  }

  async #draftCustomReflex(options: DraftCustomReflexOptions): Promise<ReflexDefinition> {
    const id = validateReflexId(options.id)
    const version = validateReflexVersion(options.version)
    const name = boundedToken(options.name, 'name', 120)
    if (!Number.isSafeInteger(options.maxStateBytes) || options.maxStateBytes < 1 || options.maxStateBytes > 262_144) {
      throw new TypeError('maxStateBytes must be an integer from 1 to 262144')
    }
    const questionSetVersion = validateVersionedReference(options.questionSetVersion, 'questionSetVersion')
    const policyVersion = validateVersionedReference(options.policyVersion, 'policyVersion')
    validateQuestionsInput(options.questions)
    validateDeclarativePolicyInput(options.declarativePolicy, options.questions)
    validateFixturesInput(options.fixtures, options.maxStateBytes, options.declarativePolicy)

    const body = await this.#request('/v1/reflexes/custom', {
      method: 'POST',
      body: {
        id,
        version,
        name,
        max_state_bytes: options.maxStateBytes,
        data_class: 'non_sensitive',
        question_set_version: questionSetVersion,
        questions: options.questions,
        policy_version: policyVersion,
        declarative_policy: options.declarativePolicy,
        fixtures: options.fixtures,
      },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    return parseReflexDefinition(body)
  }

  async #changeCustomReflexVersion(
    action: 'activate' | 'retire',
    reflexId: string,
    version: string,
    options: CustomReflexVersionOptions = {},
  ): Promise<ReflexDefinition> {
    const id = validateReflexId(reflexId)
    const normalizedVersion = validateReflexVersion(version)
    const body = await this.#request(
      `/v1/reflexes/${encodeURIComponent(id)}/versions/${encodeURIComponent(normalizedVersion)}/${action}`,
      {
        method: 'POST',
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    )
    return parseReflexDefinition(body)
  }

  async #runReflex(reflexId: string, options: RunReflexOptions): Promise<ReflexRunResult> {
    const id = validateReflexId(reflexId)
    validateJson(options.state, 'state')
    const version = options.version === undefined
      ? undefined
      : validateReflexVersion(options.version)
    const clientRef = options.metadata?.clientRef === undefined
      ? undefined
      : validateClientRef(options.metadata.clientRef)
    const idempotencyKey = options.idempotencyKey === undefined
      ? createIdempotencyKey()
      : validateIdempotencyKey(options.idempotencyKey)

    const body: Record<string, unknown> = {
      state: options.state,
      ...(version === undefined ? {} : { version }),
      ...(clientRef === undefined ? {} : { metadata: { client_ref: clientRef } }),
    }

    const response = await this.#request(
      `/v1/reflexes/${encodeURIComponent(id)}/runs`,
      {
        method: 'POST',
        body,
        idempotencyKey,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    )
    return parseReflexRun(response)
  }

  async #request(
    path: string,
    input: Readonly<{
      method: 'GET' | 'POST'
      body?: Readonly<Record<string, unknown>>
      idempotencyKey?: string
      signal?: AbortSignal
    }>,
  ): Promise<unknown> {
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

/** Create a bounded Brida logical-run idempotency key for a new operation. */
export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID() is required to create an idempotency key')
  }
  return `brida_${globalThis.crypto.randomUUID()}`
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

function boundedIdentifier(value: string, field: string): string {
  return boundedToken(value, field, 192)
}

function boundedToken(value: string, field: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${field} must be a non-empty bounded token`)
  }
  return normalized
}

function validateReflexId(value: string): string {
  const normalized = value.trim()
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(normalized) || normalized.length > 64) {
    throw new TypeError('reflexId is invalid')
  }
  return normalized
}

function validateReflexVersion(value: string): string {
  const normalized = value.trim()
  if (!/^[1-9][0-9]{0,8}$/u.test(normalized)) throw new TypeError('version is invalid')
  return normalized
}

function validateVersionedReference(value: string, field: string): string {
  const normalized = value.trim()
  if (!VERSIONED_REFERENCE.test(normalized)) throw new TypeError(`${field} is invalid`)
  return normalized
}

function validateClientRef(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(normalized)) {
    throw new TypeError('metadata.clientRef is invalid')
  }
  return normalized
}

function validateIdempotencyKey(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u.test(normalized)) {
    throw new TypeError('idempotencyKey is invalid')
  }
  return normalized
}

const QUESTION_ID = /^[a-z][A-Za-z0-9_]{0,63}$/u
const VERSIONED_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/u
const BRANCH = /^[a-z][a-z0-9_]{0,63}$/u
const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

function validateQuestionsInput(value: Readonly<Record<string, ReflexQuestion>>): void {
  if (!isRecord(value)) throw new TypeError('questions must be an object')
  const entries = Object.entries(value)
  if (entries.length < 1 || entries.length > 32) throw new TypeError('questions must contain 1 to 32 entries')
  for (const [id, raw] of entries) {
    if (!QUESTION_ID.test(id)) throw new TypeError(`questions.${id} has an invalid question id`)
    if (!isRecord(raw)) throw new TypeError(`questions.${id} must be an object`)
    const allowed = raw.type === 'binary'
      ? new Set(['type', 'instructions', 'criteria'])
      : new Set(['type', 'instructions', 'criteria'])
    if (Object.keys(raw).some((key) => !allowed.has(key))) {
      throw new TypeError(`questions.${id} contains unsupported fields`)
    }
    validateDecisionInput(raw.instructions, `questions.${id}.instructions`)
    if (raw.type === 'binary') {
      if (raw.criteria !== undefined) {
        if (!isRecord(raw.criteria) || Object.keys(raw.criteria).some((key) => key !== 'true' && key !== 'false') || Object.keys(raw.criteria).length < 1) {
          throw new TypeError(`questions.${id}.criteria is invalid`)
        }
        for (const [key, item] of Object.entries(raw.criteria)) {
          if (item !== null) validateDecisionInput(item, `questions.${id}.criteria.${key}`)
        }
      }
      continue
    }
    if (raw.type === 'choice') {
      if (!isRecord(raw.criteria)) throw new TypeError(`questions.${id}.criteria must be an object`)
      const choices = Object.entries(raw.criteria)
      if (choices.length < 2 || choices.length > 32) throw new TypeError(`questions.${id}.criteria must contain 2 to 32 choices`)
      for (const [choice, item] of choices) {
        if (choice.length < 1 || choice.length > 64) throw new TypeError(`questions.${id}.criteria has an invalid choice`)
        if (item !== null) validateDecisionInput(item, `questions.${id}.criteria.${choice}`)
      }
      continue
    }
    if (raw.type === 'score') {
      if (!Array.isArray(raw.criteria) || raw.criteria.length < 2 || raw.criteria.length > 32) {
        throw new TypeError(`questions.${id}.criteria must contain 2 to 32 score labels`)
      }
      raw.criteria.forEach((item, index) => {
        if (item !== null) validateDecisionInput(item, `questions.${id}.criteria.${index}`)
      })
      continue
    }
    throw new TypeError(`questions.${id}.type is invalid`)
  }
}

function validateDecisionInput(value: unknown, field: string): void {
  if (typeof value === 'string') {
    if (value.trim().length < 1 || value.length > 4096) throw new TypeError(`${field} must be a non-empty bounded string`)
    return
  }
  if (Array.isArray(value)) {
    validateJson(value, field)
    return
  }
  if (isRecord(value)) {
    validateJson(value, field)
    return
  }
  throw new TypeError(`${field} must be a string, object, or array`)
}

function validateDeclarativePolicyInput(
  policy: ReflexDeclarativePolicy,
  questions: Readonly<Record<string, ReflexQuestion>>,
): void {
  if (!isRecord(policy)) throw new TypeError('declarativePolicy must be an object')
  const allowed = policy.type === 'binary'
    ? new Set(['type', 'questionId', 'trueBranch', 'falseBranch', 'uncertainBranch', 'trueWhenProbabilityAtLeast', 'falseWhenProbabilityAtMost'])
    : policy.type === 'choice'
      ? new Set(['type', 'questionId', 'branches', 'minimumSelectedProbability', 'uncertainBranch'])
      : policy.type === 'score'
        ? new Set(['type', 'questionId', 'thresholds', 'belowBranch'])
        : undefined
  if (allowed === undefined) throw new TypeError('declarativePolicy.type is invalid')
  if (Object.keys(policy).some((key) => !allowed.has(key))) {
    throw new TypeError('declarativePolicy contains unsupported fields')
  }
  if (typeof policy.questionId !== 'string' || !QUESTION_ID.test(policy.questionId) || questions[policy.questionId] === undefined) {
    throw new TypeError('declarativePolicy.questionId is invalid')
  }
  const question = questions[policy.questionId]
  if (question === undefined) throw new TypeError('declarativePolicy.questionId is invalid')
  if (policy.type === 'binary') {
    if (question.type !== 'binary') throw new TypeError('declarativePolicy question type does not match')
    branch(policy.trueBranch, 'declarativePolicy.trueBranch')
    branch(policy.falseBranch, 'declarativePolicy.falseBranch')
    branch(policy.uncertainBranch, 'declarativePolicy.uncertainBranch')
    probability(policy.trueWhenProbabilityAtLeast, 'declarativePolicy.trueWhenProbabilityAtLeast')
    probability(policy.falseWhenProbabilityAtMost, 'declarativePolicy.falseWhenProbabilityAtMost')
    if (policy.falseWhenProbabilityAtMost > policy.trueWhenProbabilityAtLeast) {
      throw new TypeError('declarativePolicy binary thresholds overlap')
    }
    return
  }
  if (policy.type === 'choice') {
    if (question.type !== 'choice') throw new TypeError('declarativePolicy question type does not match')
    if (!isRecord(policy.branches)) throw new TypeError('declarativePolicy.branches must be an object')
    const mappings = Object.entries(policy.branches)
    if (mappings.length < 1 || mappings.length > 32) throw new TypeError('declarativePolicy.branches must contain 1 to 32 entries')
    for (const [choice, mappedBranch] of mappings) {
      if (!Object.hasOwn(question.criteria, choice)) throw new TypeError(`declarativePolicy.branches.${choice} is not a declared choice`)
      branch(mappedBranch, `declarativePolicy.branches.${choice}`)
    }
    branch(policy.uncertainBranch, 'declarativePolicy.uncertainBranch')
    probability(policy.minimumSelectedProbability, 'declarativePolicy.minimumSelectedProbability')
    return
  }
  if (policy.type === 'score') {
    if (question.type !== 'score') throw new TypeError('declarativePolicy question type does not match')
    if (!Array.isArray(policy.thresholds) || policy.thresholds.length < 1 || policy.thresholds.length > 32) {
      throw new TypeError('declarativePolicy.thresholds must contain 1 to 32 entries')
    }
    let previous = Number.POSITIVE_INFINITY
    policy.thresholds.forEach((item, index) => {
      if (!isRecord(item) || Object.keys(item).some((key) => key !== 'atLeast' && key !== 'branch')) {
        throw new TypeError(`declarativePolicy.thresholds.${index} is invalid`)
      }
      const atLeast = item.atLeast
      const mappedBranch = item.branch
      if (typeof atLeast !== 'number' || !Number.isFinite(atLeast) || atLeast >= previous) {
        throw new TypeError('declarativePolicy.thresholds must be strictly descending')
      }
      previous = atLeast
      if (typeof mappedBranch !== 'string') throw new TypeError(`declarativePolicy.thresholds.${index}.branch is invalid`)
      branch(mappedBranch, `declarativePolicy.thresholds.${index}.branch`)
    })
    branch(policy.belowBranch, 'declarativePolicy.belowBranch')
    return
  }
  throw new TypeError('declarativePolicy.type is invalid')
}

function validateFixturesInput(
  fixtures: readonly CustomReflexFixture[],
  maxStateBytes: number,
  policy: ReflexDeclarativePolicy,
): void {
  if (!Array.isArray(fixtures) || fixtures.length < 1 || fixtures.length > 32) throw new TypeError('fixtures must contain 1 to 32 examples')
  const ids = new Set<string>()
  const branches = new Set<string>()
  if (policy.type === 'binary') [policy.trueBranch, policy.falseBranch, policy.uncertainBranch].forEach((value) => branches.add(value))
  else if (policy.type === 'choice') {
    Object.values(policy.branches).forEach((value) => branches.add(value))
    branches.add(policy.uncertainBranch)
  } else {
    policy.thresholds.forEach((item) => branches.add(item.branch))
    branches.add(policy.belowBranch)
  }
  fixtures.forEach((fixture, index) => {
    if (!isRecord(fixture) || Object.keys(fixture).some((key) => !['id', 'evidenceClass', 'state', 'expectedBranch'].includes(key))) {
      throw new TypeError(`fixtures.${index} is invalid`)
    }
    if (typeof fixture.id !== 'string' || !FIXTURE_ID.test(fixture.id) || ids.has(fixture.id)) {
      throw new TypeError(`fixtures.${index}.id is invalid or duplicated`)
    }
    ids.add(fixture.id)
    if (fixture.evidenceClass !== 'synthetic' && fixture.evidenceClass !== 'redacted') throw new TypeError(`fixtures.${index}.evidenceClass is invalid`)
    validateJson(fixture.state, `fixtures.${index}.state`)
    const encoded = new TextEncoder().encode(JSON.stringify(fixture.state)).byteLength
    if (encoded > Math.min(maxStateBytes, 65_536)) throw new TypeError(`fixtures.${index}.state exceeds the supported byte limit`)
    if (typeof fixture.expectedBranch !== 'string' || !BRANCH.test(fixture.expectedBranch) || !branches.has(fixture.expectedBranch)) {
      throw new TypeError(`fixtures.${index}.expectedBranch is not reachable by declarativePolicy`)
    }
  })
}

function branch(value: string, field: string): void {
  if (typeof value !== 'string' || !BRANCH.test(value)) throw new TypeError(`${field} is invalid`)
}

function probability(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${field} is invalid`)
}

function validateJson(value: unknown, field: string, seen = new WeakSet<object>(), depth = 0): void {
  if (depth > 32) throw new TypeError(`${field} exceeds the supported JSON depth`)
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field} contains a non-finite number`)
    return
  }
  if (typeof value !== 'object') throw new TypeError(`${field} must be JSON-compatible`)
  if (seen.has(value)) throw new TypeError(`${field} must not contain cycles`)
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, field, seen, depth + 1)
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError(`${field} contains an unsafe object key`)
      }
      validateJson(item, field, seen, depth + 1)
    }
  }
  seen.delete(value)
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

function parseReflexList(value: unknown): ReflexListResponse {
  if (!isRecord(value) || value.object !== 'list' || !Array.isArray(value.data)) {
    throw new BridaResponseError('The Brida Reflex list response failed contract validation.')
  }
  return Object.freeze({
    object: 'list',
    data: Object.freeze(value.data.map(parseReflexDefinition)),
  })
}

function parseReflexDefinition(value: unknown): ReflexDefinition {
  if (!isRecord(value) || !Array.isArray(value.versions) || !isRecord(value.input)) {
    throw new BridaResponseError('The Brida Reflex definition response failed contract validation.')
  }
  const maxStateBytes = requiredNonNegativeInteger(value.input.max_state_bytes, 'input.max_state_bytes')
  if (maxStateBytes < 1 || maxStateBytes > 262_144) {
    throw new BridaResponseError('input.max_state_bytes is outside the supported Reflex contract.')
  }
  const versions = value.versions.map((item) => {
    if (!isRecord(item)) throw new BridaResponseError('A Brida Reflex version failed contract validation.')
    const questions = item.questions === undefined
      ? undefined
      : parseQuestions(item.questions)
    const declarativePolicy = item.declarative_policy === undefined
      ? undefined
      : parseDeclarativePolicy(item.declarative_policy, questions)
    const fixtures = item.fixtures === undefined
      ? undefined
      : parseCustomFixtures(item.fixtures, maxStateBytes, declarativePolicy)
    return Object.freeze({
      version: requiredString(item.version, 'version'),
      status: requiredString(item.status, 'status') as ReflexVersionStatus,
      ...(item.question_set_version === undefined
        ? {}
        : { question_set_version: requiredString(item.question_set_version, 'question_set_version') }),
      ...(questions === undefined ? {} : { questions }),
      ...(item.policy_version === undefined
        ? {}
        : { policy_version: requiredString(item.policy_version, 'policy_version') }),
      ...(declarativePolicy === undefined ? {} : { declarative_policy: declarativePolicy }),
      ...(fixtures === undefined ? {} : { fixtures }),
    })
  })
  const activeVersion = value.active_version === null
    ? null
    : requiredString(value.active_version, 'active_version')
  return Object.freeze({
    id: requiredString(value.id, 'id'),
    name: requiredString(value.name, 'name'),
    trust_class: requiredString(value.trust_class, 'trust_class') as ReflexDefinition['trust_class'],
    active_version: activeVersion,
    versions: Object.freeze(versions),
    input: Object.freeze({
      max_state_bytes: maxStateBytes,
      data_class: requiredString(value.input.data_class, 'input.data_class') as ReflexDataClass,
    }),
    ...(value.authority === undefined
      ? {}
      : { authority: requiredString(value.authority, 'authority') as ReflexDefinition['authority'] }),
  })
}

function parseQuestions(value: unknown): Readonly<Record<string, ReflexQuestion>> {
  if (!isRecord(value)) throw new BridaResponseError('Custom Reflex questions failed contract validation.')
  try {
    validateQuestionsInput(value as Readonly<Record<string, ReflexQuestion>>)
  } catch (cause) {
    throw new BridaResponseError('Custom Reflex questions failed contract validation.', { cause })
  }
  return Object.freeze({ ...value }) as Readonly<Record<string, ReflexQuestion>>
}

function parseDeclarativePolicy(
  value: unknown,
  questions: Readonly<Record<string, ReflexQuestion>> | undefined,
): ReflexDeclarativePolicy {
  if (!isRecord(value) || questions === undefined) {
    throw new BridaResponseError('Custom Reflex declarative policy failed contract validation.')
  }
  const policy = value as unknown as ReflexDeclarativePolicy
  try {
    validateDeclarativePolicyInput(policy, questions)
  } catch (cause) {
    throw new BridaResponseError('Custom Reflex declarative policy failed contract validation.', { cause })
  }
  return Object.freeze({ ...value }) as unknown as ReflexDeclarativePolicy
}

function parseCustomFixtures(
  value: unknown,
  maxStateBytes: number,
  policy: ReflexDeclarativePolicy | undefined,
): readonly CustomReflexFixture[] {
  if (!Array.isArray(value) || policy === undefined) {
    throw new BridaResponseError('Custom Reflex fixtures failed contract validation.')
  }
  try {
    validateFixturesInput(value as readonly CustomReflexFixture[], maxStateBytes, policy)
  } catch (cause) {
    throw new BridaResponseError('Custom Reflex fixtures failed contract validation.', { cause })
  }
  return Object.freeze(value.map((item, index) => {
    if (!isRecord(item)) throw new BridaResponseError('A Custom Reflex fixture failed contract validation.')
    const evidenceClass = requiredString(item.evidenceClass, `fixtures.${index}.evidenceClass`)
    if (evidenceClass !== 'synthetic' && evidenceClass !== 'redacted') {
      throw new BridaResponseError('A Custom Reflex fixture evidence class is invalid.')
    }
    validateJson(item.state, `fixtures.${index}.state`)
    return Object.freeze({
      id: requiredString(item.id, `fixtures.${index}.id`),
      evidenceClass,
      state: item.state as JsonValue,
      expectedBranch: requiredString(item.expectedBranch, `fixtures.${index}.expectedBranch`),
    })
  }))
}

function parseReflexRun(value: unknown): ReflexRunResult {
  if (
    !isRecord(value) || value.object !== 'reflex.run' || !isRecord(value.reflex) ||
    !isRecord(value.decision) || !isRecord(value.evidence) || !isRecord(value.usage) ||
    !isRecord(value.capacity)
  ) {
    throw new BridaResponseError('The Brida Reflex run response failed contract validation.')
  }
  const evidence: Record<string, ReflexEvidence> = {}
  for (const [key, item] of Object.entries(value.evidence)) evidence[key] = parseEvidence(item)
  const data = value.decision.data
  if (data !== undefined) validateJson(data, 'decision.data')
  if (value.capacity.kind !== 'reflex_free') {
    throw new BridaResponseError('The Brida Reflex capacity kind is unsupported.')
  }
  return Object.freeze({
    id: requiredString(value.id, 'id'),
    object: 'reflex.run',
    reflex: Object.freeze({
      id: requiredString(value.reflex.id, 'reflex.id'),
      version: requiredString(value.reflex.version, 'reflex.version'),
    }),
    decision: Object.freeze({
      branch: requiredString(value.decision.branch, 'decision.branch'),
      reason: requiredString(value.decision.reason, 'decision.reason'),
      evidence_status: requiredString(value.decision.evidence_status, 'decision.evidence_status'),
      ...(data === undefined ? {} : { data: data as JsonValue }),
    }),
    evidence: Object.freeze(evidence),
    usage: Object.freeze({
      ...(value.usage.input_tokens === undefined
        ? {}
        : { input_tokens: requiredNonNegativeInteger(value.usage.input_tokens, 'usage.input_tokens') }),
      ...(value.usage.output_tokens === undefined
        ? {}
        : { output_tokens: requiredNonNegativeInteger(value.usage.output_tokens, 'usage.output_tokens') }),
      decision_capacity: requiredNonNegativeInteger(value.usage.decision_capacity, 'usage.decision_capacity'),
    }),
    capacity: Object.freeze({
      kind: 'reflex_free',
      remaining: requiredNonNegativeInteger(value.capacity.remaining, 'capacity.remaining'),
      resets_at: requiredString(value.capacity.resets_at, 'capacity.resets_at'),
    }),
    receipt_id: requiredString(value.receipt_id, 'receipt_id'),
    trace_id: requiredString(value.trace_id, 'trace_id'),
  })
}

function parseEvidence(value: unknown): ReflexEvidence {
  if (!isRecord(value)) throw new BridaResponseError('Reflex evidence failed contract validation.')
  if (value.type === 'binary') {
    if (typeof value.value !== 'boolean') throw new BridaResponseError('Binary evidence value is invalid.')
    return Object.freeze({
      type: 'binary',
      value: value.value,
      confidence: requiredProbability(value.confidence, 'evidence.confidence'),
    })
  }
  if (value.type === 'choice') {
    return Object.freeze({
      type: 'choice',
      value: requiredString(value.value, 'evidence.value'),
      ...(value.confidence === undefined
        ? {}
        : { confidence: requiredProbability(value.confidence, 'evidence.confidence') }),
    })
  }
  if (value.type === 'score') {
    return Object.freeze({ type: 'score', value: requiredFiniteNumber(value.value, 'evidence.value') })
  }
  throw new BridaResponseError('Reflex evidence type is unsupported.')
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BridaResponseError(`The Brida response field ${field} is invalid.`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function requiredFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridaResponseError(`The Brida response field ${field} is invalid.`)
  }
  return value
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  const result = requiredFiniteNumber(value, field)
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new BridaResponseError(`The Brida response field ${field} is invalid.`)
  }
  return result
}

function requiredProbability(value: unknown, field: string): number {
  const result = requiredFiniteNumber(value, field)
  if (result < 0 || result > 1) {
    throw new BridaResponseError(`The Brida response field ${field} is invalid.`)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
