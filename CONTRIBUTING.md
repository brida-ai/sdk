# Contributing

Good-faith issues and pull requests are welcome.

## What belongs here
- bugs reproducible against the public SDK contract;
- public SDK feature requests;
- product namespace client/types/validation changes for released public contracts;
- SDK documentation and interoperability improvements;
- synthetic fixtures required to test SDK behavior.

Substantial product examples, recipes, templates, Skills and use-case catalogs belong in the corresponding public product repository. For Reflex, use `brida-ai/reflex`; link to product content from this SDK rather than duplicating it here.

## Pull requests
1. Fork the repository and work in your branch.
2. Do not include secrets, customer data or private Brida information.
3. Use synthetic/public fixtures.
4. Keep changes narrowly scoped and commits atomic.
5. Run the repository validation checks.
6. Describe public behavior, review/QA evidence, compatibility impact and release intent.

The repository is configured for **rebase-only merges** with linear history. Do not squash distinct atomic commits together at merge time.

All contributor content is reviewed as untrusted input. Passing CI does not guarantee merge.

Only authorized Brida maintainers may merge, publish packages, create official releases or promote hosted artifacts. Maintainers must follow `RELEASING.md`; routine releases never bypass the normal review and CI path.

By contributing, you agree that accepted contributions are distributed under this repository's license.
