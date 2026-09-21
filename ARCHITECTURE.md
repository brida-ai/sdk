# Brida SDK architecture

## One SDK, product namespaces

`@brida/sdk` is the public TypeScript SDK for the Brida platform. A Brida product does not receive a separate base SDK by default.

The stable composition model is:

```ts
import { Brida } from '@brida/sdk'

const brida = new Brida({ apiKey })

await brida.reflex.run(...)
// future released products join as sibling namespaces on `brida`
```

The root client owns only cross-product client concerns. Each product namespace owns only the translation between its released public contract and that shared client substrate.

## Source layout

```text
src/
  client/
    Brida.ts          # root platform client
    transport.ts      # shared authenticated HTTP transport
    errors.ts         # shared normalized SDK errors
    idempotency.ts    # cross-product logical-operation helper
    types.ts          # product-neutral public types
  reflex/
    client.ts         # Reflex namespace
    types.ts          # Reflex public contract types
    validation.ts     # Reflex request/response contract validation
  index.ts            # public package facade only
```

When another Brida product is released, it adds a sibling directory such as `src/<product>/` and one property on `Brida`. It reuses the shared transport and error model rather than creating another credential, retry, tenancy, billing or policy authority.

## Dependency direction

```text
src/index.ts
    |
    v
client/Brida.ts ---> product namespace clients
    |                         |
    v                         v
shared transport        product contract validation
    |
    v
Brida public HTTP API
```

Product namespace code may depend on the shared client substrate. Shared client code must not depend on product business semantics.

## Public API rules

1. `src/index.ts` is the only root export facade.
2. The root constructor is `Brida`; do not create one root client class per product.
3. Product calls use namespaces (`brida.reflex.*`), not prefixed top-level methods.
4. Product types use product-qualified names when exported from the root package.
5. Shared transport/auth/error behavior is implemented once.
6. The SDK validates released public contracts but does not reimplement hosted business decisions.
7. Provider credentials, routing, tenant authority, billing authority and approval policy never enter the SDK.
8. A new product namespace must be additive unless a semver-major change is explicitly justified.
9. Public contract generation may later consume an allowlisted OpenAPI/JSON-Schema projection; private implementation trees are never mirrored into this repository.

## TypeScript naming and wire contracts

The SDK has two naming layers on purpose:

- SDK-owned options and helpers use idiomatic TypeScript camelCase (for example `maxStateBytes`, `idempotencyKey` and `traceId` on SDK error objects).
- Response fields that are part of a released Brida HTTP payload preserve their public wire names unless a product namespace explicitly defines a higher-level abstraction. This keeps SDK receipts/results directly comparable with REST responses and avoids duplicating a second drifting response schema inside the client.

Do not rename wire response fields merely for style. If a future product wants a more idiomatic domain object, expose that as an intentional typed abstraction with its own contract and tests rather than silently changing the transport projection.

## Repository boundary

This repository owns:

- TypeScript client source;
- public client types;
- transport/error/idempotency behavior;
- product namespace adapters;
- SDK-focused documentation and tests;
- package/release governance.

Product repositories own:

- recipes/templates;
- product Skills;
- use-case catalogs;
- product-specific fixtures;
- integration patterns and walkthroughs that are useful without reading SDK internals.

For Reflex, that product repository is [`brida-ai/reflex`](https://github.com/brida-ai/reflex).

A small inline snippet in this README is appropriate when it explains SDK syntax. A growing catalog of product examples is not; it belongs in the product repository and should be linked from here.

## Adding a product namespace

Before adding `brida.<product>`:

1. freeze and review the public HTTP contract;
2. define the namespace client and public types under `src/<product>/`;
3. reuse `BridaTransport` and shared error/idempotency primitives;
4. add exactly one root namespace property to `Brida`;
5. add fail-closed request/response validation where the contract requires it;
6. add package-level contract tests;
7. link to the product repository for substantial examples/templates/Skills;
8. verify the npm tarball and clean-consumer import surface;
9. do not add a separate npm SDK package merely because a new Brida product exists.

A separately versioned package is justified only when it is a genuinely independent local library or runtime contract, not as a duplicate client for the same Brida platform API.
