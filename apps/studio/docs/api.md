# API

서비스 API는 루트 [API 문서](../../../docs/api.md)를 따른다. API DTO는 `src/common/domain.ts`가 소유한다.

모델 배치 API는 [domain deployment 계약](../../../packages/studio_domain/src/common/protocol/deployments/index.ts)의 schema·route를 양쪽에서 사용한다. [router](../src/server/api/deployments.ts)는 `/api/model-deployments` GET/POST, `/:id` GET/DELETE/PUT, browser-authored `/:id/receipt` PUT와 `/:id/reconcile` PUT를 제공한다. receipt와 reconcile은 `expectedUpdatedAt` 불일치 시 409로 오래된 레코드 덮어쓰기를 거부한다. `DELETE`는 원격 P4 UNLOAD가 아니라 Studio 선언 삭제이며, 복구가 필요한 기록은 명시적 `discard=true` 없이는 409로 거부한다. `/:id/load`와 `/:id/unload`는 server execution을 거부한다. LOAD terminal receipt는 `loaded`만 증명한다. 모델 설정의 긴 제한 시간은 LOAD에만 적용하며, 각 UNLOAD 응답 대기는 최대 2분이다. 응답이 없으면 자원 부재로 단정하지 않고 결과를 미확인으로 보존해 INSPECT 또는 lifecycle 응답으로 재확인한다. 재기동 시 진행 중이거나 적재된 상태는 미확인으로 바뀌고 이전 관측과 SESSION 증명은 지워지므로, 재조회와 새 SESSION 검증이 필요하다. [브라우저 SESSION flow](../src/front/features/inference/api.ts)가 현재 generation의 모든 stage에서 동일한 `session_id`와 `load_generation`을 검증하고 기록했을 때만 `ready`로 표시한다. 브라우저가 WebSocket P4 연결을 수행한 뒤 상태·노드별 receipt 또는 [조회 관측](../../../packages/studio_domain/docs/api.md#model-refresh)을 저장한다.

<a id="browser-owned-inference"></a>

SESSION_READY 확인이 모든 stage에서 끝나면 head 접수 연결만 PREFILL·OUTPUT·RELEASE 반환 경로로 유지하고 나머지 준비 연결은 FINISH/ACK로 회수한다. P4의 40분 유휴 종료 정책은 그대로 유지한다. 종료된 접수 연결은 캐시에서 제거하고 다음 제어 요청에서 새 OUTER endpoint로 연결하며, 완료가 불명인 기존 명령은 재전송하지 않는다. head 반환 연결의 단절은 기존 요청의 미정산 상태와 다음 실행 차단을 유지한다.

각 run은 입력 당시 `concurrency`, `repetitions`, `intervalMs`, `maxTokens`를 보존한다. query 결과는 run 단위로 묶이고, `inference-run-group`의 접힘 요약에 설정·실행 통계가 남는다. 상세를 열면 전체 run observability graph, wave/stage 집계와 해당 run의 개별 요청 표를 확인하고 각 요청 상세에서 질문·답변을 연다. 예전 localStorage 기록에 없는 실행 설정은 역산하지 않고 미기록으로 표시한다.

[browser inference gateway](../src/front/features/inference/api.ts)는 첫 PREFILL 전송 기준 `회차 × intervalMs`의 monotonic deadline마다 `concurrency`개 요청을 보낸다. 앞선 회차의 출력 완료를 기다리지 않으며 `intervalMs=0`이면 모든 회차를 즉시 전송한다. 마지막 회차 전송 뒤에도 전체 요청의 terminal OUTPUT까지 연결·수신을 유지한다. 취소·실패는 이후 회차를 중단한다. 브라우저 타이머가 지연되면 이미 지난 deadline의 회차는 실행 재개 시 전송한다. [전송·취소 회귀](../src/front/features/inference/api.test.ts).

진행 중 실행의 `inference-run-stop` 버튼은 휴지통 옆에 표시한다. 준비 중·실행 중·웨이브 간 대기 중 모두 중지할 수 있으며 취소 확인 중에는 중복 중지와 삭제를 막는다. `inference-run-delete`는 현재 미정산이 없는 종료 기록만 IndexedDB revision CAS로 삭제한다. durable 삭제가 실패하면 화면과 원장을 유지한다. localStorage는 옛 기록 이관과 표시 호환용이며 권위 있는 owner 저장소가 아니다. [domain 취소 계약](../../../packages/studio_domain/docs/api.md#inference-cancellation)이 취소 의도·P4 terminal·RELEASE를 구분하며 부분 답변과 이미 완료된 요청을 보존한다.

[RunActions](../src/front/features/inference/InferenceView.tsx)는 아이콘과 번역된 `질의 중지` 문구를 함께 표시한다. 질의 결과 카드, 기록 목록의 실행 행, 기록 상세 상단은 동일한 run ID의 취소를 호출한다. 질의 화면은 [InferenceStore.activeRunIds](../../../packages/studio_domain/src/front/model/inference/store.ts)를 구독해 최신 실행과 모든 활성 실행을 표시한다. 메뉴를 이동하거나 더 최근 실행이 먼저 끝나도 이전 활성 실행의 중지 버튼을 유지한다.

모델 전체 언로드와 노드 상세 언로드는 같은 browser execution registry를 사용한다. 관련 모델 또는 공유 노드를 사용하는 실행의 이후 웨이브를 먼저 막고 원래 PREFILL 연결에서 미완료 요청에 CANCEL을 보낸다. 정산 대기 뒤 현재 LOAD 소유권을 다시 읽고 검증한 후 Agent-target UNLOAD를 실행한다. 이미 시작한 SESSION proof 저장은 최대 30초의 HTTP 기한 안에서 종료를 기다리며 receipt revision 검사를 유지한다. 취소 기한 내 확인이 없으면 run은 `unknown`을 보존하고 UNLOAD의 별도 수명 결과로 회수를 판정한다. 다른 브라우저의 실행은 이 메모리 registry에 없으며 그 실행의 취소 완료를 주장하지 않는다.

인퍼런스 run과 monitoring projection은 browser memory model이 소유한다. 각 request record는 사용자가 입력한 질문 원문 `prompt`와 수신 답변 `text`를 한 쌍으로 보존한다. Qwen artifact는 dispatch 직전에 Studio가 ChatML control tokens를 적용하므로 사용자는 control token을 입력하지 않는다. Qwen3.5 artifact는 검증된 122B 입력처럼 빈 줄 두 개를 포함한 `<think>\n\n</think>\n\n` assistant 접미부로 no-thinking을 선택한다. 다른 Qwen의 기존 ChatML 형식은 유지한다. `maxTokens`는 항상 양수이며 기본값은 4000이다. Studio는 stage resource profile의 `max_output_tokens_per_request`보다 큰 값은 보내지 않지만, P4 adapter가 prompt와 output을 합친 context admission의 최종 권한을 가진다. P4 OUTPUT은 `output-v6`만 소비한다. P4는 도착 순서와 중복 제거를 보장하지 않으므로 브라우저 연결이 이미 소비한 event ID를 버리고(연결당 최근 65,536개), 각 요청은 `output_ordinal` 순서로만 답변에 반영한다. 같은 순번의 동일 payload는 무시하고 다른 payload는 run 오류다. OUTPUT의 load generation·session·`submission_event_id`가 해당 요청의 PREFILL과 다르면 run 오류다. transport `delivery-failure-v1` 통지는 그 PREFILL의 요청만 끝낸다: `not_started`는 `failed`, `unknown`은 `unknown`. 명시적 P4 `ERROR`는 `failed`이고, transport 단절처럼 결과를 알 수 없는 경우만 `unknown`이다. 실행 결과 목록은 페이지당 20개 요청만 한 줄로 표시하고, `/inference/requests/:requestId` 독립 상세 URL에서 해당 요청의 질문·답변과 owner가 확인된 issue/phase, stage execution을 표시한다. 이 요청 상세는 run-level 집계·전체 timeline을 보이는 `/inference/history/:runId`와 달리 단일 요청 telemetry만 표시한다. 브라우저가 새로 적재된 `loaded` deployment, `ready` deployment 또는 재기동 뒤 모든 stage의 `loaded` 관측을 새로 확인한 미확인 deployment에서 SESSION을 수행하며 `/api/graph-agents` 접속 좌표를 읽고 같은 WebSocket bridge session에서 P4 SESSION/PREFILL/OUTPUT과 llama.cpp `batch-observation-v5`·`stage-span-v5` telemetry를 처리한다. 다른 버전의 같은 telemetry 계열(v4 포함)은 현재 계약으로 소비하지 않고 run을 명시적 오류로 종료하며, v5 요청 소유자는 요청별 `reply` return context를 포함한 strict schema로만 받는다. 미확인 deployment는 ready로 표시하지 않으며, PREFILL 전에 generation-aware SESSION이 실제 세대를 다시 검증한다. 실행 중 telemetry는 node address·ID·generation과 현재 load/session을 대조한 뒤 run history의 bounded snapshot, 누적 stage summary, 1초 graph series와 요청 owner summary에 보존한다. 전체 graph는 output token·active request, UBATCH 분모의 observed fill, physical batch당 평균 prefill/decode rows와 bucket 최대 ready rows, stage service time, INSPECT GPU/VRAM과 node delivery/broker receipt 표본을 같은 실행 시간축에 표시한다. monitoring 화면은 활성 run과 각 agent에 실제 P4 INSPECT를 보낸 현재 adapter/GPU 상태를 구분한다. server-side `/api/inference` controller와 SSE는 실행 경로가 아니다.

[connection.ts](../src/front/p4/connection.ts)의 `dispatch`는 P4 frame을 `WebSocket.send()`에 넘기기 직전에 `performance.now()`와 wall-clock 시각을 기록해 호출자에게 돌려준다. 각 요청은 이 실제 전송 시각을 독립 기준점으로 가진다. 반복 웨이브는 시작 시각 기준 interval로 예약하며 이전 웨이브의 완료를 기다리지 않는다. 전체 요청·입력·출력·retained budget을 SESSION 전에 검사한다. 각 웨이브는 live ledger reserve와 IndexedDB mandatory checkpoint를 commit한 뒤 PREFILL을 전송한다. `onEvent`는 WebSocket message callback 진입 시 같은 monotonic clock으로 수신 시각을 찍는다. 한 message의 여러 P4 frame은 같은 수신 시각을 사용한다. [inference/api.ts](../src/front/features/inference/api.ts)는 두 시각을 [TTFT/TPS 계산기](../../../packages/studio_domain/docs/api.md#inference-timing)에 전달한다. 토큰 집계는 즉시 수행하고 화면 발행은 100ms, IndexedDB snapshot 저장은 1초 단위로 묶으며 run 종료 시 즉시 flush한다. pagehide에도 저장한다. 브라우저 event loop·네트워크 지연은 수신 시각에 포함된다.

기존 `p4studio.inference.history.v1` 저장 키를 유지하고 envelope에 `timingVersion: 3`을 기록한다. v1 기록은 TPS 식을 한 번 변환하며, v3 이전 기록의 TTFT·prefill TPS는 실제 `WebSocket.send()` 시각을 복원할 수 없어 null로 이행한다. 이전 숫자를 새 기준의 측정치로 표시하지 않는다. browser-owned WebSocket은 새 페이지에서 재개할 수 없으므로 복원 시 `preparing`·`running`·`cancelling` run은 `unknown`으로 끝내며, 해당 run의 미완료 또는 취소 상태 요청도 정산 미확인으로 보존한다. 이전 P4 SESSION을 모니터링하거나 재전송하지 않는다.

에이전트 등록 DTO는 `name`, `host`, `port`이며 Studio 노드 선언 DTO는 `name`만 포함한다. 단독 선언 POST는 410으로 폐기했다. 실행 어댑터는 모델 배치 LOAD에서 선택한다.

에이전트 view DTO의 `inspection`은 등록 시 `pending`이다. 서버는 등록 중 P4를 probe하지 않는다. browser session이 성공적으로 decode한 INSPECT snapshot은 PUT `/api/agents/:id/observation`에 `{observedAt,latencyMs,snapshot}`으로 기록할 수 있으며, SQLite의 `agent_observations`에는 agent별 마지막 관측과 시각을, agent 등록에는 해당 성공 조회의 `reachable`·지연·시각을 기록한다. 실패한 refresh는 성공 관측을 덮지 않고 상세에 오류로 표시한다.

그래프 관리 이름은 [graph-inventory schema·routes](../../../packages/studio_domain/src/common/protocol/graph-inventory/index.ts)를 양쪽에서 사용한다. GET `/api/graph-agents`는 browser-owned P4 session에 필요한 등록 agent ID·이름·host·port를 반환하고, GET `/api/node-labels`는 이름 projection 목록을 반환한다. PATCH `/api/agents/:id/name`은 `{name}`, PUT `/api/agents/:id/node-labels`는 `{nodeId,name}`, PUT `/api/agents/:id/observation`은 browser-decoded `{observedAt,latencyMs,snapshot}`을 받는다. 성공한 INSPECT만 `reachable` 상태로 반영하며, 이 경로는 서버에서 P4 명령을 보내지 않는다. 잘못된 입력은 400, 없는 에이전트는 404, 에이전트 이름 충돌은 409다. 노드 ID는 URL이나 수정 대상 이름이 아니라 불변 lookup key다. [메타데이터 계약](usage.md#managed-metadata)에 따라 SQL만 수정하며 P4 명령을 보내지 않는다.
## Agent removal

DELETE `/api/agents/:id`는 [graphInventoryRoutes.removeAgent](../../../packages/studio_domain/src/common/protocol/graph-inventory/index.ts)의 경로를 사용한다. 등록/노드 metadata 삭제는 204, 없는 등록은 404, Studio 노드 선언이나 그룹 참조는 409 `agent_in_use`다. [삭제 UI 계약](usage.md#agent-removal)과 [API 회귀](../src/server/api/agent-removal.test.ts)를 함께 확인한다.

## Agent gateway groups

[group router](../src/server/api/agent-groups.ts)는 [공통 그룹 계약](../../../packages/studio_domain/docs/api.md#agent-groups)을 저장한다. [repository](../src/server/database/agent-groups.ts)는 `agent_groups`와 `agent_group_members`를 추가 생성하며 기존 agent/model 레코드를 이동하지 않는다. 구성원 교체는 transaction이고 한 agent의 중복 소속은 unique constraint로 거부한다. 그룹 구성원/대표의 agent 삭제는 제한하며 그룹 해제는 직접 접속으로 돌아가는 명시적 관리 동작이다.

[reception.ts](../src/front/p4/reception.ts)는 조회·모델 작업마다 캐시 없이 topology를 읽고 고정하여 gateway별 browser connection을 연다. [inspection.ts](../src/front/p4/inspection.ts)도 같은 접수 연결을 사용하여 실제 대상 agent의 INSPECT 응답을 검증한다. `groups`가 없는 응답은 거부한다. 서버 bridge는 그룹 구성원을 직접 여는 요청을 거부하며 P4 frame 해석·target 변경은 하지 않는다. 그룹 설정은 접속 경로 관리이며 별도 peer 인증이나 VPC 설정 기능은 아니다.

UI: `/agent-groups`, `/agent-groups/new`, `/agent-groups/:id`, `/agent-groups/:id/edit`. agent 메뉴의 그룹 버튼에서 진입한다. ID는 encode/decode하고 없는 그룹/잘못된 그룹 하위 URL은 오류 화면을 표시한다. 독립 화면 draft는 [AgentGroupsStore](../../../packages/studio_domain/src/front/model/agent-groups/store.ts)에 둔다.

## Agent recovery and operation leases

[recovery router](../src/server/operations/recovery.ts)는 승인 Windows host-management와 durable operation을 소유한다. P4 wire 의미는 해석하지 않는다. [front gateway](../src/front/features/agent-recovery/model.ts)가 새 P4 INSPECT를 수행한다.

- GET /api/agent-recovery/agents/:id: configured + operations. POST .../agents/:id/plan {operationId}: host read-only proof와 영향 모델 revision/load generation을 캡처한다.
- GET .../operations/:id: 동일 작업 조회. POST execute/resume은 {confirm:operationId}, retry는 추가 attemptId를 요구한다. execute idempotent; 60초 review deadline. review-retry는 부분 실패의 현재 proof를 저장하고 명시적 retry만 회수를 실행한다. stopped가 확인된 설치는 resume에서 재차 kill하지 않는다.
- POST reprobe/cancel/verify: 조회 후 새 host/P4 proof 또는 무효과를 검사한다. verify {observedAt,agentPid,agentBorn,nodes:0}는 host 증거 수신 시각과 현재 재조회 identity를 대조한다. 최초 error와 cleanupError, 전후 proof, 각 retry attempt는 보존한다.
- mutating recovery는 same-origin Origin과 X-P4Studio-Action: recovery를 요구한다. 임의 PID/root/SSH command는 HTTP 입력으로 받지 않는다. 미설정 host는 명시적으로 unavailable이다.
- POST /api/operation-leases {operationId,modelId,expectedUpdatedAt,action:load|unload|inference,ownerToken?}; GET/PUT/DELETE .../:id. ready 전 신규 I/O를 시작하지 않는다. 일반 TTL30초/heartbeat5초, recovery는 검증 또는 증명된 무효과 종료 전 영구 fence다. gateway 경유 agent도 자원에 포함한다. recovery를 다른 recovery로 선점할 수 없다.
- GET /api/model-deployments/:id/history: current + archived records. 변경과 삭제 전 기록을 유지한다. pending recovery 동안 ready/new load promotion, 편집·삭제를 거부한다.

[정책·수용 상태](../../../docs/agent-recovery-plan.md), [검증](../../../tests/reports/lifecycle-audit/20261006_163000.md).

- inference admission은 model/load/node generation별 SQLite owner 원장을 남긴다. live lease DELETE/TTL은 미정산 owner를 해제하지 않는다. PUT .../:id/settlement는 original closure의 private UUID capability와 정확한 generation/pending0을 요구한다. capability는 실행 이력에 저장하지 않는다.
- 과거 unknown 실행의 Recover는 해당 run의 LOAD generation을 최초 현재 모델 조회와 비교한 뒤만 취소·UNLOAD를 시작한다. 세대가 없거나 달라진 기록은 현재 모델 화면에서 명시적으로 검사한다.
- [독립 리뷰와 반례](../../../tests/reports/lifecycle-audit/20261006_170000-zero-context-review.md)는 source/local 및 실제 배포 증거를 구분한다.
