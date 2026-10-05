# Test Plan: Wave results

## Created
2026-10-05 KST.

## Goal
Results are paged by wave, each wave exposes two-row statistics and expands all its member sessions. Preserve legacy sessions and existing detail URLs.

## Environment and preconditions
Windows, Node, bundled Playwright/Edge; official `npm run deploy -- studio`; reachable `http://127.0.0.1:43120`. Isolated browser contexts contain a completed history fixture; no inference or management mutations.

## Steps and expected results
1. Typecheck, tests, build, i18n check, diff whitespace check pass.
2. Deploy through the root entrypoint; verify published health, instance, and persistent database volume.
3. Open history deep URL with 21 numbered waves and one legacy group. Page1 contains20 waves and page2 containswave21 and legacy sessions.
4. Wave1 contains25 sessions; expanding displays all25 without member pagination. Wave2 shows only its2 sessions. Verify wave1 TTFT220/330/340ms, TPS31/11/11, elapsed2024ms.
5. Collapse, keyboard expand, switch pages and return; verify expansion state, legacy membership, and request detail URL/content.
6. Reload history; test query surface, empty results, 1535/768/390px layouts, and Arabic RTL. Domain tests also verify updated session states change the wave statistics. No page overflow or console/page errors.

## Logs to capture and locator contract
Deploy stdout, browser JSON and screenshots under `tests/reports/wave-results/`. Use `inference-wave-results`, stable `data-wave-index` groups, named toggle buttons with `aria-expanded`, `inference-wave-statistics`, scoped request IDs, named previous/next buttons, and `inference-wave-pagination`. Statistics have two rows of five cells. Table scroll is contained on narrow screens.
