# Releasing @brida/sdk

Public releases use a reviewed release pull request and an immutable Git tag. Release automation never pushes a version bump directly to `main`.

## One-time bootstrap

The first npm publication is intentionally manual and tracked in issue #19. A Brida maintainer with npm 2FA publishes `@brida/sdk@0.1.0` from an exact clean `main` checkout after all public gates pass. No long-lived `NPM_TOKEN` is stored in GitHub.

The bootstrap is an exact-artifact ceremony:

1. Record the approved source SHA and verify that it is the current protected `main`:

   ```bash
   SOURCE_SHA="$(git rev-parse HEAD)"
   test "$SOURCE_SHA" = "$(git rev-parse origin/main)"
   test -z "$(git status --short)"
   ```

2. Use the repository-pinned pnpm release and Node 24, install from the lockfile with lifecycle scripts disabled, and run the complete public gate:

   ```bash
   corepack pnpm install --frozen-lockfile --ignore-scripts
   corepack pnpm check
   ```

3. Inspect the package that npm would receive, then create the tarball exactly once:

   ```bash
   npm pack --dry-run
   TARBALL="$(npm pack --silent)"
   test -f "$TARBALL"
   sha256sum "$TARBALL"
   tar -tzf "$TARBALL"
   ```

   The tarball must contain only the intended public package files: `LICENSE`, `README.md`, `package.json`, and the built `dist/index.js`, source map, declaration and declaration map. Do not publish from the working directory after inspecting a different artifact.

4. Publish that exact inspected tarball using the maintainer's npm account and interactive 2FA:

   ```bash
   npm publish "./$TARBALL" --access public
   ```

5. Verify registry visibility and metadata before creating any release tag:

   ```bash
   test "$(npm view @brida/sdk@0.1.0 version)" = "0.1.0"
   npm view @brida/sdk@0.1.0 dist.integrity
   ```

6. Verify the public registry package from a fresh consumer project, not from the SDK checkout:

   ```bash
   CONSUMER_DIR="$(mktemp -d)"
   cd "$CONSUMER_DIR"
   npm init -y >/dev/null
   npm install @brida/sdk@0.1.0 --ignore-scripts
   node --input-type=module -e "import { BridaClient, createIdempotencyKey } from '@brida/sdk'; const client = new BridaClient({ apiKey: 'brida_test_key' }); if (typeof client.reflex.run !== 'function' || !createIdempotencyKey().startsWith('brida_')) process.exit(1)"
   ```

7. Only after the registry and clean-consumer checks pass, create the annotated `v0.1.0` tag on the exact `SOURCE_SHA` used to build the published tarball, push it once, and create the GitHub Release:

   ```bash
   git tag -a v0.1.0 "$SOURCE_SHA" -m "v0.1.0"
   test "$(git rev-parse 'v0.1.0^{commit}')" = "$SOURCE_SHA"
   git push origin refs/tags/v0.1.0
   gh release create v0.1.0 --verify-tag --generate-notes --title "@brida/sdk 0.1.0"
   ```

The repository protects `v*` tags from updates/deletion and has GitHub Immutable Releases enabled. Never create the initial tag before npm verification succeeds.

After the package exists, configure npm Trusted Publishing for:

- organization: `brida-ai`;
- repository: `sdk`;
- workflow: `.github/workflows/finalize-release.yml`.

That npm Trusted Publisher binding is the only browser-side bootstrap step. Do not add an npm automation token as a substitute. Do not use the automated release controller until the initial package, exact tag/GitHub Release and Trusted Publisher binding are all complete.

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
