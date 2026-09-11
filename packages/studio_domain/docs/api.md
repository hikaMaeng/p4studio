# API

| Subpath | Public surface | Source |
| --- | --- | --- |
| `@p4studio/studio_domain/common` | deployment 입력·레코드·stage report schema/type, route 목록, 응답 parser | [deployments/index.ts](../src/common/protocol/deployments/index.ts): `DeploymentInput`, `DeploymentRecord`, `StageReport`, `parseDeployment` |
| `@p4studio/studio_domain/server` | 배치 검증·LOAD payload 생성, transport를 주입받는 제어 실행 | [plan.ts](../src/server/deployments/plan.ts): `validatePlacement`, `buildLoadPayload`; [runner.ts](../src/server/deployments/runner.ts): `runDeployment`, `UncertainDelivery` |
| `@p4studio/studio_domain/front` | 구독·version 알림, slice 갱신, 언어 목록·방향·공유 언어 모델 | [Emitter.ts](../src/front/model/Emitter.ts): `Emitter`; [SliceModel.ts](../src/front/model/SliceModel.ts): `SliceModel`; [types.ts](../src/front/language/model/types.ts), [store.ts](../src/front/language/model/store.ts) |

전체 export는 [package.json](../package.json)과 각 barrel이 기준이다. 프런트 [deployment store](../src/front/model/deployments/store.ts)는 draft·목록·작업 상태를 React 밖에 보관하며 앱 gateway를 주입받는다. common/server의 실제 소비 경로는 [앱 router](../../../apps/studio/src/server/api/deployments.ts)와 [통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이다. 로컬 모의 완료와 실제 GPU 적재 수용을 구분한다.

[inference/index.ts](../src/common/protocol/inference/index.ts)는 실행 입력, run/request projection, stage monitoring snapshot과 HTTP route를 소유한다. [inference store](../src/front/model/inference/store.ts)는 SSE run snapshot과 monitoring snapshot을 React 밖에 보관한다.
