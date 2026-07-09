# Changelog

## 0.1.25

- Environment overrides that change a source's identity (different npm package,
  GitHub repository, PyPI package or RTK release repository than the lock) now
  require `--allow-mutable-sources`, closing a silent redirection vector.
- `TOOLS_LOCK_PATH` now requires `--allow-mutable-sources`, since an alternate
  lock bypasses every pinned checksum and ref.
- `ANTIGRAVITY_INSTALL_SCRIPT` must be HTTPS (always) and any non-default URL
  requires the explicit override flag — the script is piped to bash.
- Fixed Windows support: npm/npx `.cmd` shims are now routed through `cmd.exe`
  with cross-spawn-style escaping (Node >= 18.20 refuses to spawn them
  directly), and RTK post-install verification runs the real `rtk.exe` instead
  of the bash shim.
- Added integration coverage for the full RTK download pipeline (release
  metadata, asset download, sha256 verification, install) against a local HTTP
  server, including checksum-mismatch rejection.

## 0.1.24

- Fixed `--uninstall --dry-run` deleting files instead of previewing the removal plan.
- Fixed runtime CLI version pinning matching by substring (`2.0.1` matched `2.0.10`).
- Runtime CLI install failures now propagate to the exit code instead of being swallowed.
- Verified that git-cloned pinned skills (Improve, frontend skills) match the pinned commit SHA after checkout.
- Refused HTTPS-to-HTTP downgrades when following download redirects.
- Published to npm with `--provenance` attestation.
- `--repair` now force-reinstalls RTK and Graphify instead of skipping them as "already installed".
- Listed Frontend Skills in the selected-tools output.
- Removed 31 unreferenced media assets (~33 MB), shrinking the npm package by roughly 80%.
- Declared the supported Node.js range in `package.json` (`engines`).

## 0.1.23

- Corrected RTK hook wiring (`rtk init --global --auto-patch`), guided EACCES npm failures, and warned on silently overridden flags.
- Installed and reported the React Doctor frontend skill.
- Generalized the frontend skills installer copy and stabilized related verification.

## 0.1.22

- Switched GSD to the official `@opengsd/gsd-core` package (old package deprecated).
- Fixed the integration test suite on macOS (BSD `sed`).
- Failed clearly when a skills target path exists as a file.

## 0.1.21

- Added the design-to-code skill (generation, verification, interaction/responsive rules) hardened through dogfood rounds.
- Adopted taste-skill analysis and anti-drift heuristics in design-to-code.

## 0.1.20

- Added the revenue-centric design skill.

## 0.1.19

- Updated toolkit pins and bundled skills.

## 0.1.18

- Added the thermonuclear review skill and toolkit operations commands.

## 0.1.17

- Added shadcn Improve installation from a pinned source.
- Added GSAP skills under the bundled frontend package.
- Updated external tool and runtime pins.
- Published through the trusted npm release workflow.

Earlier versions were developed before this changelog existed. Use Git history
and npm release metadata for older details.
