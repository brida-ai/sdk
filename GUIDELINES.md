# Guidelines

This repository is a deliberately public integration surface, not a mirror of Brida's private product or company repositories.

## Public-safe content
- released source intended for this repository;
- public schemas/contracts;
- synthetic fixtures needed to test the SDK contract;
- public SDK documentation;
- reviewed community contributions.

## Never publish
- secrets or customer/internal data;
- private strategy, specs, task graphs or roadmaps;
- provider contracts, credits, discounts or internal costs;
- private infrastructure/security details;
- unpublished benchmarks or eval corpora;
- private issue/PR links or internal-only identifiers.

## Repository boundary

`@brida/sdk` is one platform SDK with product namespaces. Shared client/auth/transport concerns live here. Product recipes, templates, Skills, integration patterns and use-case catalogs live in their public product repositories and are linked from the SDK rather than duplicated here.

Anyone may propose an issue or pull request. Only authorized Brida maintainers merge and release.

If a contribution needs private hosted changes, the public issue may describe the public behavior requested, but internal implementation planning stays private.
