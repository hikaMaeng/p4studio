# API

## Model requests

모델 메뉴는 [model-requests DTO](../src/common/protocol/model-requests/index.ts)의 공개 owner metadata와 브라우저 P4 INSPECT를 별도 출처로 표시한다. `GET /api/model-deployments/:id/requests`는 현재 LOAD 및 겹치는 node generation의 미정산 실행을 반환하며 capability/hash를 포함하지 않는다. Studio 요청 수는 원래 실행의 보수적 admitted/settled 체크포인트 차이이며, 종료된 연결·만료 lease는 0으로 바꾸지 않는다. 이전 실행에 체크포인트가 없으면 수는 미확인이다.

`PUT /api/operation-leases/:id/checkpoint`는 원래 owner capability, LOAD generation, 단조 증가 admitted/settled/submitted를 검사한다. wave를 보내기 전에 admitted를 영속화하고 실행 중 주기적으로 진행을 갱신한다. 이는 token 중계나 P4 접수 증명 대신 OUTER의 미정산 보호 기록이다.

P4 request/pending/owner/flight 카운터는 exact node·load identity가 맞는 llama.cpp `work={...}` 진단에서만 읽는다. 현재 일부 runtime은 실행 중 `loaded`만 제공하므로 P4 수는 미확인으로 남는다. pending은 requests의 일부이며 단계별 값은 합산하지 않는다. 조회 실패·오래된 관측·다른 generation은 0이 아니다.

클리어는 모델의 UNLOAD lease로 새 작업을 차단하고 원래 실행 소유자에게 CANCEL을 전달한 뒤 단계별 UNLOAD와 최신 INSPECT를 수행한다. `POST /api/model-deployments/:id/requests/clear`는 same-origin action header, 모델 revision/LOAD, 준비된 배타 lease 및 모든 단계의 30초 이내 부재를 요구한다. 성공은 owner에 clearedAt/clearOperationId를 기록하며 settledAt과 이전 실행 결과를 변경하지 않는다. 다른 모델의 나머지 자원까지 소유한 owner는 부분 해제하지 않는다.

SCOPE_CLOSE는 실행을 접수한 원래 OUTER 연결에서만 작동한다. 브라우저나 반환 연결이 이미 사라진 과거 scope는 새 OUTER로 다시 닫을 수 없으며, busy/failed runtime은 [승인된 에이전트 회수](../../../docs/agent-recovery-plan.md)가 필요하다. 관리 profile 미구성 및 Windows 이외 host 강제 회수는 현재 미지원이며 자동 프로세스 종료를 주장하지 않는다.

## Agent observations

- [graph-inventory contract](../src/common/protocol/graph-inventory/index.ts) accepts only browser-decoded P4 INSPECT snapshots. A successful observation also records `reachable`, the browser measured `latencyMs`, and probe time on the Studio registration. Failed refreshes remain a UI error and do not overwrite the last successful observation. The server does not issue P4 commands from this route.

## Model refresh

- [hasObservedNoNodes](../src/front/model/deployments/reconcile.ts): all planned stages must have current successful missing-node observations before the [model list](../../../apps/studio/src/front/features/models/ModelsView.tsx) displays “no nodes”. The selector does not change persisted execution status or unknown LOAD ownership. Missing/duplicate reports, unreachable agents, newer uncertain operations and active LOAD/UNLOAD cannot become absence. A model with observed absence shows LOAD instead of repeated UNLOAD; unresolved LOAD keeps LOAD disabled and its explanation in the tooltip and expanded history. [Regression tests](../src/front/model/deployments/reconcile.test.ts) keep absence display separate from `canStartDeployment`.

- [DeploymentStore](../src/front/model/deployments/store.ts): `tasks` excludes overlapping LOAD/UNLOAD, inspection, save and deletion for the same model ID; different models can operate independently. It exposes intent before cancellation or connection setup completes. `activity.busy` covers editor saving only. `reconcile(id)` observes one model; `reconcileAll()` reloads the saved list and observes models sequentially, skipping busy or removed models and retaining successful updates after another inspection fails. `listInspection` prevents duplicate list refreshes without locking every row. A selected detail refresh observes only its ID. Background `refresh()` remains DB-only; in-flight list reads cannot replace newer local results. Consumers: [model list](../../../apps/studio/src/front/features/models/ModelsView.tsx), [editor](../../../apps/studio/src/front/features/models/ModelEditorPage.tsx), [concurrency tests](../src/front/model/deployments/store.test.ts).
- [reconcileDeployment](../src/front/model/deployments/reconcile.ts) interprets browser INSPECT results per agent/node/generation. llama.cpp currently reports a string (`empty`, `loaded`, `unloaded`, transitions or failure), without load generation; `loaded` is an observation and cannot promote a deployment to `ready`. Agent lifecycle_state/lifecycle_result take precedence over opaque adapter state. Empty adapter strings never prove node removal. Missing nodes do not resolve an outstanding unknown LOAD; transport failure and identity mismatch remain unknown. Historical LOAD telemetry and failure detail are retained separately from timestamped `observation`.
- [deployment routes](../src/common/protocol/deployments/index.ts): receipt and `PUT /api/model-deployments/:id/reconcile` persist browser state only when `expectedUpdatedAt` matches the current record, otherwise 409. This revision check prevents concurrent operations from overwriting a newer UNLOAD or reconciliation. `DELETE /api/model-deployments/:id` removes only the Studio declaration; if recovery remains it requires explicit `discard=true` and never UNLOADs P4. Consumers: [model gateway](../../../apps/studio/src/front/features/models/api.ts), [HTTP storage](../../../apps/studio/src/server/api/deployments.ts).

## Session proof

- [sessionProofSchema](../src/common/protocol/deployments/index.ts) binds a completed deployment to one `sessionId`, `loadGeneration`, and the exact stage ID set. The browser also binds the proof write to the load and node generations captured before SESSION. A successful LOAD receipt means **loaded**; only matching `SESSION_READY` replies from every stage promote the deployment to **ready**. A model's successful inference setup records and displays the session ID in [models API](../../../apps/studio/src/front/features/models/api.ts) and [model list](../../../apps/studio/src/front/features/models/ModelsView.tsx).
- Consumers: [inference SESSION flow](../../../apps/studio/src/front/features/inference/api.ts), [deployment reconciliation](../src/front/model/deployments/reconcile.ts), and [session eligibility](../src/common/protocol/deployments/lifecycle.ts). A stale or absent session proof cannot make a record ready; LOAD receipts and live node observations remain distinct evidence.

| Subpath | Public surface | Source |
| --- | --- | --- |
| `@p4studio/studio_domain/common` | deployment 입력·레코드·stage report schema/type, route 목록, 응답 parser | [deployments/index.ts](../src/common/protocol/deployments/index.ts): `DeploymentInput`, `DeploymentRecord`, `StageReport`, `parseDeployment` |
| `@p4studio/studio_domain/server` | 배치 검증·adapter payload 생성 | [plan.ts](../src/server/deployments/plan.ts): `validatePlacement`, `buildLoadPayload` |
| `@p4studio/studio_domain/front` | 구독·version 알림, slice 갱신, 언어 목록·방향·공유 언어 모델 | [Emitter.ts](../src/front/model/Emitter.ts): `Emitter`; [SliceModel.ts](../src/front/model/SliceModel.ts): `SliceModel`; [types.ts](../src/front/language/model/types.ts), [store.ts](../src/front/language/model/store.ts) |

전체 export는 [package.json](../package.json)과 각 barrel이 기준이다. 프런트 [deployment store](../src/front/model/deployments/store.ts)는 draft·목록·작업 상태를 React 밖에 보관하며 앱 gateway를 주입받는다. common/server의 실제 소비 경로는 [앱 router](../../../apps/studio/src/server/api/deployments.ts)와 [통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이다. 로컬 모의 완료와 실제 GPU 적재 수용을 구분한다.

<a id="inference-telemetry"></a>

`inferenceRunSchema` stores concurrency, repetitions, interval, and maxTokens with each new run. Its settings object is optional for backward compatibility with browser-local history created before these values were recorded; old records keep their original request/telemetry data and show settings as unrecorded instead of deriving them from incomplete waves. See [inferenceRunSchema](../src/common/protocol/inference/index.ts) and the [browser history owner](../../../apps/studio/docs/api.md#browser-owned-inference).
[inference/index.ts](../src/common/protocol/inference/index.ts)는 실행 입력, run/request projection, stage monitoring snapshot·집계와 HTTP route를 소유한다. [telemetry.ts](../src/common/protocol/inference/telemetry.ts)는 P4 llama.cpp `batch-observation-v5`·`stage-span-v5` payload를 strict schema로 검증하며 `scheduling`은 P4 `SchedulingSnapshot`에서 필수 `max_issue_rows`(음이 아닌 안전 정수, 0은 상한 없음)만 읽고 나머지 필드는 통과시킨다. v5는 request 소유 항목마다 P4 `ReplySpec`(`ingress_agent`, `channel`, `connection_generation`, `correlation_id`, `deadline_unix_ms`)을 필수로 싣고 `classifyP4Telemetry`는 정확한 v5 content type만 현재 계약으로 분류한다; 다른 버전은 `unsupported`다. [front telemetry cache](../src/front/model/inference/telemetry.ts)는 `(model, agent address, node ID, load generation)`별 최신 관측을 projection하고 run snapshot을 240개로 제한한다. [monitoring-summary.ts](../src/front/model/inference/monitoring-summary.ts)는 session·stage 검사를 통과한 telemetry를 event identity로 중복 제거해 run/stage별 배치 수, 처리 행, phase, 실행 수, ready peak와 누적 시간을 보존한다. [observability.ts](../src/front/model/inference/observability.ts)는 같은 승인 event를 1초 run series와 요청 소유 summary로 투영한다. batch series와 request fill은 observation별 같은 분모(실행 시점 `scheduling.max_issue_rows`, 없거나 0이면 configured UBATCH fallback을 `fallback*` 필드로 표시), request summary는 owner rows, stage summary는 execution owner를 사용한다. stage summary의 `mixedPhysicalBatches`는 P4 wire `mixed_physical_batches`(prefill과 decode/verify/replay가 섞인 physical batch, phase-mixed)이고, request telemetry의 `multiRequestPhysicalBatches`는 `physical.request_count > 1`인 physical batch 수로 서로 다른 값이다(옛 request 기록의 `mixedPhysicalBatches` 키는 읽지 않고 0으로 시작). 한 stage의 첫 batch 관측 `idle_ms`는 `initialIdleMs`(기본 0)에 두고 이후 관측만 `idleMs`에 더한다. `projectPhaseWorkSeries`는 1초 batch bucket을 physical batch당 평균 prefill/decode row와 bucket 최대 ready row로 투영하며 physical batch가 없는 bucket의 평균은 `null`이다. 이전 기록은 bounded snapshot에서 고유 observation/span만 best-effort로 재구성하며(첫 재구성 batch를 stage의 첫 관측으로 취급) 요청 소유 정보는 소급하지 않는다. [inference store](../src/front/model/inference/store.ts)는 browser gateway가 발행한 run/monitoring snapshot을 React 밖에 보관하며 실행 transport를 소유하지 않는다.

`InferenceStore.remove(runId)` rejects active or unsettled runs and awaits the browser gateway durable deletion before removing its subscription. IndexedDB revision CAS rejects stale peers; failed deletion keeps the record and refreshes current evidence. `cancel(runId)` retains the subscription through `cancelling` and delegates to the browser execution owner.

<a id="inference-cancellation"></a>

## Inference cancellation

- [cancellation schema](../src/common/protocol/inference/cancellation.ts) owns llama.cpp `scope-close-v1`, `scope-closed-v1`, `error-v2` and `release-receipt-v1` payloads. [InferenceCancellation](../src/front/model/inference/cancellation/control.ts) owns stop intent, the original PREFILL event ledger, request incarnation and settlement. [InferenceExecutions](../src/front/model/inference/cancellation/executions.ts) is the browser-local registry shared by [inference gateway](../../../apps/studio/src/front/features/inference/api.ts), [model UNLOAD](../../../apps/studio/src/front/features/models/api.ts) and [node UNLOAD](../../../apps/studio/src/front/p4/node-unload.ts).
- Stop synchronously aborts subsequent SESSION/PREFILL/wave scheduling. If the run submitted PREFILLs, it sends one Control `application/vnd.p4.llamacpp.scope-close-v1+json` to the configured head over that run's original OUTER route, with the exact LOAD generation. P4 fences that OUTER/LOAD scope and resolves its queued and active work. It does not cancel another OUTER. Completed requests and partial text remain. Preparing or interval-only runs stop without inventing submitted requests.
- Studio consumes `scope-closed-v1` only when source=head, target/return route=the exact OUTER, correlation/causation match the close command, adapter is llama.cpp, class is Control, and LOAD generation matches. `closing` is progress only. `closed` is required before the cancellation owner finishes; missing, refused or uncertain final results yield `unknown`. P4's `native_kv_stop_proven` field is a protocol conclusion from its finish/RELEASE path, not independent GPU measurement.
- The deadline is `min(model.timeoutMs, 30000)` milliseconds. The request ledger still consumes exact terminal/RELEASE and approved OUTPUT events while waiting for the scope barrier. UNLOAD locks matching model/node keys before closing every browser-local overlapping run, then waits for settlement and any in-flight SESSION proof write. Only UNLOAD's own exact lifecycle completion proves model resource removal. Old agents that do not implement SCOPE_CLOSE fail closed; Studio does not silently fall back to per-request CANCEL. No P4 commands originate from the Studio server.
- Model/node UNLOAD locks matching model/node keys before closing every browser-local overlapping inference scope, then waits for the exact close barrier, request settlement and any in-flight SESSION proof write. New overlapping inference and duplicate unload are rejected until the operation exits. Unknown scope closure remains recorded; only UNLOAD's own exact lifecycle completion proves resource removal. Current LOAD ownership is reread before dispatch. No P4 commands originate from the Studio server.
- Verification: [domain tests](../src/front/model/inference/cancellation/control.test.ts), [browser gateway tests](../../../apps/studio/src/front/features/inference/api.test.ts), [verification contract](testing.md).

<a id="inference-timing"></a>
[timing.ts](../src/front/model/inference/timing.ts)의 `recordOutputTiming`은 같은 monotonic clock의 실제 `WebSocket.send()` 시각과 수신 시각을 받아 요청별 `TTFT = firstOutputMs - sentAtMs`와 TPS를 갱신한다. 동시 요청마다 기준점이 별개이며 반복 웨이브도 최초 run 시각을 공유하지 않는다. `generationTps = (receivedTokens - 1) * 1000 / (lastOutputMs - firstOutputMs)`로 TTFT를 제외하며, `finalTps`는 terminal OUTPUT에서 같은 값을 확정한다. 토큰 1개 이하 또는 관측 구간 0이면 null이다. `receivedTokens`는 llama.cpp output-v5의 sampled token 수이며 빈 text의 EOS도 포함한다. 첫 토큰을 분자에서 빼 시간 구간 수와 맞춘다. `ttftMs`만 표시·기록용 정수로 반올림하며 TPS 계산에는 원래 정밀도를 유지한다.

[monitoring-summary.ts](../src/front/model/inference/monitoring-summary.ts)는 TTFT 평균을 만들지 않는다. 전체 실행과 각 전송 웨이브를 nearest-rank p50·p95·최댓값으로 요약하고, 최종 TPS는 p50을 표시한다. `waveIndex`가 없는 v3 이전 기록은 웨이브 요약을 만들지 않는다.

소비자는 [browser inference gateway](../../../apps/studio/src/front/features/inference/api.ts)와 쿼리·기록 표다. `migrateLegacyTiming`은 v1의 `generationTps = N / (last - first)`를 `(N-1)/N` 배로 환산하고 완료 기록의 final TPS에도 적용한다. `invalidateLegacyDispatchTiming`은 실제 전송 시각이 없던 v3 이전 기록의 TTFT·prefill TPS·wave identity를 제거한다. 엔진 내부 TPS나 클러스터 합산 TPS를 뜻하지 않는다.
## Agent groups

`common`의 [agent-groups/index.ts](../src/common/protocol/agent-groups/index.ts)는 `AgentGroupInput { name, gatewayAgentId, memberAgentIds }`, 안정 ID를 포함한 `AgentGroup`, schema와 HTTP route를 소유한다. `GET/POST /api/agent-groups`, `PUT/DELETE /api/agent-groups/:id`; [graph-inventory](../src/common/protocol/graph-inventory/index.ts)의 agent 목록 응답에도 `groups`가 포함된다.

- `resolveAgentReception(targetId, agents, groups)`는 그룹 대표의 관리 ID·P4 주소를 반환한다. 비소속은 자기 주소, 대표 누락/다중 소속은 오류다. gateway는 구성원이며 노드 소유를 요구하지 않는다.
- `agentAddress`는 IPv6를 포함한 등록 좌표를 P4 주소로 변환한다. `target`의 실제 agent/node/generation과 접수 주소는 별개다.
- [AgentGroupsStore](../src/front/model/agent-groups/store.ts)는 topology·editor·activity slice를 소유한다. 앱은 HTTP와 React를 연결한다.
- 모델의 `ingressAgentId`는 과거 저장 문서를 읽기 위한 호환 필드다. 브라우저 작업의 접수 선택에는 사용하지 않으며, 새 화면에서 편집하지 않는다.
- INSPECT/LOAD/UNLOAD/SESSION은 각 대상의 그룹을 따른다. 에이전트 상세·노드 탭과 모델 그래프의 INSPECT도 동일 접수 경로다. PREFILL은 첫 stage의 그룹을 통해 전달한다. 각 접수 연결은 같은 operation correlation과 별도 OUTER 주소를 가지며, 해당 의뢰의 응답은 그 연결로 귀속된다.
- topology 응답의 `groups`는 필수다. 누락·조회 실패 시 작업을 거부하며, 이전 캐시 또는 직접 접속으로 대체하지 않는다. 명시적인 빈 배열만 그룹 없음으로 처리한다.
- 그룹 변경은 새 작업에 적용된다. 실행 중인 작업은 시작 시 topology와 기존 접수 연결을 유지한다. UNLOAD의 agent endpoint와 metadata node generation/adapter load generation은 적재 receipt에서 가져오고 접수 gateway는 새 작업의 현재 그룹 설정에서 가져온다.
- 서로 다른 그룹의 stage를 연결할 때 agent 간 forward/return 도달성은 P4 네트워크 구성의 책임이다. Studio 그룹 등록 자체가 VPC 간 통신 가능성을 증명하지 않는다.

## Node lifecycle

[resource-profile.ts](../src/common/protocol/deployments/resource-profile.ts): `readLlamaResourceProfile`은 P4 `validate_preload` 중 agent 상태가 필요 없는 검사(version 2, 필수 양수 필드, unknown field, byte·token 한도 일관성)만 수행한다. `llamaCompletionStoreBytes`·`llamaCompletionStoreCount`는 LOAD allocation의 하한 추정이다. `validateDeploymentLoad`는 LOAD 직전에만 호출된다. [output.ts](../src/common/protocol/inference/output.ts): `parseP4ApprovedOutput`(strict `output-v6`), `classifyP4Output`, 요청별 `OutputOrdinalBuffer`.

[공통 runtime](../src/common/protocol/deployments/runtime.ts)의 `runBrowserDeployment`가 browser transport를 주입받아 stage별 최종 결과와 회수를 조율한다. [lifecycle 정책](../src/common/protocol/deployments/lifecycle.ts)은 allocation·재적재 eligibility·generation을 소유한다. 입력의 legacy `createNode`는 parser가 제거한다. receipt의 `stageGenerations`는 stage ID별 실행 generation을 저장해 다음 조회·SESSION에 전달하며 감소·누락·다른 ID는 거부한다. [전체 계약](../../../docs/node-lifecycle.md).

## Recovery and retained ownership

[recovery schemas](../src/common/protocol/recovery/index.ts)는 HostProof/RecoveryOperation/retry attempts를 소유한다. [RecoveryModel](../src/front/model/recovery/store.ts)은 pure data/activity slices, poll generation과 승인된 action 호출을 소유한다. HTTP/SSH/OS는 [Studio gateway](../../../apps/studio/src/front/features/agent-recovery/model.ts)와 server operations에 있다. [DeploymentHistory](../src/front/model/deployments/history.ts)는 이력과 현재 페이지 slice를 소유한다.

loadGeneration은 inference run에 결속한다. 복원된 active run은 unknown이며 submitted owner를 pendingSettlement로 보존한다. 같은 LOAD 세대의 pending run 삭제·재실행은 막는다. 새 세대는 별도 key지만 과거 unknown 이력은 삭제하지 않는다. verified forced recovery는 declaration 편집/삭제 eligibility를 해소하며 old unload failure는 보존한다. fresh absent INSPECT는 current resource projection이고 old LOAD terminal 성공이 아니다.

[정산 소비자](../src/front/model/inference/cancellation/control.ts)는 delivery-not-started refusal, exact terminal/RELEASE, 자연 completion race와 prefix를 분리한다. 모든 wave total을 첫 SESSION 전에 예산과 대조한다. [회귀 시험](testing.md).

History Recover passes the run LOAD generation through `DeploymentStore.operate(id, "unload", expectedLoadGeneration)`. The browser gateway checks the current server record before any inference cancellation; unknown or changed generations cannot authorize current-model recovery.
