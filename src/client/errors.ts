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
