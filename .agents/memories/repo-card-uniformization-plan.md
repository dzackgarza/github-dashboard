---
title: Repo/Project Card Uniformization Plan
status: complete
source: dashboard-ux-requirements.md (R1-R4, R7)
---

# Repo/Project Card Uniformization Plan

Implements requirements R1-R4 and R7 from
[dashboard-ux-requirements.md](/home/dzack/gitclones/github-dashboard/.agents/memories/dashboard-ux-requirements.md).
This is the plan the interrupted Codex session never produced.

## Goal

- **Current state:** `RepoCard`, `ProjectCard`, and `ProjectPill`
  (`src/components/WorkspacePrimitives.tsx`) are the canonical cards and are already used
  in the explorer grid (`RepositoryExplorer.tsx:565`), the project-detail repo list
  (`:461`), the projects overview (`:396`), and pill sites (`:308`, primitives `:171`,
  `:388`). But the explorer **right-click popup** (`RepositoryExplorer.tsx:586-614`) is a
  separate hand-rolled `role="menu"` that re-implements the card's actions (Open Repo
  Dashboard / Manage Projects / GitHub) as its own list items. There are now two
  sources of truth for "what a repo's actions are."
- **Target state:** one canonical repo card is the single source of repo presentation
  and actions. The right-click popup renders that same `RepoCard` (positioned at the
  cursor); the hand-rolled menu is deleted. Same for the project card surfaces. Opening
  a repo/project always lands in a new workspace tab, never hijacks the current one.
- **Why it matters:** the divergent popup is exactly the "diverging design patterns /
  reinvention" the user called out; any future card change (new metadata, new action)
  silently skips the popup. Single-source removes that drift class.

## Constraints

- **Required:** all repo/project card rendering flows through the
  `WorkspacePrimitives.tsx` components. No second card implementation anywhere.
- **Forbidden (bespoke-software rules):** no fallback/legacy path kept "just in case";
  delete the old menu markup outright rather than gating it. No runtime defaults, no
  compatibility shims, no boolean mode flags. Fail loudly on missing required props.
- **Test integrity:** tests assert on rendered behavior and canonical testids, never on
  source structure. The existing consolidation contract in `tests/e2e/inbox-cache.spec.ts`
  is the oracle; update the popup-specific selectors there as part of this change.
- **Approval gate:** none required to implement once this plan is accepted; this is
  internal UI on a pre-launch single-user app.

## Prerequisites

- Dev server runs (`just dev`) and Playwright e2e can reach live GitHub via the
  `GITHUB_TOKEN` already centralized in `~/.envrc` (fixed in `61753f2`).
- Baseline test state captured (Phase 0). Do not start Phase 1 until the baseline is
  known, because most card requirements are already encoded as e2e tests and some may be
  red.

## Scope

- **Included:** the canonical repo card and project card; the explorer right-click popup;
  the project pill clickable; new-tab-vs-hijack semantics for repo/project opens.
- **Excluded (tracked in the requirements doc, not here):** sidebar context menus (R9-R11),
  breadcrumbs (R5-R6), copy/chrome cleanup (R12-R18), inbox label filtering (R19), repo
  overview tab consolidation (R20), assignment modal (R21), indexing/loading (R22-R23),
  explorer ordering/metadata (R24-R26). Several already have shipped fixes and tests.

## Phases

### Phase 0: Baseline (ground truth)

Goal: know the real red/green state before changing anything.

- **Location:** repo root.
- **Description:** run `just test`; record which `inbox-cache.spec.ts` tests pass/fail,
  especially "repo and project cards use the canonical assignment dialog without body
  navigation" (`:326`), "repository and project navigation uses canonical dashboard
  actions and standard copy" (`:291`), and "repo right-click menu can create a project
  containing that repo" (`:1301`).
- **Dependencies:** prerequisites met.
- **Acceptance:** a written baseline list of passing/failing tests committed alongside
  no code change.
- **Validation:** `just test` exit status and per-test report.
- **Stop rule:** if cards in the grid/overview are themselves red here, fix those before
  touching the popup — the popup change assumes a working `RepoCard`.

### Phase 1: Single-source the repo right-click popup

Goal: the popup renders the canonical `RepoCard`; the hand-rolled menu is gone.

- **Task 1.1 — Render `RepoCard` in the popup.**
  - Location: `src/components/RepositoryExplorer.tsx:586-614`.
  - What: replace the `role="menu"` block with a positioned container (fixed at
    `contextPos`) that renders `<RepoCard repo={contextRepo} ... />` with the **same**
    props passed to the grid card at `:565` (`onOpenRepo={openRepo}`,
    `onOpenProject={openProject}`, `onManageProjects=...`). Close on Escape and
    click-out (reuse the existing outside-click handler that clears `contextRepo`).
  - Dependencies: Phase 0; working `RepoCard`.
  - Acceptance: right-clicking a repo in the explorer shows the full card (metadata +
    project pills + Open repository dashboard / Manage projects / GitHub) at the cursor,
    visually identical to the grid card.
  - Validation: Playwright — right-click a `repo-card`, assert the popup contains a
    nested `repo-card` with the repo name, an `Open repository dashboard` button, the
    `GitHub` external link, and a clickable project pill.

- **Task 1.2 — Delete the hand-rolled menu.**
  - Location: `src/components/RepositoryExplorer.tsx` (old `:586-614` markup and any
    state used only by it).
  - What: remove the old menuitem markup entirely. Keep `contextRepo`/`contextPos` only
    if still used to position the card popup; otherwise remove.
  - Dependencies: Task 1.1.
  - Acceptance: no `role="menuitem"` repo-action list remains; `git grep "context-open-github"`
    returns only updated test references.
  - Validation: `npm run lint` (tsc) clean; no dead state warnings.

- **Task 1.3 — Update the popup e2e selectors.**
  - Location: `tests/e2e/inbox-cache.spec.ts` (test at `:1301` and any using
    `context-open-github` / `getByRole("menuitem", { name: "Manage Projects" })`).
  - What: retarget those steps at the card's testids/roles as rendered in the popup
    (the `RepoCard`'s `Manage projects` button and `GitHub` link), not the deleted menu.
    This is a behavior-preserving selector update, not a weakening — assertions still
    prove the popup opens the assignment dialog and the GitHub link points at
    `repo.html_url`.
  - Dependencies: Task 1.1, 1.2.
  - Acceptance: the right-click test passes against the card-based popup.
  - Validation: `npm run test:e2e` for that test.

### Phase 2: New-tab semantics (R7)

Goal: opening a repo/project from a card or popup always opens a new workspace tab.

- **Task 2.1 — Verify/fix `openTabs` does not hijack.**
  - Location: `src/context/WorkspaceContext.tsx` (`openTabs` definition, declared at
    `:27`) and its callers `openRepo`/`openProject`.
  - What: confirm opening a repo/project for which no tab exists creates a new tab and
    focuses it, and opening one that already exists focuses the existing tab rather than
    replacing the current tab's content. If it currently replaces the active tab, fix it.
  - Dependencies: none.
  - Acceptance: opening two different repos yields two tabs; the originating view is not
    replaced.
  - Validation: Playwright — open repo A then repo B from cards; assert both tabs exist
    and the explorer tab is intact.

### Phase 3: Project card uniformity (R4, R3)

Goal: confirm the project card and pill are single-source; close any divergence.

- **Task 3.1 — Audit project-card / pill render sites.**
  - Location: `RepositoryExplorer.tsx:396` (`ProjectCard`), `:308` and primitives
    `:171`/`:388` (`ProjectPill`); search the tree for any ad-hoc project tile/pill not
    using these primitives.
  - What: `git grep -nE "project.*(card|pill|tile)"` across `src/components`; any
    bespoke render becomes a `ProjectCard`/`ProjectPill` usage. If none exists, record
    that and skip — do not invent abstractions.
  - Dependencies: none.
  - Acceptance: every project card/pill in the UI is a `WorkspacePrimitives` component;
    or a recorded finding that this already holds.
  - Validation: `npm run test:e2e` test at `:291`/`:303`/`:304` stays green.

## Testing Strategy

The end-to-end contract in `tests/e2e/inbox-cache.spec.ts` is authoritative. This change
adds/updates real-browser assertions that the right-click popup renders the canonical
card and that its actions (assignment dialog, GitHub link, open-in-new-tab) behave like
the grid card. No unit-level card snapshot tests — the cards are presentation composed
from live data, proved through the running app. Run the full `just test` (lint +
vitest + Playwright) as the gate.

## Risks / Rollback

- **Risk:** positioning a full card at the cursor can overflow the viewport (the old
  menu was a fixed 224px-wide list). **Mitigation:** clamp `contextPos` to the viewport
  and cap the popup width to the grid card width; add a Playwright assertion that the
  popup is fully within the viewport.
- **Risk:** deleting the menu breaks selectors in other specs. **Mitigation:** Task 1.3
  greps all specs for the old testids before deleting.
- **Rollback:** all changes are additive commits on `main` (currently ahead 11 of
  origin). Revert is a forward `git revert <sha>` of the Phase 1 commit; no history
  rewrite, no destructive git ops.

## Stop Rules

- Do not proceed past Phase 0 if the grid/overview cards are themselves failing.
- Do not keep the old menu as a fallback or behind a flag — if Task 1.1 cannot render
  the card in the popup, stop and report; do not ship both.
- Do not weaken any existing assertion to make it pass; retarget selectors to equivalent
  behavior only.

## Execution Progress

### Prerequisites

- [x] <!-- status: complete --> Dev server + live GitHub token reachable
- [x] <!-- status: complete --> Baseline test state captured

### Phase 0: Baseline

- [x] <!-- status: complete --> Task 0: recorded red/green state. All card tests were already green; the only baseline red was a pre-existing, data-dependent flake in the single-item-endpoint navigation test (not a card defect), fixed in commit 07e856f.

### Phase 1: Single-source the popup

- [x] <!-- status: complete --> Task 1.1: render RepoCard in the right-click popup (commit 182620e)
- [x] <!-- status: complete --> Task 1.2: delete the hand-rolled menu (commit 182620e)
- [x] <!-- status: complete --> Task 1.3: added popup e2e coverage. Plan correction: test `:1301` right-clicks the SIDEBAR context menu (VSCodeSidebar), not the explorer grid popup, so no selector retarget was needed. The explorer grid popup had zero prior coverage, so a new test ("explorer right-click popup renders the canonical repo card clamped to the viewport") was added instead.

### Phase 2: New-tab semantics

- [x] <!-- status: complete --> Task 2.1: verified `openTabs` does not hijack. `App.tsx` `handleOpenTab` focuses an existing panel by id or adds a new one; unique tab ids per repo/project mean opening never replaces the current tab. Already satisfied; no code change.

### Phase 3: Project card uniformity

- [x] <!-- status: complete --> Task 3.1: audited project card/pill render sites. No ad-hoc project card/pill exists outside `WorkspacePrimitives`. Already single-source; no code change.

### System-Level Validation

- [x] <!-- status: complete --> `just test` green (lint + vitest + 19 Playwright e2e) at commit 182620e
- [x] <!-- status: complete --> Right-click popup renders the canonical card within the viewport (proved by the new e2e clamp assertion)

### Quality Gates

- [x] <!-- status: complete --> Completeness verified
- [x] <!-- status: complete --> Actionability verified
- [x] <!-- status: complete --> Design sensibility verified
- [x] <!-- status: complete --> Test quality verified
