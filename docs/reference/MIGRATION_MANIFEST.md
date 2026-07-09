# DSV Reference Migration Manifest

Created: 2026-07-09 15:02:00 KST

## Source

- /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/07_DSV

## Destination

- /Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/dsv-web

## Copied

- `reference/` -> `docs/reference/original-reference/`
- `dsv-demo/index.html` -> `docs/reference/demo-reference/index.html`
- `dsv-demo/assets/` -> `docs/reference/demo-reference/assets/`
- `dsv-demo/tests/` -> `docs/reference/demo-reference/tests/`
- `dsv-demo/scripts/` -> `docs/reference/demo-reference/scripts/`
- `dsv-demo/README.md`, package metadata, Playwright config -> `docs/reference/demo-reference/`
- matching OMX planning artifacts -> `docs/reference/plans/`

## Not copied

- `.git`
- `.github`
- `node_modules`
- `playwright-report`
- `test-results`

## Rule

This repo is the DSV web frontend source of truth. The copied HTML demo is a golden visual/reference artifact, not production source.
