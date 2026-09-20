# Architecture

에이전트 등록 삭제의 확인 대상·진행/거부/결과 불명 상태는 [AgentRemovalStore](../src/front/model/agents/removal.ts)가 소유한다. [Studio 삭제 UI](../../../apps/studio/docs/usage.md#agent-removal)가 소비하며 P4 수명 명령을 실행하지 않는다.

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/common` | 런타임 중립 DTO·schema·route와 OUTER 수명 규칙 | [deployments/index.ts](../src/common/protocol/deployments/index.ts): `deploymentInputSchema`, `deploymentSchema`, `deploymentRoutes`; [inference/index.ts](../src/common/protocol/inference/index.ts): `inferenceRunInputSchema`, `inferenceRunSchema`, `inferenceRoutes`; [inference/telemetry.ts](../src/common/protocol/inference/telemetry.ts): P4 llama.cpp telemetry parser |
| `src/server` | 배치 검증·adapter payload 구성 | [plan.ts](../src/server/deployments/plan.ts): `validatePlacement`, `buildLoadPayload` |
| `src/front` | React 밖의 순수 상태와 slice별 알림·언어 모델 | [SliceModel.ts](../src/front/model/SliceModel.ts): `SliceModel`; [language/index.ts](../src/front/language/model/index.ts); [inference/store.ts](../src/front/model/inference/store.ts); [inference/telemetry.ts](../src/front/model/inference/telemetry.ts) |

공개 진입점은 [package.json](../package.json)의 exports와 [common](../src/common/index.ts), [server](../src/server/index.ts), [front](../src/front/index.ts)를 대조한다. P4 원본으로 내려가는 경로는 [기능별 참조표](../../../docs/p4-reference.md#source-map)가 소유한다.

그래프 관리: [common graph-inventory](../src/common/protocol/graph-inventory/index.ts)는 이름 projection·검증·route, [front GraphInventoryStore](../src/front/model/graph-inventory/store.ts)는 관리 이름·관측·조회 상태·편집 draft를 소유한다. HTTP/SQL/WebSocket I/O는 [Studio 연결부](../../../apps/studio/src/front/p4/inventory.ts)에 주입한다.

그룹 관리: [common agent-groups](../src/common/protocol/agent-groups/index.ts)는 그룹 schema·접수 선택, [front AgentGroupsStore](../src/front/model/agent-groups/store.ts)는 topology·편집·저장 상태를 소유한다. 소비자와 불변식은 [constraints](constraints.md#agent-group-consumers), 실행 경로는 [api](api.md#agent-groups)를 따른다.

수명 조율은 [runtime.ts](../src/common/protocol/deployments/runtime.ts), allocation·재사용 정책은 [lifecycle.ts](../src/common/protocol/deployments/lifecycle.ts)가 소유하며 browser gateway가 소비한다. [계약](../../../docs/node-lifecycle.md).
