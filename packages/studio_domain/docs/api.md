# API

## Model refresh

- [reconcileDeployment](../src/front/model/deployments/reconcile.ts) interprets browser INSPECT results per agent/node/generation. llama.cpp currently reports a string (`empty`, `loaded`, `unloaded`, transitions or failure), without load generation; `loaded` is an observation and cannot promote a deployment to `ready`. Agent lifecycle_state/lifecycle_result take precedence over opaque adapter state. Empty adapter strings never prove node removal. Missing nodes do not resolve an outstanding unknown LOAD; transport failure and identity mismatch remain unknown. Historical LOAD telemetry and failure detail are retained separately from timestamped `observation`.
- [deployment routes](../src/common/protocol/deployments/index.ts): `PUT /api/model-deployments/:id/reconcile` persists browser observations only when `expectedUpdatedAt` matches the current record, otherwise 409. `DELETE /api/model-deployments/:id` removes only the Studio declaration; if recovery remains it requires explicit `discard=true` and never UNLOADs P4. Consumers: [model gateway](../../../apps/studio/src/front/features/models/api.ts), [HTTP storage](../../../apps/studio/src/server/api/deployments.ts). Existing receipt/operation identity remains unchanged.

| Subpath | Public surface | Source |
| --- | --- | --- |
| `@p4studio/studio_domain/common` | deployment 입력·레코드·stage report schema/type, route 목록, 응답 parser | [deployments/index.ts](../src/common/protocol/deployments/index.ts): `DeploymentInput`, `DeploymentRecord`, `StageReport`, `parseDeployment` |
| `@p4studio/studio_domain/server` | 배치 검증·adapter payload 생성 | [plan.ts](../src/server/deployments/plan.ts): `validatePlacement`, `buildLoadPayload` |
| `@p4studio/studio_domain/front` | 구독·version 알림, slice 갱신, 언어 목록·방향·공유 언어 모델 | [Emitter.ts](../src/front/model/Emitter.ts): `Emitter`; [SliceModel.ts](../src/front/model/SliceModel.ts): `SliceModel`; [types.ts](../src/front/language/model/types.ts), [store.ts](../src/front/language/model/store.ts) |

전체 export는 [package.json](../package.json)과 각 barrel이 기준이다. 프런트 [deployment store](../src/front/model/deployments/store.ts)는 draft·목록·작업 상태를 React 밖에 보관하며 앱 gateway를 주입받는다. common/server의 실제 소비 경로는 [앱 router](../../../apps/studio/src/server/api/deployments.ts)와 [통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이다. 로컬 모의 완료와 실제 GPU 적재 수용을 구분한다.

<a id="inference-telemetry"></a>
[inference/index.ts](../src/common/protocol/inference/index.ts)는 실행 입력, run/request projection, stage monitoring snapshot·집계와 HTTP route를 소유한다. [telemetry.ts](../src/common/protocol/inference/telemetry.ts)는 P4 llama.cpp `batch-observation-v4`·`stage-span-v4` payload를 strict schema로 검증한다. [front telemetry cache](../src/front/model/inference/telemetry.ts)는 `(model, agent address, node ID, load generation)`별 최신 관측을 projection하고 run snapshot을 240개로 제한한다. [monitoring-summary.ts](../src/front/model/inference/monitoring-summary.ts)는 session·stage 검사를 통과한 telemetry를 event identity로 중복 제거해 run/stage별 배치 수, 처리 행, phase, 실행 수, ready peak와 누적 시간을 보존한다. [observability.ts](../src/front/model/inference/observability.ts)는 같은 승인 event를 1초 run series와 요청 소유 summary로 투영한다. batch series는 configured UBATCH 분모, request summary는 owner rows, stage summary는 execution owner를 사용한다. 이전 기록은 bounded snapshot에서 고유 observation/span만 best-effort로 재구성하며 요청 소유 정보는 소급하지 않는다. [inference store](../src/front/model/inference/store.ts)는 browser gateway가 발행한 run/monitoring snapshot을 React 밖에 보관하며 실행 transport를 소유하지 않는다.

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

[공통 runtime](../src/common/protocol/deployments/runtime.ts)의 `runBrowserDeployment`가 browser transport를 주입받아 stage별 최종 결과와 회수를 조율한다. [lifecycle 정책](../src/common/protocol/deployments/lifecycle.ts)은 allocation·재적재 eligibility·generation을 소유한다. 입력의 legacy `createNode`는 parser가 제거한다. receipt의 `stageGenerations`는 stage ID별 실행 generation을 저장해 다음 조회·SESSION에 전달하며 감소·누락·다른 ID는 거부한다. [전체 계약](../../../docs/node-lifecycle.md).
