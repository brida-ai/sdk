# Releasing @brida/sdk

Public releases use a reviewed release pull request and an immutable Git tag. Release automation never pushes a version bump directly to `main`.

## One-time bootstrap

The first npm publication is intentionally manual and tracked in issue #19. A Brida maintainer with npm 2FA publishes `@brida/sdk@0.1.0` from an exact clean `main` checkout after all public gates pass. No long-lived `NPM_TOKEN` is stored in GitHub.

After the package exists, bind npm Trusted Publishing to:

- organization: `brida-ai`;
- repository: `sdk`;
- workflow: `.github/workflows/finalize-release.yml`.

Create the initial immutable `v0.1.0` Git tag on the exact source commit used for the manual npm publication. Do not use the automated release controller until this bootstrap and Trusted Publisher binding are complete.

## Normal release

1. Run **Prepare SDK release** and choose `patch`, `minor`, or `major`.
2. A read-only planning job computes the next version from immutable tag history and emits only the verified source SHA plus previous/next version identity. A separate `contents: write` job receives no dependency-install/test execution authority, checks that the source manifest still matches the previous release, changes only its `version` field with Node built-ins, and pushes `release/vX.Y.Z` from the exact verified `main` SHA.
3. A maintainer opens a normal pull request from that branch to `main`. This human PR creation is deliberate: GitHub suppresses recursive workflow events generated with `GITHUB_TOKEN`, so the controller does not create a PR that could miss normal `pull_request` CI.
4. Review that release PR normally. Required public CI, public-surface checks, CODEOWNERS review, and conversation resolution still apply.
5. Merge only after the review and QA evidence is complete.
6. **Finalize SDK release** uses privilege-separated jobs: a read-only verifier installs with dependency lifecycle scripts disabled, checks the exact reviewed merge commit and builds one tarball; a `contents: write` tag job creates/verifies the immutable source tag without running dependencies; a dedicated `contents: read` + `id-token: write` job verifies the tarball SHA-256 and publishes only that artifact through npm Trusted Publishing/OIDC with provenance; a final `contents: write` job creates the GitHub Release after npm visibility is confirmed.

## Invariants

- Never move a release tag.
- Never publish from a feature branch or pull-request head.
- Never bypass public CI/review to prepare a routine release.
- Never use a long-lived npm token in GitHub Actions. The npm OIDC job must not have repository write authority and must not execute repository dependency scripts.
- The package version, release branch, tag, npm package and GitHub Release must identify the same version.
- A release retry must be idempotent: an existing tag is accepted only when it already names the exact reviewed release commit.
- The npm Trusted Publisher is bound to the exact finalizer workflow that performs publication; publication does not depend on a second workflow being triggered by a `GITHUB_TOKEN`-created event.

A genuine P0 security hotfix may use the owner-only emergency path defined by repository governance, but it still requires exact-SHA QA evidence and a follow-up review.
