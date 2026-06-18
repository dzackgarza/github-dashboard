# Architectural Slop Audit Report

> [!WARNING]
> **REWARD-HACKING WARNING:** The findings below represent structural maintainability and design defects. Appending trivial fixes or labeling test files as "smoke" without resolving the underlying architectural issues does not constitute progress.

---

## 1. Blocking / Damaging Agent-Actionable Defects

### [NO-GLOBAL-QC] Dead Unit Tests Excluded from Command Runner
* **File**: `package.json` ([package.json](file:///home/dzack/gitclones/github-dashboard/package.json))
* **File**: `justfile` ([justfile](file:///home/dzack/gitclones/github-dashboard/justfile))
* **File**: `vite.config.ts` ([vite.config.ts](file:///home/dzack/gitclones/github-dashboard/vite.config.ts))
* **Pattern**: `[NO-GLOBAL-QC]` / `[PROOF-LOOP-INVERSION]`
* **Tell**: The unit test suite `src/components/PRDetailView.test.tsx` exists but is completely omitted from `package.json` scripts and the `justfile` `test` target. Furthermore, `vite.config.ts` lacks any test configuration block (specifically JSDOM environment), causing unit tests to fail with `ReferenceError: document is not defined` if run without custom flags.
* **Impact**: Future agents editing code will pass the standard `just test` runner without running component-level unit assertions. The tests are dead weight in the codebase.

### [MOCK-STUB] Mock/Fake/Simulation Pollution in Test Suite
* **File**: `src/components/PRDetailView.test.tsx` ([PRDetailView.test.tsx](file:///home/dzack/gitclones/github-dashboard/src/components/PRDetailView.test.tsx))
* **Pattern**: `[MOCK-STUB]` / `[DEVELOPER-CONTROLLED]`
* **Tell**: Extensive use of `vi.mock("react-resizable-panels")`, `global.fetch = vi.fn()`, and `global.ResizeObserver = class { ... }`.
* **Impact**: The test suite asserts layout constraints against simulated/mocked component structures rather than verifying the real integrated layout. It silences real rendering failures while ensuring compliance with developer-defined assertions.

---

## 2. Secondary Agent-Actionable Cleanup

### [USER-DECEPTIVE] Server-Synthesized Faked Commit Dates
* **File**: `server.ts` ([server.ts:L370-380](file:///home/dzack/gitclones/github-dashboard/server.ts#L370-L380))
* **Pattern**: `[USER-DECEPTIVE]` / `[FALLBACKS-HEDGING]`
* **Tell**: 
  ```ts
  const enriched = data.map((b: any, index: number) => {
    const offsetHours = index * 4 + 1;
    return {
      name: b.name,
      commit: {
        sha: b.commit?.sha?.substring(0, 8) || "sha-n/a",
        date: new Date(Date.now() - offsetHours * 3600000).toISOString()
      }
    };
  });
  ```
* **Impact**: The server mocks commit dates relative to `Date.now()` to avoid extra GitHub API requests. The frontend UI displays these faked times ("Pushed X hours ago") as real, deceiving the maintainer into believing they are looking at live push telemetry.

### [REGEX-SEMANTIC] Markdown Formatting Stripped via Regex
* **File**: `src/components/RepositoryExplorer.tsx` ([RepositoryExplorer.tsx:L527,L591](file:///home/dzack/gitclones/github-dashboard/src/components/RepositoryExplorer.tsx#L527))
* **Pattern**: `[REGEX-SEMANTIC]` / `[REGEX-REFLEX]`
* **Tell**: `issue.body.replace(/[#*`_-]/g, "").slice(0, 140)`
* **Impact**: Raw markdown is stripped using a primitive regex rather than utilizing a markdown parser or AST representation. This is brittle, susceptible to formatting changes, and fails to handle formatting symbols correctly.

### [KNOWN-SOLUTION-BYPASS] Inefficient Whole-List Fetches for Single Items
* **File**: `src/App.tsx` ([App.tsx:L37-46,L99-111](file:///home/dzack/gitclones/github-dashboard/src/App.tsx#L37-L46))
* **Pattern**: `[KNOWN-SOLUTION-BYPASS]` / `[COMPLEXITY-SIGNAL]`
* **Tell**: In `DockviewIssueWrapper` and `DockviewPRWrapper`, the app fetches the entire list of issues/PRs for a repo, then does a `.find((p) => p.number === params.number)` to display a single item's details.
* **Impact**: High network overhead and rate limit consumption, bypassing narrow details endpoints.

### [SPLIT-TRUTH] Scattered Custom Invariant Helper
* **File**: `src/components/WelcomeDashboard.tsx` ([WelcomeDashboard.tsx:L34-38](file:///home/dzack/gitclones/github-dashboard/src/components/WelcomeDashboard.tsx#L34-L38))
* **Pattern**: `[SPLIT-TRUTH]`
* **Tell**: A custom `invariant` assertion function is defined locally in the welcome dashboard component instead of using a shared utility module.

### [TEST-SLEEP] Arbitrary Timing Sleep in E2E Test Route Interception
* **File**: `tests/e2e/inbox-cache.spec.ts` ([inbox-cache.spec.ts:L54](file:///home/dzack/gitclones/github-dashboard/tests/e2e/inbox-cache.spec.ts#L54))
* **Pattern**: `[TEST-SLEEP]` / `[TIMING-COINCIDENCE]`
* **Tell**: An arbitrary `setTimeout(resolve, 5_000)` delay is hard-coded in the mock route handler for `issues`/`prs` requests during inbox caching E2E tests.
* **Impact**: Relies on timing coincidence to assert intermediate caching state, creating potential test flakiness and introducing a 30-second execution bottleneck to the E2E test suite.

### [USER-DECEPTIVE] Server-Synthesized Hardcoded Security Alert Counts
* **File**: `server.ts` ([server.ts:L525](file:///home/dzack/gitclones/github-dashboard/server.ts#L525))
* **Pattern**: `[USER-DECEPTIVE]` / `[FALLBACKS-HEDGING]`
* **Tell**: The server hardcodes `security_alerts_count: 0` inside the pull request details endpoint.
* **Impact**: Always displays a clean security telemetry badge ("No GitHub security alerts reported") to the user in the right sidebar of the PR detail view, even if the repository contains critical Dependabot vulnerabilities. This is a direct user-facing deception.

### [SPLIT-TRUTH] Scattered Hardcoded Project Color Palettes
* **File**: `src/components/VSCodeSidebar.tsx` ([VSCodeSidebar.tsx:L21](file:///home/dzack/gitclones/github-dashboard/src/components/VSCodeSidebar.tsx#L21))
* **File**: `src/components/CommandPalette.tsx` ([CommandPalette.tsx:L95](file:///home/dzack/gitclones/github-dashboard/src/components/CommandPalette.tsx#L95))
* **Pattern**: `[SPLIT-TRUTH]` / `[OSOT-BYPASS]`
* **Tell**: The hex color list used for project tag generation is duplicated across both files.
* **Impact**: If a future agent or developer decides to modify the project category color choices, they must edit both files in sync, leading to potential formatting discrepancies.

### [HARDCODED-CONFIG] Hardcoded Server Port
* **File**: `server.ts` ([server.ts:L13](file:///home/dzack/gitclones/github-dashboard/server.ts#L13))
* **Pattern**: `[HARDCODED-CONFIG]`
* **Tell**: `const PORT = 3002;` is declared statically on the Express server.
* **Impact**: Restricts app boot on other host environments or ports without code mutations, bypassing environmental options like `process.env.PORT`.

### [TYPING-COLLAPSE] Relaxed TypeScript Checks Allowing Typing Decadence
* **File**: `tsconfig.json` ([tsconfig.json](file:///home/dzack/gitclones/github-dashboard/tsconfig.json))
* **Pattern**: `[TYPING-COLLAPSE]` / `[LOOSE-SCHEMA]`
* **Tell**: `tsconfig.json` lacks any strict compilation properties (`"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`), allowing raw untyped objects and implicit `any` parameter casts to compile without errors.
* **Impact**: Encourages type-safety bypasses (widespread use of `any` references across components and server scopes), which defeats compile-time verification and leaves the app vulnerable to undefined runtime failures.

### [HARDCODED-CONFIG] Hardcoded Database Storage and Build Output Paths
* **File**: `server.ts` ([server.ts:L17-18](file:///home/dzack/gitclones/github-dashboard/server.ts#L17-L18))
* **Pattern**: `[HARDCODED-CONFIG]` / `[ENVIRONMENT-BYPASS]`
* **Tell**: The data directory name `data`, the persistence database file name `db.json`, and the static build output path `dist` are hardcoded in the server using `process.cwd()` constants.
* **Impact**: Restricts database path configuration or volume mounts on containerized environments, forcing files to be stored within the process workspace directory structure and bypassing variable overrides.

---

### [USER-DECEPTIVE] Stale Sync Telemetry Timestamps in Sidebar
* **File**: `server.ts` ([server.ts:L212-216](file:///home/dzack/gitclones/github-dashboard/server.ts#L212-L216))
* **Pattern**: `[USER-DECEPTIVE]` / `[FALLBACKS-HEDGING]`
* **Tell**: The server only records the `syncTimestamps` for a repository if the key does not already exist (`if (!syncTimestamps[r.full_name])`).
* **Impact**: Subsequent successful cache refreshes (status 200) from GitHub do not update the sync timestamps in the sidebar telemetry tab. The UI presents stale synchronization times as "just now" or "X minutes ago" relative to the server's boot time rather than the last actual API fetch.

---

SLOP-REPORT-COMPLIANCE: I hereby assert that the above report is formatted in compliance with all slop report requirements.
