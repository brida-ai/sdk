import { BridaResponseError } from '../client/errors.js'
import type { JsonValue } from '../client/types.js'
import type {
  CustomReflexFixture,
  ReflexDataClass,
  ReflexDeclarativePolicy,
  ReflexDefinition,
  ReflexEvidence,
  ReflexListResponse,
  ReflexQuestion,
  ReflexRunResult,
  ReflexVersionStatus,
} from './types.js'

function boundedToken(value: string, field: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError(`${field} must be a non-empty bounded token`)
  }
  return normalized
}

export function validateReflexName(value: string): string {
  return boundedToken(value, 'name', 120)
}

export function validateReflexId(value: string): string {
  const normalized = value.trim()
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(normalized) || normalized.length > 64) {
    throw new TypeError('reflexId is invalid')
  }
  return normalized
}

export function validateReflexVersion(value: string): string {
  const normalized = value.trim()
  if (!/^[1-9][0-9]{0,8}$/u.test(normalized)) throw new TypeError('version is invalid')
  return normalized
}

export function validateVersionedReference(value: string, field: string): string {
  const normalized = value.trim()
  if (!VERSIONED_REFERENCE.test(normalized)) throw new TypeError(`${field} is invalid`)
  return normalized
}

export function validateClientRef(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(normalized)) {
    throw new TypeError('metadata.clientRef is invalid')
  }
  return normalized
}

const QUESTION_ID = /^[a-z][A-Za-z0-9_]{0,63}$/u
const VERSIONED_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/u
const BRANCH = /^[a-z][a-z0-9_]{0,63}$/u
const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

export function validateQuestionsInput(value: Readonly<Record<string, ReflexQuestion>>): void {
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
    validateReflexDecisionInput(raw.instructions, `questions.${id}.instructions`)
    if (raw.type === 'binary') {
      if (raw.criteria !== undefined) {
        if (!isRecord(raw.criteria) || Object.keys(raw.criteria).some((key) => key !== 'true' && key !== 'false') || Object.keys(raw.criteria).length < 1) {
          throw new TypeError(`questions.${id}.criteria is invalid`)
        }
        for (const [key, item] of Object.entries(raw.criteria)) {
          if (item !== null) validateReflexDecisionInput(item, `questions.${id}.criteria.${key}`)
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
        if (item !== null) validateReflexDecisionInput(item, `questions.${id}.criteria.${choice}`)
      }
      continue
    }
    if (raw.type === 'score') {
      if (!Array.isArray(raw.criteria) || raw.criteria.length < 2 || raw.criteria.length > 32) {
        throw new TypeError(`questions.${id}.criteria must contain 2 to 32 score labels`)
      }
      raw.criteria.forEach((item, index) => {
        if (item !== null) validateReflexDecisionInput(item, `questions.${id}.criteria.${index}`)
      })
      continue
    }
    throw new TypeError(`questions.${id}.type is invalid`)
  }
}

function validateReflexDecisionInput(value: unknown, field: string): void {
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

export function validateDeclarativePolicyInput(
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

export function validateFixturesInput(
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

export function validateJson(value: unknown, field: string, seen = new WeakSet<object>(), depth = 0): void {
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

export function parseReflexList(value: unknown): ReflexListResponse {
  if (!isRecord(value) || value.object !== 'list' || !Array.isArray(value.data)) {
    throw new BridaResponseError('The Brida Reflex list response failed contract validation.')
  }
  return Object.freeze({
    object: 'list',
    data: Object.freeze(value.data.map(parseReflexDefinition)),
  })
}

export function parseReflexDefinition(value: unknown): ReflexDefinition {
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

export function parseReflexRun(value: unknown): ReflexRunResult {
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
