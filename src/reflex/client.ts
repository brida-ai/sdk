import { createIdempotencyKey, validateIdempotencyKey } from '../client/idempotency.js'
import type { BridaTransport } from '../client/transport.js'
import type {
  CustomReflexVersionOptions,
  DraftCustomReflexOptions,
  ReflexDefinition,
  ReflexListResponse,
  ReflexRunResult,
  RunReflexOptions,
} from './types.js'
import {
  parseReflexDefinition,
  parseReflexList,
  parseReflexRun,
  validateClientRef,
  validateDeclarativePolicyInput,
  validateFixturesInput,
  validateJson,
  validateQuestionsInput,
  validateReflexId,
  validateReflexName,
  validateReflexVersion,
  validateVersionedReference,
} from './validation.js'

/** Reflex product namespace for the root Brida client. */
export class ReflexClient {
  readonly #transport: BridaTransport

  readonly custom: Readonly<{
    draft(options: DraftCustomReflexOptions): Promise<ReflexDefinition>
    activate(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
    retire(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
  }>

  constructor(transport: BridaTransport) {
    this.#transport = transport
    this.custom = Object.freeze({
      draft: (options: DraftCustomReflexOptions) => this.#draft(options),
      activate: (reflexId: string, version: string, options?: CustomReflexVersionOptions) => this.#changeVersion(
        'activate',
        reflexId,
        version,
        options,
      ),
      retire: (reflexId: string, version: string, options?: CustomReflexVersionOptions) => this.#changeVersion(
        'retire',
        reflexId,
        version,
        options,
      ),
    })
  }

  async list(): Promise<ReflexListResponse> {
    const body = await this.#transport.request('/v1/reflexes', { method: 'GET' })
    return parseReflexList(body)
  }

  async get(reflexId: string): Promise<ReflexDefinition> {
    const id = validateReflexId(reflexId)
    const body = await this.#transport.request(`/v1/reflexes/${encodeURIComponent(id)}`, { method: 'GET' })
    return parseReflexDefinition(body)
  }

  async run(reflexId: string, options: RunReflexOptions): Promise<ReflexRunResult> {
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

    const response = await this.#transport.request(
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

  async #draft(options: DraftCustomReflexOptions): Promise<ReflexDefinition> {
    const id = validateReflexId(options.id)
    const version = validateReflexVersion(options.version)
    const name = validateReflexName(options.name)
    if (!Number.isSafeInteger(options.maxStateBytes) || options.maxStateBytes < 1 || options.maxStateBytes > 262_144) {
      throw new TypeError('maxStateBytes must be an integer from 1 to 262144')
    }
    const questionSetVersion = validateVersionedReference(options.questionSetVersion, 'questionSetVersion')
    const policyVersion = validateVersionedReference(options.policyVersion, 'policyVersion')
    validateQuestionsInput(options.questions)
    validateDeclarativePolicyInput(options.declarativePolicy, options.questions)
    validateFixturesInput(options.fixtures, options.maxStateBytes, options.declarativePolicy)

    const body = await this.#transport.request('/v1/reflexes/custom', {
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

  async #changeVersion(
    action: 'activate' | 'retire',
    reflexId: string,
    version: string,
    options: CustomReflexVersionOptions = {},
  ): Promise<ReflexDefinition> {
    const id = validateReflexId(reflexId)
    const normalizedVersion = validateReflexVersion(version)
    const body = await this.#transport.request(
      `/v1/reflexes/${encodeURIComponent(id)}/versions/${encodeURIComponent(normalizedVersion)}/${action}`,
      {
        method: 'POST',
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    )
    return parseReflexDefinition(body)
  }
}
