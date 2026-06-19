---
title: Slop Audit Remediation Plan
status: active
source: slop-audit.md
---

# Slop Audit Remediation Plan

Acceptance condition: every finding in `slop-audit.md` is either remediated with the original burden transferred to real implementation/proof, or is explicitly paused at a user-approved sub-plan boundary.

Do not resolve any item by relabeling, deleting evidence, adding explanatory comments, or moving the finding into future-work language. If an artifact is removed, first identify the obligation it was trying to satisfy and prove where that obligation now lives.

## Policy Frame

Loaded policy sources for this plan:

- `policy-index`
- `anti-slop`
- `fixing-slop`
- `reviewing-llm-code`
- `reviewing-llm-code/references/bridge-burning-red-flags.md`
- `reviewing-llm-code/references/runtime-control-flow-red-flags.md`
- `test-guidelines`
- `test-guidelines/references/banned-test-shapes.md`

Primary constraints:

- No mocked, fake, smoke, or helper-only proof may satisfy a boundary obligation.
- Runtime code must not fabricate user-visible data.
- Required config must be explicit and validated once at startup.
- Shared constants and invariants must have one source of truth.
- Tests must prove repository-owned behavior through the real boundary they claim to cover.

## Work Order

Start with contained remediation that reduces future drift, then stop at each broad boundary before implementation.

- Checkpoint current state before each edit according to repo git policy.
- Commit each coherent remediation separately.
- Run `git diff` after every edit batch.
- Use the repo's declared commands through `just`.
- Do not commit `.envrc` or any credential-bearing file.

## Direct Remediation Items

These are low-blast-radius changes that can be implemented without a separate user sub-plan.

### Wire Unit Tests Into Standard QC

Finding: `[NO-GLOBAL-QC] Dead Unit Tests Excluded from Command Runner`

Files:

- `package.json`
- `justfile`
- `vite.config.ts`
- `src/components/PRDetailView.test.tsx`

Required action:

- Add a Vitest unit-test command to `package.json`.
- Configure Vitest with `jsdom` in `vite.config.ts`.
- Add the unit-test command to `just test`.
- Do not treat this as proving the existing `PRDetailView.test.tsx`; this only restores runner visibility.

Completion evidence:

- `just test` invokes lint, unit tests, and e2e tests through the declared runner.

### Update Sync Timestamps On Successful Fetch

Finding: `[USER-DECEPTIVE] Stale Sync Telemetry Timestamps in Sidebar`

File:

- `server.ts`

Required action:

- On successful repository fetch, update `syncTimestamps[r.full_name]` every time instead of only when the key is absent.

Completion evidence:

- A successful live repo refresh changes the server-side timestamp surfaced to the sidebar telemetry.

### Centralize The Invariant Helper

Finding: `[SPLIT-TRUTH] Scattered Custom Invariant Helper`

Files:

- `src/components/WelcomeDashboard.tsx`
- New or existing shared utility module under `src/`

Required action:

- Move the local `invariant` function into one shared utility module.
- Import it from call sites.
- Keep assertion-shaped control flow; do not replace it with branchy fallback handling.

Completion evidence:

- No component-local invariant helper remains for the same obligation.

### Centralize Project Colors

Finding: `[SPLIT-TRUTH] Scattered Hardcoded Project Color Palettes`

Files:

- `src/components/VSCodeSidebar.tsx`
- `src/components/CommandPalette.tsx`
- New or existing shared constants module under `src/`

Required action:

- Define the project color palette once.
- Import it from both UI surfaces.

Completion evidence:

- Changing the palette requires one source edit.

### Replace Markdown Regex Excerpts

Finding: `[REGEX-SEMANTIC] Markdown Formatting Stripped via Regex`

File:

- `src/components/RepositoryExplorer.tsx`

Required action:

- Replace the current markdown-stripping regex excerpt generation with a shared markdown-to-text preview helper.
- Prefer the existing markdown dependency stack if it gives a direct parser path.
- Keep the helper scoped to excerpt rendering; do not broaden into a markdown rendering rewrite.

Completion evidence:

- Issue and PR excerpts use the shared semantic helper.

### Remove Timing Sleep From E2E

Finding: `[TEST-SLEEP] Arbitrary Timing Sleep in E2E Test Route Interception`

File:

- `tests/e2e/inbox-cache.spec.ts`

Required action:

- Replace the fixed `setTimeout(resolve, 5_000)` with deterministic synchronization around the observable state the test owns.
- Preserve the test's real browser/server boundary.
- Do not introduce mocked network proof as a substitute.

Completion evidence:

- The test proves cached inbox rendering while refresh is in flight without arbitrary timing delay.

### Move Hardcoded Runtime Paths And Port To Required Config

Findings:

- `[HARDCODED-CONFIG] Hardcoded Server Port`
- `[HARDCODED-CONFIG] Hardcoded Database Storage and Build Output Paths`

Files:

- `server.ts`
- `.env.example`
- Possibly `README.md` if it is the canonical user-facing config surface

Required action:

- Read required config once at startup.
- Assert required values exist and are valid.
- Replace hardcoded `3002`, `data`, `db.json`, and `dist` runtime literals with validated config values.
- Do not add runtime defaults or environment fallback chains.

Completion evidence:

- Server startup fails loudly if required config is absent.
- Runtime behavior no longer embeds those paths/port as hidden code config.

Important precondition:

- `.envrc` currently contains credential material and must not be committed. Any config edit must avoid staging it.

## Stop And Sub-Plan Required

These items cross product boundaries, proof strategy, GitHub API semantics, or broad type cleanup. Stop before implementation and make a focused sub-plan with the user.

### Replace Mocked PR Detail Layout Proof

Finding: `[MOCK-STUB] Mock/Fake/Simulation Pollution in Test Suite`

File:

- `src/components/PRDetailView.test.tsx`

Stop condition:

- Stop before deleting or rewriting this test.

Sub-plan must decide:

- What user-visible behavior the test was trying to protect.
- Whether the correct proof belongs in Playwright, real component integration, or both.
- What real fixture or live boundary is admissible.
- Which assertions are proof-bearing under `test-guidelines`.

Invalid remediation:

- Renaming the test to smoke.
- Keeping `vi.mock`, fake `fetch`, fake `ResizeObserver`, or mock component props as proof.
- Deleting the file without transferring its layout proof burden.

### Replace Fake Branch Commit Dates

Finding: `[USER-DECEPTIVE] Server-Synthesized Faked Commit Dates`

File:

- `server.ts`

Stop condition:

- Stop before choosing the GitHub API strategy.

Sub-plan must decide:

- Which GitHub endpoint is the source of truth for branch commit timestamps.
- Whether the existing branch list response already contains sufficient commit metadata.
- How many API calls are acceptable for the dashboard behavior.
- What the server returns when GitHub lacks the required field or the token lacks access.

Invalid remediation:

- Keeping synthetic `Date.now()` offsets.
- Returning placeholder dates.
- Hiding missing telemetry behind UI copy.

### Replace Hardcoded Security Alert Count

Finding: `[USER-DECEPTIVE] Server-Synthesized Hardcoded Security Alert Counts`

File:

- `server.ts`

Stop condition:

- Stop before implementing a GitHub security-alert integration.

Sub-plan must decide:

- Which GitHub security/dependabot/code-scanning endpoint is authoritative for the displayed UI claim.
- Required token scopes and failure behavior.
- Whether the dashboard should display one count, several typed counts, or no badge until live data is available.
- How to prove the UI cannot show a false clean state.

Invalid remediation:

- Keeping `security_alerts_count: 0`.
- Replacing `0` with `null` while rendering success-shaped clean UI.
- Catching permission errors and displaying no alerts.

### Add Narrow Single-Item Issue And PR Loading

Finding: `[KNOWN-SOLUTION-BYPASS] Inefficient Whole-List Fetches for Single Items`

Files:

- `server.ts`
- `src/App.tsx`
- Possibly detail view components if their data contract changes

Stop condition:

- Stop before adding or changing endpoints.

Sub-plan must decide:

- Backend endpoint shape for one issue and one PR.
- Cache and ETag behavior for single-item fetches.
- Whether PR details should use the existing details endpoint or a narrower summary endpoint.
- How frontend loading should fail loudly instead of silently preserving empty detail state.

Invalid remediation:

- Adding single-item endpoints while keeping list-fetch fallback paths.
- Fetching the whole list in a new helper.
- Returning empty objects when the requested item is absent.

### Enable Strict TypeScript

Finding: `[TYPING-COLLAPSE] Relaxed TypeScript Checks Allowing Typing Decadence`

Files:

- `tsconfig.json`
- Likely broad client and server TypeScript surfaces

Stop condition:

- Stop before changing `tsconfig.json`.

Sub-plan must decide:

- Strictness flags to enable in the first pass.
- Whether to split server and client configs or keep one compiler surface.
- Order for replacing `any`, optional core state, and casts with boundary validation and total internal types.
- Commit strategy for red compile state vs green type-normalization batches.

Invalid remediation:

- Enabling strictness while adding `as any`, `unknown as`, `skip` comments, or broad suppressions.
- Excluding owned files from typechecking.
- Treating config-only strictness as complete while owned code still relies on type escapes.

## Final Gate

After all direct items and approved sub-plans are complete:

- Re-read `slop-audit.md`.
- For each finding, record where the burden now lives.
- Run the canonical repo test command through `just`.
- Confirm no remediation was only a label, comment, deletion, or future-work artifact.
