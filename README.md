# Brida SDK

Official TypeScript SDK for the Brida platform.

`@brida/sdk` is the single public SDK package for Brida. Product APIs are exposed as typed namespaces on one root client, so authentication, transport, errors, idempotency and future cross-product primitives stay consistent instead of being reimplemented by each product.

Reflex is the first released product namespace:

```ts
import { Brida } from '@brida/sdk'

const brida = new Brida({
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
```

Future released Brida products can add sibling namespaces without changing the base client or creating a second authentication, transport or policy stack.

> **Developer Preview:** the source repository is public and `@brida/sdk` is the canonical npm package under the npm organization `brida`. npm publication and hosted product activation are separate release gates. Released SDK versions never silently expose Brida's hosted provider routing, credentials, tenancy internals or policy implementation.

## Install

Requires Node.js 22 or newer. Public CI covers the current Node 22 and Node 24 LTS lines.

```bash
pnpm add @brida/sdk
```

Use the npm package only after the requested version is visible in the public registry. Do not treat unreleased source or ad-hoc tarballs as a published SDK version.

### Module format

`@brida/sdk` 0.1 is an **ESM package**. Use standard `import` syntax as shown in this README. The supported Node floor is Node 22.0.0 for ESM consumers. A synchronous CommonJS `require('@brida/sdk')` is not part of the 0.1 contract; CommonJS applications can use dynamic `import()` instead.

## Architecture

The SDK is intentionally thin:

```text
Brida
├── shared client
│   ├── authenticated transport
│   ├── normalized errors
│   └── idempotency helpers
└── product namespaces
    └── reflex
        ├── client
        ├── public types
        └── contract validation
```

The root package is the public integration surface. Product namespaces translate typed SDK calls to released Brida HTTP contracts; they do not contain hosted business policy, provider selection, billing authority or tenant authority.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the extension rules used when another Brida product joins the SDK.

## API-key safety

Use `@brida/sdk` only from trusted server-side code. Never embed `BRIDA_API_KEY` in browser, mobile, desktop-client, or other untrusted bundles, and never write the key to logs or analytics.

The default API endpoint is `https://api.brida.ai`. Pass `baseUrl` only when targeting another Brida deployment or a local test server. Credential-bearing remote endpoints must use HTTPS; plain HTTP is accepted only for loopback local development. The SDK also refuses HTTP redirects so an API key is never intentionally forwarded through a redirect chain.

## Reflex

Reflex is available through `brida.reflex`:

- `brida.reflex.list()`
- `brida.reflex.get(...)`
- `brida.reflex.run(...)`
- `brida.reflex.custom.draft(...)`
- `brida.reflex.custom.activate(...)`
- `brida.reflex.custom.retire(...)`

### Idempotency and retries

Every Reflex run is one logical operation identified by `Idempotency-Key`.

```ts
import { Brida, createIdempotencyKey } from '@brida/sdk'

const brida = new Brida({ apiKey: process.env.BRIDA_API_KEY! })
const key = createIdempotencyKey()

const result = await brida.reflex.run('agent-wakeup', {
  idempotencyKey: key,
  state,
})
```

Reuse a key **only** when retrying the exact same Reflex request after an unknown outcome. The SDK does not automatically retry a run. If you omit the key, the SDK creates one for that call; API and transport errors expose `error.idempotencyKey` so the same request can be retried safely.

### Custom Reflex

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
```

Custom Reflex definitions are declarative only: bounded questions, bounded branch policy, synthetic or redacted fixtures, explicit activation, and immutable active versions. They never grant tool or side-effect authority. Authoring requires a key with `reflex:write`; read/run authority alone is not enough. **Developer Preview self-service keys are intentionally issued with `reflex:read + reflex:run` only; `reflex:write` is a separately approved authoring capability.** If your key does not have `reflex:write`, you may prepare and validate a definition locally, but do not treat it as hosted or active. Activation evaluates the draft fixtures through the normal hosted Reflex pipeline and consumes bounded Decision Capacity; retrying the same activation reuses idempotent fixture evaluations instead of silently executing them twice. During Developer Preview, use only non-sensitive state and never place credentials or reusable secrets in fixtures or run state.

### Data class

`brida.reflex.list()` and `brida.reflex.get()` expose each Reflex's input `data_class`. Do not send data outside the declared class. A Reflex marked `non_sensitive` is not an approved channel for sensitive personal or regulated data.

```ts
const reflex = await brida.reflex.get('agent-wakeup')
console.log(reflex.input.data_class)
```

### Reflex recipes, templates, Skills and use cases

The canonical public home for Reflex product content is [`brida-ai/reflex`](https://github.com/brida-ai/reflex).

That repository owns Reflex recipes, fixtures, Custom Reflex examples, Skills, integration patterns and reusable use cases. This SDK repository intentionally does **not** duplicate that catalog. The snippets above document the SDK contract only.

## Errors

- `BridaApiError` — the API returned a normalized error response. Includes HTTP `status`, Brida `code`, `traceId`, `retryable` and the logical operation `idempotencyKey` when relevant.
- `BridaNetworkError` — no HTTP response was received. Includes the logical operation `idempotencyKey` when relevant.
- `BridaResponseError` — a successful response failed the SDK's public contract validation.

A retryable error is not permission to change the request, funding source or product version. Preserve the same idempotency key only for the same logical request.

## Security boundary

The SDK is a client to Brida's public API. It never contains upstream model/provider credentials and does not reimplement hosted authorization, business policy, metering or provider selection locally.

See `SECURITY.md`, `CONTRIBUTING.md`, `GUIDELINES.md` and `AGENTS.md` before contributing.

## License

Apache-2.0.
