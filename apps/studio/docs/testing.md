# Testing

`npm test --workspace @p4studio/studio`는 실제 앱 소비 경로와 in-memory SQLite/Express fixture를 검사한다. mock P4 결과와 실제 agent·GPU 수용을 구분한다. 실행 산출물은 루트 [Testing](../../../docs/testing.md)의 무시된 로컬 경로에 쓴다.

| 경계 | 재사용 회귀 코드 |
| --- | --- |
| 웨이브 발행·준비 중지·부분 출력·정산 후 재실행 | [api.test.ts](../src/front/features/inference/api.test.ts), [lifecycle.test.ts](../src/front/features/inference/lifecycle.test.ts) |
| 원래 OUTER에서 CANCEL·terminal·RELEASE, 모델/노드 UNLOAD | [inference-cancellation.mjs](../../../tests/browser/inference-cancellation.mjs), [node-unload.test.ts](../src/front/p4/node-unload.test.ts) |
| 게이트웨이·SESSION 준비 연결 회수·종료 후 재연결 | [reception.test.ts](../src/front/p4/reception.test.ts), [socket-lifecycle.mjs](../../../tests/browser/socket-lifecycle.mjs) |
| 활성 반환 연결 단절 | [inference-disconnect.test.ts](../src/front/p4/inference-disconnect.test.ts) |
| 노드 상태와 LOAD/UNLOAD 결과 | [deployments.test.ts](../src/server/api/deployments.test.ts), [models/api.test.ts](../src/front/features/models/api.test.ts) |
| 요청 이력·삭제·wave 분리·페이지 계산 | [history.test.ts](../src/front/features/inference/history.test.ts), [pagination.test.ts](../src/front/features/inference/pagination.test.ts), [wave-results.mjs](../../../tests/browser/wave-results.mjs) |
| 그래프 identity·조회 중복·저장 충돌 | [graph-inventory.test.ts](../src/server/api/graph-inventory.test.ts), [app.test.ts](../src/server/app.test.ts), [domain graph store](../../../packages/studio_domain/src/front/model/graph-inventory/store.test.ts) |
| URL·경로 해석·ID encoding | [routes.test.ts](../src/front/shell/routes.test.ts) |
| lease·복구 guard·원래 process identity | [leases.test.ts](../src/server/operations/leases.test.ts), [recovery.test.ts](../src/server/operations/recovery.test.ts), [windows.test.ts](../src/server/operations/windows.test.ts) |

## Browser locator contract

- Speculative metrics use the named `section` `inference-speculative` within a run or request, `inference-speculative-summary`, `inference-speculative-rate`, and `inference-speculative-annotation`. Exactly one percentage chart has `role="img"` named by translated acceptance title/description. [speculative-decoding.mjs](../../../tests/browser/speculative-decoding.mjs) tests framed mock P4 live events, weighted rate, duplicate suppression, history/reload, request deep URL/back/forward, responsive width and Arabic RTL. No native GPU acceptance is claimed.

- 단일 `main`, 이름 있는 `navigation`·`section`·폼과 `status`·`alert`·`progressbar`를 사용한다. 버튼·textbox·combobox는 번역된 accessible name으로 찾는다.
- 에이전트 목록은 `agent-row`의 `<관리 이름> 상세 보기`, 상세는 `agent-detail`, 복귀는 `에이전트 목록으로`, 편집은 `<관리 이름> 등록정보 편집`이다. 노드 목록은 `agent-node-card`, 값은 `node-value-capsule`이다. 미조회와 조회 결과 0개를 구분한다.
- 모델 카드는 이름 있는 `article`이다. `model-row`, `model-row-status`, `model-row-agent`, `model-row-name`, `model-row-summary`, `model-row-details`를 사용한다. 토글은 `aria-expanded`, 새로고침은 이름 있는 버튼·progressbar와 `status`를 가진다. 생성·편집은 `/models/new`, `/models/:id/edit` URL로 복원한다.
- 그래프는 `flow-agent-{agentId}`, `flow-agent-header-{agentId}`, `flow-node-{agentId}:{nodeId}:{generation}`, `flow-input-…`, `flow-output-…`이다. inspector는 `model-node-inspector` aside다. agent/node 이름 입력·버튼은 드래그하지 않는다. React Flow edge에만 `.react-flow__edge` CSS 예외를 허용한다.
- 실행은 `inference-run-groups`, `inference-run-group`, `inference-run-details`이며, 해당 실행 안에서 `inference-run-stop`, `inference-run-delete`, `inference-run-recover`를 범위 지정한다. 미정산 실행 삭제·재실행을 차단하고 부분 응답을 보존한다.
- 웨이브는 `inference-wave-results`, `inference-wave-row`, `inference-wave-toggle`, `inference-wave-statistics`, `inference-wave-pagination`, `data-wave-index`로 식별한다. 요청은 `inference-request-row`로 찾는다. 토글·페이지·질문/답변 drill-down은 해당 run/wave에 범위 지정한다.

## Gateway group verification

[reception tests](../src/front/p4/reception.test.ts)는 그룹별 connection open, 실제 target·returnRoute·correlation 유지, Agent-target LOAD/UNLOAD, 비소속 직접 경로, 최신 topology, gateway 장애 시 worker 직접 접속 금지를 검사한다. [bridge tests](../src/server/agent-socket/browser-bridge.test.ts)는 실제 TCP/WebSocket에서 구성원 직접 open 거부와 노드 없는 gateway open을 검사한다.

단위 시험 밖의 브라우저 동선에서는 직접 URL·reload·back/forward, 모델 상태 조회·부분 장애·revision 충돌, 그래프의 동일 node ID 분리, 긴 값·배열·빈 값, 요청 삭제 후 reload, 좁은 화면·RTL을 검증한다. 같은 이름의 다른 카드나 과거 저장 receipt를 현재 대상의 완료 증거로 사용하지 않는다.

## 개편 회귀

[studio-revamp.mjs](../../../tests/browser/studio-revamp.mjs)는 명시한 URL의 별도 DB·브라우저 모사 기록으로 네 계열·1/2/3/4/5+·평균/다중비율·입장 측정불가·replay 설명·slot 경고·반복 방식·세 preset과 적용 후 노트를 검사한다. 실제 P4/GPU를 사용하지 않는다. --url, --out을 지정하며 일반 Playwright headless 또는 HEADLESS_BROWSER_CDP_URL의 테스트 소유 headless Chromium을 쓴다. 후자는 실행자가 수명을 관리한다. 실패 시 보고·스크린샷을 보존하고 launch 실패는 렌더 수용으로 세지 않는다. api.test.ts는 완료 대기·취소·v4/v5 순차 READY·불일치 전송0을 검사하며 deployments.test.ts는 optional insightNotes HTTP·SQLite 호환을 검사한다.

같은 브라우저 시험은 LOAD 모사 보고로 계약 불일치·일부 누락·잘못된 문자열·세대 불일치를 실제 API 사전 검증에 통과시키고, 한국어·영어 `alert` 및 실시간 언어 전환을 확인한다. P4 연결 수는 0이어야 한다. 초기 빈 모델 선택의 반복 emit도 페이지 오류 0 검사에 포함된다. `api.test.ts`의 A2 시험은 완성된 분포를 주입하지 않고 wire 이벤트부터 중복 제거·stage별 누적·localStorage 저장·새 API 복원까지 연결한다. [변이 시험](../../../tests/integration/studio-revamp-mutation.mjs)은 누적 호출 제거를 검출한다.

Windows 크래시 방지·프로세스 검사와 숨김 경로의 정적 파일 제한은 [루트 시험 실행 계약](../../../docs/testing.md)을 따른다. 스크린샷·실행 원문·계획은 Git 제외 경로에 보존하며 재사용 시험만 추적한다.
