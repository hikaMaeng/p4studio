# Test Plan: connection teardown

## Created / Goal
2026-10-05. Complete the existing FINISH fix so browser INSPECT cannot leave idle agent writers; preserve opaque transport and browser-owned event/request semantics.

## Environment / Preconditions
Base `eaa8b63`; isolated worktree including existing user FINISH edits in bridge, legacy inspection client and protocol helper. Current P4 binary explicitly supplied to fixture. No production DB, task registration, deployment, remote restart or model load. Reuse P4 register L065 (exact-PID CLOSE_WAIT), L234 (approved binary) and NB09-ENV-01 (fresh environment). Different-channel browser identity must be used; constant-channel probes mask accumulation.

## Steps / Expected Results
| ID | Actual boundary | Expected |
|---|---|---|
| CW-FRAME | Browser FINISH with fragmented ACK and queued nonzero frames | Wait for real zero frame, not payload zeros; idempotent close; pending exchange rejects unknown |
| CW-BOUND | No ACK; browser fake clock and real half-open TCP fallback fixture | Browser returns false after30s; server writes FINISH then resets after deadline, sockets close |
| CW-STOP | Real bridge/TCP; withhold ACK during detach | Studio waits retirement before shutdown completes; late old-socket callbacks do not alter new bridge |
| CW-MUT | Independent worktree, list exactly1, remove browser FINISH send | Actual missing-frame assertion fails after fresh transform |
| CW-BROWSER | Chromium source connection→real bridge→actual P4 process | 20 snapshots,20 FINISH ACKs; owned CLOSE_WAIT/ESTABLISHED0; cleanup listener0 |
| CW-SUITE | npm test/typecheck/build; compose parse with fixture port | Record all package counts/exits; no production refresh |

## Logs To Capture / Locator Contract
Role=button name="Inspect 20 connections" and role=status text="Completed 20 inspections; ACKs 20". Save URL, page errors, screenshot, agent log, PID census, binary/source hashes. Transport fixture is supplemental integration evidence, not deploy/model acceptance. [Report](../reports/connection-teardown/20261005_042300.md).
