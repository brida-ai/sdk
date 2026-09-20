# Releasing @brida/sdk

Public releases use a reviewed release pull request and an immutable Git tag. Release automation never pushes a version bump directly to `main`.

## One-time bootstrap

The first npm publication is intentionally manual and tracked in issue #19. A Brida maintainer with npm 2FA publishes `@brida/sdk@0.1.0` from an exact clean `main` checkout after all public gates pass. No long-lived `NPM_TOKEN` is stored in GitHub.

After the package exists, bind npm Trusted Publishing to:

- organization: `brida-ai`;
- repository: `sdk`;
- workflow: `.github/workflows/publish.yml`.

Create the initial immutable `v0.1.0` Git tag on the exact source commit used for the manual npm publication. Do not use the automated release controller until this bootstrap and Trusted Publisher binding are complete.

## Normal release

1. Run **Prepare SDK release** and choose `patch`, `minor`, or `major`.
2. The controller computes the next version from the highest stable Git tag and opens `release/vX.Y.Z`.
3. Review that release PR normally. Required public CI, public-surface checks, CODEOWNERS review, and conversation resolution still apply.
4. Merge only after the review and QA evidence is complete.
5. **Finalize SDK release** checks out the exact reviewed merge commit, reruns `pnpm check` and `npm pack --dry-run`, verifies the release identity, creates or verifies the immutable tag, and creates the GitHub Release.
6. Publishing the GitHub Release invokes `publish.yml`, which publishes through npm Trusted Publishing/OIDC with provenance.

## Invariants

- Never move a release tag.
- Never publish from a feature branch or pull-request head.
- Never bypass public CI/review to prepare a routine release.
- Never use a long-lived npm token in GitHub Actions.
- The package version, release branch, tag and GitHub Release must identify the same version.
- A release retry must be idempotent: an existing tag is accepted only when it already names the exact reviewed release commit.

A genuine P0 security hotfix may use the owner-only emergency path defined by repository governance, but it still requires exact-SHA QA evidence and a follow-up review.
