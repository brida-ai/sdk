# Brida SDK

Official TypeScript SDK for the Brida API.

> **Developer Preview:** the source repository is public. The npm package remains unpublished until the Reflex release gate is complete. Public contracts may expand, but released versions will not silently expose Brida's hosted provider routing, credentials, tenancy internals or policy implementation.

## Install

```bash
pnpm add @brida/sdk
```

The package is not published until the Developer Preview release gate is complete.

## API-key safety

Use `@brida/sdk` only from trusted server-side code. Never embed `BRIDA_API_KEY` in browser, mobile, desktop-client, or other untrusted bundles, and never write the key to logs or analytics.

## Reflex quickstart

```ts
import { BridaClient } from '@brida/sdk'

const brida = new BridaClient({
  apiKey: process.env.BRIDA_API_KEY!,
})

const result = await brida.reflex.run('agent-wakeup', {
  state: {
    source: 'github',
    event: 'check_run',
    conclusion: 'failure',
    summary: 'Required CI failed.',
  },
})

console.log(result.decision.branch)
console.log(result.decision.reason)
console.log(result.evidence)
```

The default API endpoint is `https://api.brida.ai`. Pass `baseUrl` only when targeting another Brida deployment or a local test server.

## Idempotency and retries

Every Reflex run is one logical operation identified by `Idempotency-Key`.

```ts
import { BridaClient, createIdempotencyKey } from '@brida/sdk'

const key = createIdempotencyKey()
const result = await brida.reflex.run('agent-wakeup', {
  idempotencyKey: key,
  state,
})
```

Reuse a key **only** when retrying the exact same Reflex request after an unknown outcome. The SDK does not automatically retry a run. If you omit the key, the SDK creates one for that call; API and transport errors expose `error.idempotencyKey` so the same request can be retried safely.

## Custom Reflex

Use a private Organization-scoped Custom Reflex when no official recipe matches a bounded semantic decision. Drafting does **not** activate it; activation is a separate explicit operation.

```ts
const draft = await brida.reflex.custom.draft({
  id: 'lead-fit',
  version: '1',
  name: 'Lead fit',
  maxStateBytes: 8192,
  questionSetVersion: 'lead-fit-questions@1',
  questions: {
    qualified: {
      type: 'binary',
      instructions: 'Is this lead a good fit for the stated ICP?',
    },
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
    state: { company: 'Synthetic Co', employeeCount: 25 },
    expectedBranch: 'qualified',
  }],
})

await brida.reflex.custom.activate(draft.id, '1')

const result = await brida.reflex.run('lead-fit', {
  state: { company: 'Example Co', employeeCount: 30 },
})
```

Custom Reflex definitions are declarative only: bounded questions, bounded branch policy, synthetic or redacted fixtures, explicit activation, and immutable active versions. They never grant tool or side-effect authority. During Free Preview use only non-sensitive state and never place credentials or reusable secrets in fixtures or run state.

## Data class

`brida.reflex.list()` and `brida.reflex.get()` expose each Reflex's input `data_class`. Do not send data outside the declared class. A Reflex marked `non_sensitive` is not an approved channel for sensitive personal or regulated data.

```ts
const reflex = await brida.reflex.get('agent-wakeup')
console.log(reflex.input.data_class)
```

## Errors

- `BridaApiError` — the API returned a normalized error response. Includes HTTP `status`, Brida `code`, `traceId`, `retryable` and the run `idempotencyKey` when relevant.
- `BridaNetworkError` — no HTTP response was received. Includes the run `idempotencyKey` when relevant.
- `BridaResponseError` — a successful response failed the SDK's public contract validation.

A retryable error is not permission to change the request, funding source or Reflex version. Preserve the same idempotency key only for the same logical request.

## Security boundary

The SDK is a client to Brida's public API. It never contains upstream model/provider credentials and does not reimplement hosted authorization, decision policy, metering or provider selection locally.

See `SECURITY.md`, `CONTRIBUTING.md` and `AGENTS.md` before contributing.

## License

Apache-2.0.
