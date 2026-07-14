<!-- generated-by: gsd-doc-writer -->

# Deployment and Releases

Agent Toolkit is a command-line package, not a hosted application. Its only deployment target is the public npm package [`@ranimontagna/agent-toolkit`](https://www.npmjs.com/package/@ranimontagna/agent-toolkit). A version tag pushed to GitHub starts the repository's [`Release` workflow](../.github/workflows/release.yml), which validates the tagged commit before attempting publication to npm.

## Deployment Target

- **Artifact:** the files selected by [`package.json`](../package.json), including the compiled `dist/` entrypoints and the public documentation, skills, lock data, and wrapper shipped with the package.
- **Registry:** the public npm registry, using the package's `publishConfig.access` setting and the workflow's explicit public-access publication flag.
- **Automation:** a tag-triggered GitHub Actions job. The repository does not define a container, application host, server deployment, or separate infrastructure rollout.

## Release Prerequisites and Environment Setup

Prepare releases from the repository root with Node.js 24 or newer, the pnpm version pinned by `packageManager`, Git push access to `main` and tags, and an `origin` remote for the canonical repository. The npm package must have GitHub Actions trusted publishing configured for the repository's release workflow; the workflow intentionally does not use a long-lived npm token.

Every commit included in a release must follow the repository's Conventional Commit rules. Before invoking the helper, confirm that:

1. `main` is checked out and the repository is clean, including staged, unstaged, and untracked files.
2. The next `vX.Y.Z` tag does not exist locally.
3. For the preferred `--push` flow, `main` tracks `origin/main`, local `main` is not behind the freshly fetched remote branch, and the next tag does not exist on `origin`.
4. The change set is ready for the full `pnpm run check` release gate.

The remote preflight permits local `main` to be ahead of `origin/main`; the atomic push publishes those commits together with the release tag. All helper preflights run before `package.json` or `README.md` is changed.

Choose the version increment according to the public compatibility change:

| Kind | Result |
|---|---|
| `patch` | Increment the patch component. |
| `minor` | Increment the minor component and reset patch to zero. |
| `major` | Increment the major component and reset minor and patch to zero. |

Review the complete [changelog](../CHANGELOG.md) before choosing the next increment so the release fits the existing history.

## Preferred Atomic Release

For a patch release, run:

```bash
rtk pnpm run release:patch -- --push
```

If RTK is not installed, omit only the `rtk` prefix. Use the corresponding helper for another semantic-version increment:

```bash
rtk pnpm run release:minor -- --push
rtk pnpm run release:major -- --push
```

The selected package script and [`src/release.ts`](../src/release.ts) perform this sequence:

1. Build the TypeScript project so the compiled release helper is current.
2. Derive the next version from `package.json` and run the local and `--push` remote preflights.
3. Write the new version to `package.json` and update matching literal Git-tag examples in `README.md`, if any are present.
4. Run `pnpm run check` against the prepared version.
5. Stage `package.json` and `README.md`, then create the Conventional Commit `chore: release X.Y.Z`.
6. Create the tag `vX.Y.Z` at that release commit.
7. Run `git push --atomic origin main vX.Y.Z`, so the branch and tag are accepted or rejected together.

Without `--push`, the helper creates the release commit and local tag but does not run the remote preflights or publish either ref. Prefer `--push` for the normal release path.

The helper also accepts `--no-check`. Use it only when the exact commit being released has already passed the complete `pnpm run check` gate and there is a specific reason not to repeat it. It skips the post-version-bump gate, so it is not a shortcut for a failing or untested release.

## Build and Publication Pipeline

The [`Release` workflow](../.github/workflows/release.yml) runs for every pushed tag matching `v*`. The job then:

1. Checks out the tagged commit with full Git history (`fetch-depth: 0`) and fetches `origin/main` explicitly.
2. Sets up Node.js 24, activates the pnpm version declared in `package.json`, and installs with `pnpm install --frozen-lockfile`.
3. Runs the full `pnpm run check` gate again in GitHub Actions.
4. Requires `GITHUB_REF_NAME` to equal `v` plus the version in the tagged `package.json`.
5. Requires the tagged commit to be an ancestor of `origin/main`.
6. Passes the package name and version from `package.json` to [`scripts/publish-npm-with-retry.sh`](../scripts/publish-npm-with-retry.sh).

The workflow grants only `contents: read` and `id-token: write`. The latter enables npm trusted publishing through GitHub's OIDC identity. No `NPM_TOKEN` or other long-lived registry credential is supplied. The publish helper executes:

```bash
npm publish --provenance --access public
```

`--provenance` attaches build provenance to the npm publication, while `--access public` makes the scoped package public.

## Publication Retries and Idempotence

The publish helper defaults to three publish attempts and a 30-second base delay. The workflow does not override those defaults.

- `PUBLISH_MAX_ATTEMPTS` must contain a positive decimal integer.
- `PUBLISH_RETRY_DELAY_SECONDS` must contain a nonnegative decimal integer.
- Both values are bounded at `2147483647`; invalid or overflowing values fail before any publication attempt.
- The delay uses linear backoff: after failed attempt `n`, the helper waits `n × PUBLISH_RETRY_DELAY_SECONDS`. With defaults, the waits are 30 seconds and then 60 seconds.

Before publishing, the helper runs `npm view` for the exact package version. If that version already exists, the run succeeds without another publish. After any failed `npm publish` response, it checks the registry again; finding the exact version converts an ambiguous response into success. Otherwise it retries until the attempt limit and returns the final publish failure status. This makes reruns safe for an already-published version without hiding a version that is still absent.

## Monitoring and Post-release Verification

There is no deployed service or persistent application-monitoring target. Release health is determined from the GitHub Actions result and the corresponding Git and npm records. After the workflow finishes, set the released version without the leading `v`:

```bash
VERSION="X.Y.Z"
```

Verify the remote tag and its ancestry on `main`:

```bash
git fetch --tags origin
git ls-remote --exit-code --tags origin "refs/tags/v${VERSION}"
git merge-base --is-ancestor "v${VERSION}^{commit}" origin/main
```

Verify that the matching workflow run completed successfully:

```bash
gh run list \
  --repo raniellimontagna/agent-toolkit \
  --workflow release.yml \
  --branch "v${VERSION}" \
  --limit 1 \
  --json status,conclusion,url
```

Verify the exact registry version and its provenance attestation:

```bash
test "$(npm view "@ranimontagna/agent-toolkit@${VERSION}" version)" = "${VERSION}"
npm view \
  "@ranimontagna/agent-toolkit@${VERSION}" \
  dist.attestations.provenance.predicateType
```

The provenance query should report `https://slsa.dev/provenance/v1`. Finally, run the registry artifact's help command from a directory outside the Agent Toolkit checkout so npm does not resolve the checkout as the package under test:

```bash
(
  SMOKE_DIR="$(mktemp -d)"
  trap 'rm -rf -- "${SMOKE_DIR}"' EXIT
  cd "${SMOKE_DIR}"
  npx -y "@ranimontagna/agent-toolkit@${VERSION}" --help
)
```

The command must print the Agent Toolkit usage text and exit successfully without starting an installation.

## Recovery and Rollback Procedure

The repository has no automated rollback job. Recover according to the point of failure while preserving published release history:

1. **A preflight fails:** correct the branch, working-tree, upstream, divergence, or tag conflict reported by the helper. Preflight rejection occurs before release-file writes.
2. **The local release gate fails:** inspect the failure, then restore the helper's version-file edits with `git restore package.json README.md`. Fix and verify the underlying issue before starting a new release attempt from a clean `main`.
3. **The atomic push fails:** inspect both remote refs. Because the helper uses an atomic push, retry `git push --atomic origin main vX.Y.Z` only after confirming that neither remote ref was accepted and the local release commit and tag are still correct.
4. **The workflow fails and npm does not contain the version:** a transient failure can be retried from the same tagged commit. If the fix changes tracked source, create a new release commit and version instead of moving or replacing the existing tag.
5. **npm already contains the version:** do not publish it again or rewrite its tag. Verify the package and provenance; the retry helper will treat the exact existing version as success. If the artifact itself is defective, fix forward with a new semantic version.

## Git Tags, npm Versions, and GitHub Releases

These records are related but distinct:

| Record | Role in this project |
|---|---|
| Git tag `vX.Y.Z` | Identifies the release commit and triggers the GitHub Actions workflow. A tag can exist even when publication fails or never occurs. |
| npm version `X.Y.Z` | The installable registry artifact created by the publish job after all gates pass. |
| GitHub Release object | An optional release page and asset container. The current project does not create these objects; neither the helper nor the workflow calls the GitHub Releases API. |

The project currently uses Git tags and npm publications, not GitHub Release objects. See the [changelog](../CHANGELOG.md) for the exact per-version distinction between npm-published releases and tag-only history.

## Implementation References

- [`src/release.ts`](../src/release.ts) — semantic-version changes, repository preflights, release-file updates, commit, tag, and atomic push.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — tag trigger, permissions, install and check gates, version and ancestry validation, and publish invocation.
- [`scripts/publish-npm-with-retry.sh`](../scripts/publish-npm-with-retry.sh) — publication flags, configuration validation, registry checks, retries, and backoff.
- [`tests/unit/release.test.ts`](../tests/unit/release.test.ts) and [`tests/publish-npm-with-retry.test.sh`](../tests/publish-npm-with-retry.test.sh) — regression proof for release safety and retry behavior.
- [`package.json`](../package.json) — package identity, files, runtime requirements, package-manager pin, scripts, and public publish configuration.
