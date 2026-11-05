# Refactoring review — 2026-11-05

Applied kucherenko/jscpd's codebase-refactoring skill and its dry-refactoring companion. Installed those skills and the jscpd reference skill under `/Users/alex/.codex/skills/`.

## Scope and measurements

Used jscpd 5.4.2 with the same scan options before and after. Excluded dependencies, package lockfiles, test files, and Worker calibration/recovery data. Explicit entry points were frontend/app.js, workers/src/index.js, functions/**/*.js, and scripts/*.mjs. Scores are static analysis heuristics, not runtime performance measurements.

| Measurement | Before | After |
| --- | ---: | ---: |
| Health | 76/100 (B) | 77/100 (B) |
| Exact JavaScript clone pairs | 2 | 0 |
| Exact clone pairs, all formats | 6 | 4 |
| app.js lines | 579 | 502 |
| app.js complexity estimate | 302 | 262 |
| Total complexity estimate | 2032 | 2026 |
| Dead-code findings | 3 | 3 |

Most of the app.js complexity reduction comes from separating responsibilities; total branching declined only slightly. Complexity remains the largest maintenance opportunity.

Reproduce the dashboard from the repository root with `npx --yes jscpd@5.4.2 --dashboard --ignore '**/node_modules/**,**/package-lock.json,**/*.test.js,**/*.test.mjs,**/workers/data/**' --entry 'frontend/app.js' --entry 'workers/src/index.js' --entry 'functions/**/*.js' --entry 'scripts/*.mjs' .`. Replace `--dashboard` with `--dead-code --reporters ai` for dead-code findings, or `--reporters ai` for clone locations.

## Changes

- Separated location parsing and route metadata into frontend/lib/routes.js. Lookup tables replace nested title/navigation conditionals.
- Separated formatting, escaping, links, and shared visual markup into frontend/lib/presentation.js.
- Unified initial and expanded player achievement rendering so historical-unlock fallbacks have one implementation.
- Shared Durable Object operation-failure recording while preserving the existing commit, rollback, and exception handling boundaries.
- Added routing regression coverage for filters, all skills, legacy HTML entry points, decoded names, and invalid routes.

## Reviewed and retained

- frontend/config.js and frontend/theme.js are loaded by script tags in all three HTML entry points. The dead-code analyzer missed those references. The Pages packager also writes config.js.
- frontend/lib/gp.js has test-only consumers in workers/src/economy-model.test.js. Retained as an intentionally tested formatting utility; it is currently unused by production code.
- Remaining exact clones are HTML entry shells and release-workflow setup. Consolidating them would introduce build/workflow machinery for small amounts of declarative repetition.
- Conservative renamed-clone and near-miss scans found no additional actionable production-code abstractions.

## Validation

- npm test: 130 passed (122 Worker tests, 8 script/frontend tests).
- npm run check: all JavaScript syntax checks passed.
- git diff --check: passed.
- Compared 324 route, title, and navigation combinations against the original HEAD implementation: identical.
- Worker bundle: `npm --prefix workers exec -- wrangler deploy --config workers/wrangler.toml --dry-run --outdir /tmp/osrs-refactor-worker-build` passed, including frontend assets.

Changes remain local and uncommitted. No deployment or live-browser visual validation was performed.
