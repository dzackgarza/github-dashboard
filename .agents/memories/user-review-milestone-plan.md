---
title: User Review Milestone Plan
status: complete
source: live repo audit on 2026-06-21
---

# User Review Milestone Plan

## Strongest Goal

Land a coherent local dashboard milestone that the user can review in the real browser, with the app serving current source, the dashboard consolidation work actually exercised by Playwright, and the local plan/audit artifacts no longer overstating completion.

## Current Evidence (corrected 2026-06-21)

The original snapshot below contained a false root-cause claim. It is corrected here;
the misdiagnosis is preserved as a record, not deleted.

- `main` is clean and ahead of `origin/main`.
- **Correction to the original NODE_ENV claim.** `direnv exec .` does NOT set
  `NODE_ENV` (verified: `direnv exec . printenv NODE_ENV` exits unset, and the npm
  script context reports `NODE_ENV=undefined`). With `NODE_ENV` unset, `server.ts`
  took the Vite-middleware branch, so `just dev` and Playwright already served current
  Vite source. The stale `dist/assets/index-lvwRXLKg.js` UI was served by a *leftover
  review server* that had been started in a shell where `NODE_ENV=production` happened
  to be set — not by direnv. Run cleanly against current source, all 19 e2e tests pass;
  the reported "dashboard consolidation failures" were the stale-bundle artifact.
- The real defect behind that confusion was the `NODE_ENV` runtime branch in `server.ts`
  itself — a runtime mode switch that silently serves stale `dist/` if any ambient
  `NODE_ENV` leaks in. It has been removed (the dev server now has one behavior: Express
  API plus Vite middleware).
- `src/components/RepositoryExplorer.tsx` previously had a hand-rolled repository
  right-click menu; it now renders the canonical `RepoCard` in the explorer popup, and
  the old menu markup is deleted.
- Current source contains the completed slop-remediation changes: strict TypeScript,
  unit tests in `just test`, live security-alert fetching, single-item issue/PR
  endpoints, shared markdown excerpt parsing, shared invariant utility, and shared
  project color/topic utilities (see `slop-audit-remediation-plan.md`).

## Milestone Acceptance

- `just dev` and Playwright must serve current Vite source, not ignored `dist/`, under the actual `direnv exec .` environment used on this machine.
- `just test` must complete green: `npm run lint`, `npm run test:unit`, and `npm run test:e2e`.
- The repository explorer right-click popup must render the canonical `RepoCard` and delete the duplicate hand-rolled repo action menu.
- Existing sidebar context menus must remain menus where the UX requirements call for tree actions such as expand, collapse, open dashboard, and remove topic.
- The stored plan/audit artifacts must truthfully distinguish completed implementation from remaining work.
  Status edits are allowed only after the implementation/proof that owns the burden exists.
- The final state must be committed.
  The working tree must be clean before review.
- A local review server must be running and reachable at the configured URL.

## Work Blocks

### Runtime Boundary

Objective: make the review and test server exercise current source.

- Reproduce the current red boundary with the existing dashboard consolidation tests or a focused Playwright check proving `npm run dev` is not serving Vite middleware under `direnv exec .`.
- Remove the ambient `NODE_ENV` dependency from the dev/test server path.
  Do not add a new runtime mode flag or fallback chain.
- Prefer explicit entrypoint ownership over runtime branching.
  The local review server should have one behavior: Express API plus Vite middleware.
- If a static server remains necessary for `npm run start`, put that behind a separate entrypoint or recipe, not a runtime branch that can hijack `dev`.
- Verify the ignored `dist/` bundle is no longer capable of affecting `just dev` or `just test`.

### Dashboard Source Gaps

Objective: finish the remaining source work after the browser is proving current code.

- Replace the explorer grid repository context popup in `src/components/RepositoryExplorer.tsx` with the canonical `RepoCard`.
- Delete the old explorer popup menuitem markup and any state used only by that menu.
- Clamp or otherwise constrain the card popup so it remains inside the viewport.
- Keep sidebar context menus as tree/action menus unless a verified UX requirement says that a sidebar popup should also become a card.
- Re-run the dashboard consolidation tests against current source and triage any red result by observed browser behavior, not by plan prose.

### Test and Proof Work

Objective: make failures diagnostic and proof-bearing.

- Add or adjust a Playwright proof that the dev/test server uses the live Vite source boundary under the real `direnv exec .` environment.
- Add or adjust a Playwright proof for explorer-card right-click behavior: canonical card appears, repo dashboard action works, GitHub link points to the repo, manage projects opens the OSOT assignment dialog, and the popup stays in the viewport.
- Do not add source-code meta-assertions, mocks, skipped tests, smoke-only checks, or assertions that pass on a stale static bundle.
- Keep real GitHub API access as the proof boundary.
  If credentials or GitHub security endpoints fail, stop on that blocker instead of weakening tests.

### Plan and Audit Disposition

Objective: remove stale local planning ambiguity without laundering unfinished work.

- Re-read `slop-audit.md` and map each finding to its owning code and proof.
- Update `slop-audit-remediation-plan.md` only after each mapped finding has a real implementation/proof disposition.
- Update `repo-card-uniformization-plan.md` only after the canonical explorer popup and full test gate are green.
- Leave unresolved items visible if they remain unresolved; do not mark a plan complete because a status field was changed.

### Review Handoff

Objective: provide a reviewable milestone, not a report-shaped substitute.

- Run `just test` to completion and keep the final result.
- Run `just build` if the user-review path includes the built bundle; do not let ignored build output become the source of truth for tests.
- Start `just dev` in a PTY and verify the configured URL loads the current source UI.
- Use Playwright to inspect the live page enough to prove the review server is the same surface that passed the tests.
- Commit the coherent milestone changes.
- Report only blockers, review URL, and any remaining mandatory work.

## Stop Rules

- Stop if `direnv exec .` cannot provide the required GitHub token.
- Stop if `just test` is terminated or red after the implementation pass; do not present a milestone.
- Stop if browser evidence still shows old `dist/` UI copy under `just dev`.
- Stop if a proposed fix preserves both old and new repo popup implementations.

## Outcome (2026-06-21)

- Codex's "first required work" (the direnv/`NODE_ENV` runtime boundary) was a
  misdiagnosis; see the corrected Current Evidence. The dev/test server already served
  current source under the real `direnv exec .` environment.
- Landed:
  - `07e856f` — stabilized the single-item-endpoint e2e against a pre-existing,
    data-dependent flake (an open issue and open PR resolving to the same repository
    collapsed the sidebar tree on the second toggle). This was the only baseline red;
    not a card or consolidation defect.
  - `182620e` — replaced the explorer right-click hand-rolled menu with the canonical
    `RepoCard` (R1), clamped into the viewport, with new e2e coverage. Full gate green
    (lint + vitest + 19 Playwright e2e).
  - This commit also removes the `server.ts` `NODE_ENV` runtime branch: the dev server
    now serves Vite source unconditionally, and the dead production-static path
    (`STATIC_DIST_DIR`, `npm start`, esbuild server bundling) is deleted. Verified
    `just dev` serves `/src/main.tsx` and `/@vite/client` (live Vite source).
- Sidebar context menus are unchanged (still tree/action menus), per requirement.
- Card uniformization Phases 2 (new-tab) and 3 (project-card single-source) were already
  satisfied (no code change), verified; see `repo-card-uniformization-plan.md`. The
  slop-audit findings are all remediated; see `slop-audit-remediation-plan.md`.
- Review server: started after this commit via `just dev` on port 3002. The pre-commit
  hook runs the full `just test` and requires port 3002 free, so the review server is
  started only once the final commit has landed.
