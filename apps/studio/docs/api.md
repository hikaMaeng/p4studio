# API

서비스 API는 루트 [API 문서](../../../docs/api.md)를 따른다. API DTO는 `src/common/domain.ts`가 소유한다.

모델 배치 API는 [domain deployment 계약](../../../packages/studio_domain/src/common/protocol/deployments/index.ts)의 schema·route를 양쪽에서 사용한다. [router](../src/server/api/deployments.ts)는 `/api/model-deployments` GET/POST, `/:id` GET/DELETE/PUT, browser-authored `/:id/receipt` PUT와 `/:id/reconcile` PUT를 제공한다. `DELETE`는 원격 P4 UNLOAD가 아니라 Studio 선언 삭제이며, 복구가 필요한 기록은 명시적 `discard=true` 없이는 409로 거부한다. reconcile은 `expectedUpdatedAt` 불일치 시 409로 오래된 조회 결과를 거부한다. `/:id/load`와 `/:id/unload`는 server execution을 거부한다. 브라우저가 WebSocket P4 session을 수행한 뒤 상태·노드별 receipt 또는 [조회 관측](../../../packages/studio_domain/docs/api.md#model-refresh)을 저장한다.

<a id="browser-owned-inference"></a>
인퍼런스 run과 monitoring projection은 browser memory model이 소유한다. 각 request record는 P4에 보낸 질문 원문 `prompt`와 수신 답변 `text`를 한 쌍으로 보존한다. 실행 결과 목록은 페이지당 20개 요청만 한 줄로 표시하고, `/inference/requests/:requestId` 독립 상세 URL에서 해당 요청의 질문·답변과 owner가 확인된 issue/phase, stage execution을 표시한다. 이 요청 상세는 run-level 집계·전체 timeline을 보이는 `/inference/history/:runId`와 달리 단일 요청 telemetry만 표시한다. 브라우저가 ready llama.cpp deployment 또는 재기동 뒤 모든 stage의 `loaded` 관측이 있는 미확인 deployment와 `/api/graph-agents` 접속 좌표를 읽고 같은 WebSocket bridge session에서 P4 SESSION/PREFILL/OUTPUT과 llama.cpp `batch-observation-v4`·`stage-span-v4` telemetry를 처리한다. 미확인 deployment는 ready로 표시하지 않으며, PREFILL 전에 generation-aware SESSION이 실제 세대를 다시 검증한다. 실행 중 telemetry는 node address·ID·generation과 현재 load/session을 대조한 뒤 run history의 bounded snapshot, 누적 stage summary, 1초 graph series와 요청 owner summary에 보존한다. 전체 graph는 output token·active request, UBATCH 분모의 observed fill, phase/ready rows, stage service time, INSPECT GPU/VRAM과 node delivery/broker receipt 표본을 같은 실행 시간축에 표시한다. monitoring 화면은 활성 run과 각 agent에 실제 P4 INSPECT를 보낸 현재 adapter/GPU 상태를 구분한다. server-side `/api/inference` controller와 SSE는 실행 경로가 아니다.

[connection.ts](../src/front/p4/connection.ts)의 `dispatch`는 P4 frame을 `WebSocket.send()`에 넘기기 직전에 `performance.now()`와 wall-clock 시각을 기록해 호출자에게 돌려준다. 각 요청은 이 실제 전송 시각을 독립 기준점으로 가진다. 반복은 한 웨이브의 모든 요청이 terminal OUTPUT을 받은 뒤 interval만큼 대기하고 다음 웨이브를 전송하므로, `동시 질의 수`를 초과해 누적 dispatch하지 않는다. `onEvent`는 WebSocket message callback 진입 시 같은 monotonic clock으로 수신 시각을 찍는다. 한 message의 여러 P4 frame은 같은 수신 시각을 사용한다. [inference/api.ts](../src/front/features/inference/api.ts)는 두 시각을 [TTFT/TPS 계산기](../../../packages/studio_domain/docs/api.md#inference-timing)에 전달한다. 토큰 집계는 즉시 수행하고 화면 발행은 100ms, localStorage 저장은 1초 단위로 묶으며 run 종료 시 즉시 flush한다. pagehide에도 저장한다. 브라우저 event loop·네트워크 지연은 수신 시각에 포함된다.

기존 `p4studio.inference.history.v1` 저장 키를 유지하고 envelope에 `timingVersion: 3`을 기록한다. v1 기록은 TPS 식을 한 번 변환하며, v3 이전 기록의 TTFT·prefill TPS는 실제 `WebSocket.send()` 시각을 복원할 수 없어 null로 이행한다. 이전 숫자를 새 기준의 측정치로 표시하지 않는다. browser-owned WebSocket은 새 페이지에서 재개할 수 없으므로 복원 시 `preparing`·`running` run은 `unknown`으로 끝내며, 이전 P4 SESSION을 모니터링하거나 재전송하지 않는다.

에이전트 등록 DTO는 `name`, `host`, `port`이며 Studio 노드 선언 DTO는 `name`만 포함한다. 단독 선언 POST는 410으로 폐기했다. 실행 어댑터는 모델 배치 LOAD에서 선택한다.

에이전트 view DTO의 `inspection`은 등록 시 `pending`이다. 서버는 등록 중 P4를 probe하지 않는다. browser session이 성공적으로 decode한 INSPECT snapshot은 PUT `/api/agents/:id/observation`에 `{observedAt,snapshot}`으로 기록할 수 있으며, SQLite의 `agent_observations`에는 agent별 마지막 관측과 시각만 보존한다. 이는 등록 선언이나 현재 P4 상태가 아니며, 목록과 상세는 반드시 `inspectedAt`을 함께 표시한다.

그래프 관리 이름은 [graph-inventory schema·routes](../../../packages/studio_domain/src/common/protocol/graph-inventory/index.ts)를 양쪽에서 사용한다. GET `/api/graph-agents`는 browser-owned P4 session에 필요한 등록 agent ID·이름·host·port를 반환하고, GET `/api/node-labels`는 이름 projection 목록을 반환한다. PATCH `/api/agents/:id/name`은 `{name}`, PUT `/api/agents/:id/node-labels`는 `{nodeId,name}`, PUT `/api/agents/:id/observation`은 browser-decoded `{observedAt,snapshot}`을 받는다. 잘못된 입력은 400, 없는 에이전트는 404, 에이전트 이름 충돌은 409다. 노드 ID는 URL이나 수정 대상 이름이 아니라 불변 lookup key다. [메타데이터 계약](usage.md#managed-metadata)에 따라 SQL만 수정하며 P4 명령을 보내지 않는다.
## Agent removal

DELETE `/api/agents/:id`는 [graphInventoryRoutes.removeAgent](../../../packages/studio_domain/src/common/protocol/graph-inventory/index.ts)의 경로를 사용한다. 등록/노드 metadata 삭제는 204, 없는 등록은 404, Studio 노드 선언이나 그룹 참조는 409 `agent_in_use`다. [삭제 UI 계약](usage.md#agent-removal)과 [API 회귀](../src/server/api/agent-removal.test.ts)를 함께 확인한다.

## Agent gateway groups

[group router](../src/server/api/agent-groups.ts)는 [공통 그룹 계약](../../../packages/studio_domain/docs/api.md#agent-groups)을 저장한다. [repository](../src/server/database/agent-groups.ts)는 `agent_groups`와 `agent_group_members`를 추가 생성하며 기존 agent/model 레코드를 이동하지 않는다. 구성원 교체는 transaction이고 한 agent의 중복 소속은 unique constraint로 거부한다. 그룹 구성원/대표의 agent 삭제는 제한하며 그룹 해제는 직접 접속으로 돌아가는 명시적 관리 동작이다.

[reception.ts](../src/front/p4/reception.ts)는 조회·모델 작업마다 캐시 없이 topology를 읽고 고정하여 gateway별 browser connection을 연다. [inspection.ts](../src/front/p4/inspection.ts)도 같은 접수 연결을 사용하여 실제 대상 agent의 INSPECT 응답을 검증한다. `groups`가 없는 응답은 거부한다. 서버 bridge는 그룹 구성원을 직접 여는 요청을 거부하며 P4 frame 해석·target 변경은 하지 않는다. 그룹 설정은 접속 경로 관리이며 별도 peer 인증이나 VPC 설정 기능은 아니다.

UI: `/agent-groups`, `/agent-groups/new`, `/agent-groups/:id`, `/agent-groups/:id/edit`. agent 메뉴의 그룹 버튼에서 진입한다. ID는 encode/decode하고 없는 그룹/잘못된 그룹 하위 URL은 오류 화면을 표시한다. 독립 화면 draft는 [AgentGroupsStore](../../../packages/studio_domain/src/front/model/agent-groups/store.ts)에 둔다.
