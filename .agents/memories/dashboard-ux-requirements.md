---
title: Dashboard UX Requirements (recovered)
status: active
source: Codex session 019ee05e-933d-7bc2-a1eb-28545204b6aa (2026-06-19), interrupted
---

# Dashboard UX Requirements (recovered)

Durable capture of the design directives the user gave during the interrupted Codex
session `~/.codex/sessions/2026/06/19/rollout-2026-06-19T22-52-35-019ee05e-933d-7bc2-a1eb-28545204b6aa.jsonl`.
The session ended on "Make a plan to address all remaining items" before that plan was
produced. This file is the requirements freeze; the card subset has its own plan in
[repo-card-uniformization-plan.md](/home/dzack/gitclones/github-dashboard/.agents/memories/repo-card-uniformization-plan.md).

Most items below were turned into an end-to-end contract in
`tests/e2e/inbox-cache.spec.ts` (the "dashboard consolidation coverage" added in
`ddb0184`/`ac056af`) and implemented in `b02c4b1`. The test titles in that spec are the
canonical pass/fail oracle — run `just test` to get the current green/red state. Do not
restate per-item "done/not-done" here; that status lives in the test run, not in prose.

## Verbatim source directives

The substantive message (sent once, re-pasted once with a "repeating to ensure all
taken care of" suffix):

> "Remove topic from all repos" should just be a right-click context menu option. The "Create topics" instructions take up valuable app space, use hover menus for hints. The projects and repos sidebar need right-click context items to expand all/collapse all. "All Repos" and "Projects" in the sidebar additionally need right-click context menus that launch the repo dashboard and projects dashboard resp. The Inbox (and other issues views) need the ability to filter to specific issue tags. There are general navigation/usability issues: breadcrumbs are not always present and not always clickable. There's no way to quickly jump e.g. from an issue to its enclosing repo dashboard, or the project dashboard it's contained in, etc. Anything that references an issue being "Open" is redundant: the entire app is only for managing open issues and PRs, period. "Sync: Polled" seems to make no sense, you probably just want a "Last Updated: XXX" indicator. "Fuzzy match/character subsequence" is bizarre text to include for a standard search bar. There's a "Close Options Menu" option which is absolutely bizarre and nonstandard UI: escape or click-out is supposed to do that, always. There are many diverging design patterns scattered everywhere, indicating sprawl and reinvention. Clicking "Projects" on the main dashboar just takes you to the "All Repos" dashboard, not one that actually shows you a projects overview. There is inconsistent handling of what opens in a new tab vs hijacks an existing tab -- obviously you always want a new tab. "Assign to project" needs to just be standardized into a OSOT modal that everything else launches. I don't want to see my own github avatar/icon everywhere: these are ALL *my* projects, I know who I am. "Pull Request Branches" is bizarre phrasing, it's just "PRs". "Active Branches" is bizarre, it's just "Branches". The repo overview can consolidate everything onto one scrollable page instead of 3 separate tabs for issues/PRs/branches. Breadcrumbing is not consistent. In the "Repositories" dashboard, you probably want a button within the card to launch the individual repo's view in a new tab, not a whole-card click, because e.g. you might want to click the repo's project pill to jump to that project. This points to centralizing the project pills to a standard clickable that opens the project, and uniformizing the "repo card" which displays metadata and has options e.g. to open the repo's page, open it in github, etc, and have canonically be what's displayed in the "Repos" dashboard as well as in the right-click popup when you click it in the explorer. One should similarly uniformize what a project card looks like and how it navigates

Immediately followed by:

> Also, exclude archived projects from being indexed by the app entirely. And one also needs a toast + spinner while the app is initially loading repos

Earlier in the same session the user also specified (message #8): the Explorer's "updated"
time must reflect the repository's own last update (latest commit on any branch), not the
local sync time; public/private is irrelevant and should be dropped; the Explorer must
always sort newest-updated repos first; background-task toasts need a spinner.

## Enumerated requirements

### Repo / project cards (see the plan)

- R1. Uniformize a single canonical repo card showing metadata plus actions (open repo
  dashboard, open on GitHub, manage projects). The same card must render in the "Repos"
  dashboard **and** in the explorer right-click popup.
- R2. The repo card opens the repo view via an in-card **button**, not a whole-card
  click, so other targets inside the card (e.g. the project pill) stay clickable.
- R3. Centralize project pills into one standard clickable that opens the project.
- R4. Uniformize a single canonical project card (appearance and navigation).

### Navigation

- R5. Breadcrumbs present and clickable consistently across views.
- R6. Quick navigation up the hierarchy: from an issue/PR to its enclosing repo
  dashboard and to the project dashboard that contains it.
- R7. Always open in a new workspace tab; never hijack the current tab.
- R8. Clicking "Projects" on the main dashboard must open an actual projects overview,
  not the "All Repos" dashboard.

### Sidebar context menus

- R9. Sidebar (projects and repos trees) right-click → expand all / collapse all.
- R10. Sidebar "All Repos" and "Projects" right-click → launch the repo dashboard and
  projects dashboard respectively.
- R11. "Remove topic from all repos" is a right-click context-menu action, not a
  space-consuming button.

### Copy / chrome cleanup

- R12. Remove "Create topics" instructional block; move hints to hover.
- R13. Remove redundant "Open" labels (the app only manages open issues/PRs).
- R14. Replace "Sync: Polled" with a "Last Updated: XXX" indicator.
- R15. Remove "Fuzzy match / character subsequence" copy from the search bar.
- R16. Remove the "Close Options Menu" item; Escape and click-out close menus.
- R17. Rename "Pull Request Branches" → "PRs"; "Active Branches" → "Branches".
- R18. Remove the user's own GitHub avatar/icon everywhere.

### Inbox / filtering

- R19. Inbox and other issue views can filter to specific issue labels/tags.

### Repo overview

- R20. Consolidate the repo overview's issues/PRs/branches into one scrollable page
  instead of three separate tabs.

### Assignment

- R21. Standardize "Assign to project" into one OSOT modal that every entry point
  launches.

### Indexing / loading

- R22. Exclude archived repositories/projects from indexing entirely.
- R23. Show a toast + spinner while the app initially loads repositories, and on
  background-task toasts generally.

### Explorer ordering / metadata (message #8)

- R24. Explorer "updated" time = repository's latest commit across any branch, not local
  sync time.
- R25. Drop public/private visibility labels from the Explorer.
- R26. Explorer always sorts newest-updated repositories first.

## Recovery-time observations (verified by reading current code, not by test run)

- R22 has a shipped fix: `0d161f9` excludes archived repos from indexing.
- R24/R26 have shipped fixes: `d75a9e5` (update-recency) and `f0e83a3` (branch-head
  ordering); the spec encodes them at "repos endpoint exposes latest branch-head commit
  activity and sorts newest first" and "repository explorer cards use latest commit
  ordering and omit visibility labels".
- R1 is **partially** met: `RepoCard`/`ProjectCard`/`ProjectPill` exist in
  `src/components/WorkspacePrimitives.tsx` and are the canonical cards in the explorer
  grid, project-detail list, and projects overview. The unmet half is the right-click
  popup: `src/components/RepositoryExplorer.tsx:586-614` is a separate hand-rolled menu
  duplicating the card's actions instead of rendering the canonical card. This is the
  one card requirement with no e2e coverage and a confirmed gap — it is the subject of
  the plan.
