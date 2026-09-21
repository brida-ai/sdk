import { BridaTransport } from './transport.js'
import type { BridaOptions } from './types.js'
import { ReflexClient } from '../reflex/client.js'
import type { ReflexNamespace } from '../reflex/types.js'

/** Root client for the Brida platform. Product APIs are exposed as namespaces. */
export class Brida {
  readonly reflex: ReflexNamespace

  constructor(options: BridaOptions) {
    const transport = new BridaTransport(options)
    this.reflex = new ReflexClient(transport)
    Object.freeze(this.reflex)
  }
}
