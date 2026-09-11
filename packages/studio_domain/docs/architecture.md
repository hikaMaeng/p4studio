# Architecture

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/common` | 런타임 중립 DTO·schema·route 계약 | [deployments/index.ts](../src/common/protocol/deployments/index.ts): `deploymentInputSchema`, `deploymentSchema`, `deploymentRoutes`; [inference/index.ts](../src/common/protocol/inference/index.ts): `inferenceRunInputSchema`, `inferenceRunSchema`, `inferenceRoutes` |
| `src/server` | 배치 검증·adapter payload 구성·작업 상태 진행 | [plan.ts](../src/server/deployments/plan.ts): `validatePlacement`, `buildLoadPayload`; [runner.ts](../src/server/deployments/runner.ts): `runDeployment`, `DeploymentTransport` |
| `src/front` | React 밖의 순수 상태와 slice별 알림·언어 모델 | [SliceModel.ts](../src/front/model/SliceModel.ts): `SliceModel`; [language/index.ts](../src/front/language/model/index.ts); [inference/store.ts](../src/front/model/inference/store.ts) |

공개 진입점은 [package.json](../package.json)의 exports와 [common](../src/common/index.ts), [server](../src/server/index.ts), [front](../src/front/index.ts)를 대조한다. P4 원본으로 내려가는 경로는 [기능별 참조표](../../../docs/p4-reference.md#source-map)가 소유한다.

그래프 관리: [common graph-inventory](../src/common/protocol/graph-inventory/index.ts)는 이름 projection·검증·route, [front GraphInventoryStore](../src/front/model/graph-inventory/store.ts)는 관리 이름·관측·조회 상태·편집 draft를 소유한다. HTTP/SQL/WebSocket I/O는 [Studio 연결부](../../../apps/studio/src/front/features/models/inventory.ts)에 주입한다.
