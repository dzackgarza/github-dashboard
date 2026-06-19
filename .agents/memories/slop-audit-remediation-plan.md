---
title: Complete Slop Audit Remediation Plan
status: active
source: slop-audit.md
---

# Complete Slop Audit Remediation Plan

Replace [.agents/memories/slop-audit-remediation-plan.md](/home/dzack/gitclones/github-dashboard/.agents/memories/slop-audit-remediation-plan.md) with this complete plan before implementation. The goal is to remediate every `slop-audit.md` finding without relabeling, deleting evidence without burden transfer, adding fallbacks, or treating proof-free tests as proof.

Use official contracts already checked for this plan: GitHub list branches and get commit docs establish branch responses expose commit SHA/URL while commit details expose commit metadata; GitHub Dependabot, code scanning, and secret scanning docs establish the live security-alert APIs and permission constraints; Vitest docs support `test.environment = "jsdom"`; unified docs support parsing markdown through `unified().use(remarkParse).parse(...)`.

## Implementation Changes

1. Plan artifact update
- Replace the existing stored plan with this version.
- Commit only the plan file.
- Do not stage `.envrc` or any credential-bearing file.

2. QC runner and non-mocked unit proof
- Add `test:unit: "vitest run"` to `package.json`.
- Add `test: { environment: "jsdom" }` to `vite.config.ts` using Vitest’s Vite config support.
- Update `just test` to run `npm run lint`, `npm run test:unit`, and `npm run test:e2e`.
- Do not keep `PRDetailView.test.tsx` as proof; first add a real unit test for the new markdown excerpt helper so the unit suite remains proof-bearing after the mocked PR test is removed.

3. Replace mocked PR layout proof
- Delete `src/components/PRDetailView.test.tsx` only after adding Playwright coverage that opens a real PR detail view through the running app.
- Add an e2e test that discovers one open PR through the existing backend routes, fails loudly if no live PR fixture exists, opens that PR in the UI, verifies the real `react-resizable-panels` layout renders both main content and right sidebar, drags the real resize handle wider, and asserts the security/CI sidebar remains visible and non-overlapping.
- This transfers the original layout burden from mocked component props to the real browser/app boundary.

4. Direct server truth fixes
- In `server.ts`, update repo sync timestamps on every successful `/api/github/repos` 200 response.
- Replace branch date fabrication with live commit metadata: keep `/branches` for branch names and head SHAs, then fetch each head commit through `/repos/{owner}/{repo}/commits/{ref}` and set `commit.date` from the commit response’s committer date. If any commit metadata request fails, return a non-2xx response for the branch endpoint.
- Replace `sha-n/a` with an assertion that branch commit SHA exists.

5. Security alert contract
- Replace `security_alerts_count: 0` with a typed `security_alerts` object: `{ dependabotOpen, codeScanningOpen, secretScanningOpen, totalOpen }`.
- Fetch open Dependabot alerts from `/repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100`.
- Fetch open code scanning alerts from `/repos/{owner}/{repo}/code-scanning/alerts?state=open&per_page=100`.
- Fetch open secret scanning alerts from `/repos/{owner}/{repo}/secret-scanning/alerts?state=open&per_page=100`.
- If any security endpoint returns permission or availability failure, the PR details endpoint must fail loudly instead of rendering a false clean state.
- Update `src/types.ts` and `PRDetailView.tsx` to render typed counts; remove the local fallback `security_alerts_count: 0` and the “No GitHub security alerts reported” clean state unless live `totalOpen === 0`.

6. Narrow single-item loading
- Add `GET /api/github/repos/:owner/:repo/issues/:number` that proxies GitHub’s single issue endpoint, rejects PR-shaped issue responses, and returns one `Issue`.
- Add `GET /api/github/repos/:owner/:repo/prs/:number` that proxies GitHub’s single pull request endpoint and returns one `PullRequest` summary.
- Update `DockviewIssueWrapper` and `DockviewPRWrapper` to call the single-item endpoints on initial load and refresh.
- Remove list-fetch-and-find fallback paths entirely.

7. Shared utilities and constants
- Add a shared assertion utility under `src/` and import it from `WelcomeDashboard`; do not add branchy fallback handling.
- Add one shared project color palette and import it from `VSCodeSidebar` and `CommandPalette`.
- Add a markdown excerpt helper using declared dependencies `unified`, `remark-parse`, and `mdast-util-to-string`; use it for both issue and PR excerpts in `RepositoryExplorer`.
- Add a unit test proving markdown excerpt output on headings, emphasis, links, inline code, underscores, and truncation.

8. Remove timing sleep from e2e
- Replace the fixed `setTimeout(5_000)` route delay with a deterministic held-route promise.
- Let the test pause the live refresh request until after cached inbox UI assertions pass, then release the route and assert the live request completed.
- Preserve the real browser/server boundary; do not replace the backend with static responses.

9. Explicit runtime config
- Add required env values: `PORT`, `DATA_DIR`, `DB_FILE`, and `STATIC_DIST_DIR`.
- Validate them once at startup in `server.ts`; missing or invalid values must assert/fail before serving.
- Update `.env.example` with placeholder non-secret values.
- Remove hardcoded `3002`, `data`, `db.json`, and `dist` from runtime logic.
- Do not add runtime defaults or config precedence chains.

10. Strict TypeScript subplan
- First enable `strict`, `noImplicitAny`, and `strictNullChecks` in `tsconfig.json`.
- Then fix compile errors by replacing `any` at owned boundaries with explicit GitHub DTO types and total internal app types.
- Normalize required state at fetch/API boundaries; do not scatter optional checks through core UI logic.
- Remove `allowJs` unless a current tracked JS file requires it; if none exists, delete it.
- Do not add `as any`, broad `unknown as`, `@ts-ignore`, or owned-file excludes to make strictness pass.

## Test Plan

- Run `just test` after each coherent remediation batch.
- Add unit coverage for the markdown excerpt helper and any new config parser if one is extracted.
- Add Playwright coverage for real PR detail layout, cached inbox refresh without sleeps, single-item issue/PR loading, and security-alert rendering.
- Verify negative paths by real boundary behavior where possible: missing required config fails startup; security API permission failure prevents a clean alert badge; absent single issue/PR returns non-2xx rather than empty UI data.
- Final gate: re-read `slop-audit.md`, map every finding to the implementation/proof that now owns it, run `just test`, and confirm no finding was resolved only by comments, labels, deletion, or future-work text.

## Assumptions

- This is pre-launch bespoke software; breaking internal API/type shapes is acceptable.
- Live GitHub API access is required for proof. If the configured token lacks security-alert permissions, stop and fix credentials rather than mocking or suppressing those tests.
- Security telemetry means all live GitHub repository security alert classes surfaced by the dashboard: Dependabot, code scanning, and secret scanning.
- PR layout proof belongs in Playwright because the original defect concerns integrated rendered layout, not component prop plumbing.
- The final stored plan update is a repo mutation and must be done outside Plan Mode.
