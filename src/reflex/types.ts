import type { JsonValue } from '../client/types.js'

export type ReflexDecisionInput = string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

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
      instructions: ReflexDecisionInput
      criteria?: Readonly<{ true?: ReflexDecisionInput | null; false?: ReflexDecisionInput | null }>
    }>
  | Readonly<{
      type: 'choice'
      instructions: ReflexDecisionInput
      criteria: Readonly<Record<string, ReflexDecisionInput | null>>
    }>
  | Readonly<{
      type: 'score'
      instructions: ReflexDecisionInput
      criteria: readonly (ReflexDecisionInput | null)[]
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

/** Public shape of the Reflex product namespace exposed as `brida.reflex`. */
export interface ReflexNamespace {
  list(): Promise<ReflexListResponse>
  get(reflexId: string): Promise<ReflexDefinition>
  run(reflexId: string, options: RunReflexOptions): Promise<ReflexRunResult>
  readonly custom: Readonly<{
    draft(options: DraftCustomReflexOptions): Promise<ReflexDefinition>
    activate(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
    retire(reflexId: string, version: string, options?: CustomReflexVersionOptions): Promise<ReflexDefinition>
  }>
}
