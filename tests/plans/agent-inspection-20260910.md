# Test Plan: P4 Agent Inspection Cards

## Created

2026-09-10

## Goal

Register a real local P4 agent without selecting an adapter, then present one responsive card per registration with protocol-reported machine facts and live agent node registry.

## Environment

Windows host, local P4 source and agent runtime, P4 Studio Compose deployment on port 43120, connected browser.

## Preconditions

- Preserve the existing local agent listener on `192.168.0.6:51054`.
- Build an inspection-capable agent from current P4 source and run it on an unused parallel port.
- Build P4 Studio from the workspace lockfile.

## Steps

1. Run P4 protocol and agent tests for the new event-v3 inspection media types and snapshot.
2. Run Studio protocol codec, integration, concurrency, typecheck, and production build checks.
3. Start the inspection-capable local P4 agent on the verified parallel port.
4. Query that port directly and record the returned machine and node snapshot.
5. Deploy Studio through `npm run deploy` and verify machine-readable success plus `/health`.
6. Open the visible agent registration dialog and register the local host and parallel port using name, host, and port only.
7. Verify the resulting card exposes reachability, latency, machine facts, supported adapters, P4 registered nodes, and a scoped refresh control.
8. Inspect browser console errors and capture the final card.

## Expected Results

- Registration has no agent adapter field and remains durable even if inspection fails.
- The real local agent reports P4 event version 3, snapshot schema 1, machine facts, and its current node registry.
- The card distinguishes protocol-reported nodes from Studio node declarations.
- Multiple-card layout is responsive and monitor inspection never exceeds configured concurrency.
- Existing port 51054 remains bound by its original runtime.

## Logs To Capture

P4 tests, Studio checks, local listener/process evidence, direct snapshot JSON, deploy report, health JSON, browser console, and final screenshot.

## Locator Contract

- Role: `main`, navigation `주 탐색`, dialog `에이전트 등록`, region `에이전트 목록`.
- Label: `에이전트 이름`, `호스트`, `포트`, `<agent-name> P4 정보 새로고침`.
- Named sections: `<agent-name> 머신 정보`, `<agent-name> P4 등록 노드`, `<agent-name> Studio 노드 선언`.
- Text: `머신`, `P4 등록 노드`, `Studio 노드 선언`, `P4 조회 실패`.
- Test id: `agent-card` only for repeated card enumeration.
