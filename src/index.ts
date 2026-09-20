export const BRIDA_API_URL = 'https://api.brida.ai' as const

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

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
      instructions: JsonValue
      criteria?: Readonly<{ true?: JsonValue | null; false?: JsonValue | null }>
    }>
  | Readonly<{
      type: 'choice'
      instructions: JsonValue
      criteria: Readonly<Record<string, JsonValue | null>>
    }>
  | Readonly<{
      type: 'score'
      instructions: JsonValue
      criteria: readonly (JsonValue | null)[]
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

  constructor(
    message: string,
    readonly idempotencyKey: string | undefined,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }

  readonly retryable = true
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
    const id = boundedIdentifier(reflexId, 'reflexId')
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
    const questionSetVersion = boundedToken(options.questionSetVersion, 'questionSetVersion', 128)
    const policyVersion = boundedToken(options.policyVersion, 'policyVersion', 128)
    validateJson(options.questions, 'questions')
    validateJson(options.declarativePolicy, 'declarativePolicy')
    validateJson(options.fixtures, 'fixtures')
    if (options.fixtures.length < 1 || options.fixtures.length > 32) {
      throw new TypeError('fixtures must contain 1 to 32 examples')
    }

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
    const id = boundedIdentifier(reflexId, 'reflexId')
    validateJson(options.state, 'state')
    const version = options.version === undefined
      ? undefined
      : boundedIdentifier(options.version, 'version')
    const clientRef = options.metadata?.clientRef === undefined
      ? undefined
      : boundedToken(options.metadata.clientRef, 'metadata.clientRef', 128)
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
      })
    } catch (cause) {
      throw new BridaNetworkError(
        'The Brida API request failed before receiving an HTTP response.',
        input.idempotencyKey,
        { cause },
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
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('baseUrl must use HTTP or HTTPS')
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

function validateIdempotencyKey(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/u.test(normalized)) {
    throw new TypeError('idempotencyKey is invalid')
  }
  return normalized
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
  return new BridaApiError(
    requiredString(value.error.message, 'error.message'),
    status,
    requiredString(value.error.code, 'error.code'),
    requiredString(value.error.type, 'error.type'),
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
  const versions = value.versions.map((item) => {
    if (!isRecord(item)) throw new BridaResponseError('A Brida Reflex version failed contract validation.')
    const questions = item.questions === undefined
      ? undefined
      : parseQuestions(item.questions)
    const declarativePolicy = item.declarative_policy === undefined
      ? undefined
      : parseDeclarativePolicy(item.declarative_policy)
    const fixtures = item.fixtures === undefined
      ? undefined
      : parseCustomFixtures(item.fixtures)
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
  const maxStateBytes = requiredNonNegativeInteger(value.input.max_state_bytes, 'input.max_state_bytes')
  if (maxStateBytes < 1) throw new BridaResponseError('input.max_state_bytes must be positive.')
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
  validateJson(value, 'questions')
  return Object.freeze({ ...value }) as Readonly<Record<string, ReflexQuestion>>
}

function parseDeclarativePolicy(value: unknown): ReflexDeclarativePolicy {
  if (!isRecord(value) || !['binary', 'choice', 'score'].includes(String(value.type))) {
    throw new BridaResponseError('Custom Reflex declarative policy failed contract validation.')
  }
  validateJson(value, 'declarative_policy')
  return Object.freeze({ ...value }) as unknown as ReflexDeclarativePolicy
}

function parseCustomFixtures(value: unknown): readonly CustomReflexFixture[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new BridaResponseError('Custom Reflex fixtures failed contract validation.')
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
