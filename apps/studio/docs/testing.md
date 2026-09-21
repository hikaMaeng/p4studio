# Testing

- 모델 카드 `article`은 모델 이름으로 식별하며 `상태 새로고침` 버튼은 해당 카드에 범위 지정한다. 조회 중 `상태 확인 중…` 버튼이 disabled이고 같은 이름의 progressbar가 표시된다. 실제 노드 상태·확인 시각은 `status`다. [시나리오](../../../test/20260915/175300_model-refresh/scenario.mjs)와 [보고서](../../../test/20260915/175300_model-refresh/report.json)는 배포 화면에서 모의 HTTP/P4 응답으로 loaded 세대 미확인, absent/empty, 부분 장애, reload, 409 충돌을 검사한다. SQLite 저장과 충돌 거부는 [API 시험](../src/server/api/deployments.test.ts)이 검사한다.
- [reception.test.ts](../src/front/p4/reception.test.ts)의 모델 새로고침 시험은 실제 model gateway→INSPECT 경로에서 최신 그룹 대표로만 bridge를 열고 원래 worker target을 유지하는지 검사한다. 예전 model ingress는 접수 선택에 쓰지 않으며 게이트웨이 장애 시 worker 직접 접속으로 우회하지 않는다. [실제 브라우저 접수 보고서](../../../test/20260915/175300_model-refresh/cluster-live-report.json)는 MI250 모델의 WebSocket open 요청 대상 ID를 검증한다.

통합 테스트는 in-memory SQLite와 Express app factory를 사용한다. inspector를 주입해 registration success/error와 machine/node DTO를 검사하고, 여러 agent 조회의 최대 동시성을 검증한다. 브라우저 acceptance는 실제 P4 agent를 등록하고 named machine/P4 node/Studio declaration section을 확인한다.

[deployments.test.ts](../src/server/api/deployments.test.ts)는 실제 Express/SQLite/길이-prefix TCP 소비 경로에서 원격 target 보존, 부분 완료, 중복 실행 차단, 오래된 load generation, 단절, 재시작, 실패 원문 보존을 검사한다. 응답 서버는 모의 어댑터이며 GPU 적재 증거가 아니다.

모델 화면은 이름 있는 `section`, 모델별 `article`/`table`, `/models/new`와 `/models/:id/edit` 전용 구성 페이지, 노드 그래프와 `배치 N` fieldset을 사용한다. [모델 그래프 계약](usage.md#model-graph)에 따라 에이전트는 포트 없는 그룹이며 자식 노드끼리 연결한다. 노드 선택 → plan/LOAD JSON 수정 → 저장/새로고침 → 노드별 보고 → 언로딩은 별도 제어 검증이다.

그래프 locator: `flow-agent-{agentId}` 그룹, `flow-agent-header-{agentId}` 이동 헤더, `flow-node-{agentId}:{nodeId}:{generation}` 노드, `flow-input-…`/`flow-output-…` 포트. 상세는 `노드 ID` 번역명으로 이름 붙인 `aside`와 `section`이다. React Flow 소유 edge에만 `.react-flow__edge` CSS 예외를 사용한다.

새로고침 버튼은 `{agent name} 노드 목록 새로고침`, 연필은 `{name} 편집`, textbox는 `에이전트 이름`/`노드 이름` 번역명으로 찾는다. 헤더의 주소/여백을 드래그하며 입력·버튼은 드래그하지 않는다. 조회/저장 실패는 `alert`, 조회 중은 `progressbar`다.

[graph-inventory.test.ts](../src/server/api/graph-inventory.test.ts)는 실제 Express/SQLite로 browser-owned P4 session용 agent 접속 좌표, 이름 변경·ID 보존·agent별 node ID 분리·다른 JSON 필드 보존·revision 증가를 검사한다. [app.test.ts](../src/server/app.test.ts)는 browser-authored INSPECT 관측이 서버 재시작 뒤 마지막 관측 시각과 함께 복원되고 malformed/unregistered 기록이 거부되는지 검사한다. [store.test.ts](../../../packages/studio_domain/src/front/model/graph-inventory/store.test.ts)는 조회 중복 차단·성공 관측의 저장·실패 후 이전 관측 유지·이름 저장 재시도를 검사한다. `test/20260911/152000_graph-metadata/` 로컬 시나리오 증거는 임시 SQLite의 실제 HTTP 이름 저장, 모의 P4 WebSocket 조회, 내부/외부 노드 연결, 조회 실패 후 연결 유지, 페이지 reload 뒤 SQL 이름 복원을 포함한다. 실제 P4 적재·추론 증거가 아니다.

[grouped-node-connections.mjs](../../../test/20260911/grouped-node-connections.mjs)는 HTTP fixture(에이전트 2개 × 노드 4개)로 동일 node ID의 에이전트 간 분리, 내부/외부 포트 연결, 그룹 이동 후 자식 포함·edge 유지, 정확한 노드 상세 선택을 검사한다. `P4STUDIO_TEST_URL`로 실행 중인 Vite URL을 지정한다. 증거는 `test/20260911/130000_grouped-node-connections/`; 실제 P4 적재 시험이 아니다. 이전 페이지/제어 증거는 `test/20260911/model-editor/`, `test/20260911/model-menu/`다.

인퍼런스 화면은 `/inference/query`에서 1·5·10·20·30·40·50 동시 요청, 반복·간격·프롬프트를 설정하고 stream 결과 표의 요청 한 줄·상태·질문 요약·토큰/최종 TPS와 활성 run의 `inference-monitoring-summary`를 확인한다. 결과가 21개 이상이면 한 페이지에 정확히 20개만 표시하고 이전/다음으로 이동한다. 각 행의 `상세 보기`는 `/inference/requests/:requestId` 독립 상세 페이지로 이동하며, 직접 접속·새로고침·back/forward와 `inference-request-detail`의 결과 목록 복귀를 검사한다. 요청 상세는 단일 요청의 질문·답변·owner telemetry를 보이고 run 전체 graph나 다른 요청을 섞지 않는다. `/inference/monitoring`에서는 활성 run별 진행률·토큰·TTFT p50/p95/최댓값·최종 TPS p50, `inference-run-observability`의 output/active·observed fill·phase/ready·stage·GPU/VRAM graph, coverage와 관련 batch/span 집계를 확인한다. `inference-wave-summary`는 웨이브별 전송 시각·진행률·TTFT 분포, `inference-stage-summary`는 보조 회계표다. 실제 INSPECT의 현재 adapter/GPU 상태는 별도 노드 상태 영역에 표시한다. `/inference/history`의 각 `inference-history-row`에는 질문 요약과 전체 run summary를 표시하며 `상세 보기`가 `/inference/history/:runId` 독립 상세 페이지로 이동한다. 상세 URL 직접 접속·새로고침·back/forward와 `inference-history-detail`의 목록 복귀를 검사하며, 없는 run ID는 다른 실행으로 전환하지 않고 찾을 수 없음을 표시한다. v3 이전 기록은 TTFT와 웨이브 기준을 값 없음으로 표시한다. 과거 snapshot 기반 기록은 observation/span identity를 중복 제거해 요약하며 요청 owner telemetry는 unavailable로 표시한다. 실제 수용에는 P4 agent가 반환한 SESSION_READY, OUTPUT, `batch-observation-v5`, `stage-span-v5`와 정상 출력이 필요하며, 프런트 unit/typecheck만으로 이를 주장하지 않는다.

질의·기록 결과 표의 각 `inference-request-row`는 저장된 질문 `inference-question`과 답변 `inference-answer`를 각각 고정 3줄로 자르고 번역된 확대 버튼으로 전체 원문 dialog를 연다. 요청별 모니터링 dialog도 같은 질문·답변 원문을 성능 지표와 함께 표시한다. request ID로 행을 먼저 범위 지정해 반복 버튼의 모호성을 제거한다.

각 요청 행의 `모니터링 상세` 버튼은 요청별 dialog를 연다. 새 실행은 TTFT/E2E/TPS, owner issue와 phase rows, observed fill, execution owner로 귀속한 stage waterfall·공유 시간을 표시한다. 이전 기록은 0을 관측값처럼 제시하지 않고 telemetry unavailable 메시지를 표시한다.

[connection.test.ts](../src/front/p4/connection.test.ts)는 모의 WebSocket에서 dispatch receipt가 실제 `WebSocket.send()` 직전의 monotonic 시각을 반환하는지, 한 메시지의 여러 frame이 consumer 처리 시간과 무관하게 동일한 수신 시각을 받는지, 분할 frame은 마지막 조각 수신 시각을 사용하는지 검사한다. TPS 분모·기록 환산은 [domain timing 시험](../../../packages/studio_domain/docs/testing.md)이 소유한다.
## Gateway group verification

- [API tests](../src/server/api/agent-groups.test.ts): 노드 없는 대표, 그룹 분리, 중복 소속 rollback, 없는 구성원/그룹 밖 대표 거부, 대표 삭제 제한, 대표 교체·그룹 해제.
- [reception tests](../src/front/p4/reception.test.ts): gateway별 connection open과 P4 target/returnRoute/correlation 유지, Agent-target LOAD/UNLOAD, 비소속 직접 연결, 그룹 변경 후 최신 INSPECT 경로, gateway 장애 시 직접 연결 금지, `groups` 누락 거부. [bridge tests](../src/server/agent-socket/browser-bridge.test.ts): 실제 TCP/WebSocket에서 구성원 직접 open 거부와 노드 없는 gateway open.
- [browser scenario](../../../test/20260915/120600_agent-groups/scenario.mjs), [report](../../../test/20260915/120600_agent-groups/report.md): 두 그룹 생성·편집, 구성원 중복 선택 거부, 저장·reload·back/forward·직접 URL·그룹 해제·모델 접수 안내. `agent-group`은 반복 그룹 카드, group name textbox, members checkboxes, gateway combobox는 resource label로 식별한다.
- 로컬 시험이며 실제 P4 모델 적재/다중 VPC 추론 수용을 대신하지 않는다.
- [forwarded inspection scenario](../../../test/20260915/120600_agent-groups/inspection.mjs), [report](../../../test/20260915/120600_agent-groups/inspection-report.md): 직접 접속 불가인 `private.invalid` 대상의 정보/노드 갱신을 실제 browser→bridge→mock gateway TCP 경로에서 확인한다. 응답 payload는 시험 fixture다.

## Model editor layout regression

- [scenario](../../../test/20260915/model-editor/scenario.mjs): 저장된 16-stage 구성의 미관측·미등록 대상과 15개 연결, 헤더·복귀·reload/history, 클릭 전 패널 없음, 오른쪽 overlay·12px 입력, draft 보존·노드 전환·순서 변경, 900px 화면을 검사한다. `model-node-inspector`가 플로팅 aside locator다.
- [report](../../../test/20260915/model-editor/report.json), [graph](../../../test/20260915/model-editor/graph.png), [panel](../../../test/20260915/model-editor/panel.png): 실제 HTTP 저장 구성을 읽되 저장 PUT은 가로채며 P4 명령/구성 변경은 수행하지 않는다. 실제 모델 적재 수용과 구분한다.

[노드 수명 검증계획](../../../tests/plans/node-lifecycle-20260916.md): binary lifecycle codec, 실제 browser→WebSocket→TCP fixture, 부분 실패 회수, 재적재와 canonical URL 복원. 실제 모델 실행 수용과 구분한다.
