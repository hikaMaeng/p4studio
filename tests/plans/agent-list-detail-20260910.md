# Test Plan: Agent list, detail and registration editing
## Created
2026-09-10
## Goal
Verify a compact many-agent list, full-page detail transition, and SQLite-owned registration editing without conflating observed P4 hardware with managed data.
## Environment
Windows host, Docker Studio at `http://127.0.0.1:43120`, Chrome extension surface, live P4 agent at `host.docker.internal:51055`.
## Preconditions
The local agent is registered and returns P4 event-v3 hardware inspection.
## Steps
1. Run Studio integration tests, typecheck and production build.
2. Deploy through the root `npm run deploy` entrypoint.
3. Inspect the live list and assert its compact summary fields.
4. Activate `<agent-name> 상세 보기` and assert the list is replaced by `agent-detail`.
5. Activate `등록정보 편집`, assert management name, host and port fields, then cancel without changing the live record.
6. Return through `에이전트 목록으로` and inspect console errors.
## Expected Results
The list contains only management and summary facts. Detail is a normal page state, not a dialog. SQLite editing is validated and an endpoint edit triggers inspection of the new address.
## Logs To Capture
Test totals, build/deploy result, accessibility tree, visible screenshots, console errors.
## Locator Contract
List `에이전트 목록`; repeated `agent-row`; button `<agent-name> 상세 보기`; detail `agent-detail`; button `에이전트 목록으로`; button `등록정보 편집`; form `<agent-name> 등록정보 편집`; labels `관리 이름`, `호스트`, `포트`.
