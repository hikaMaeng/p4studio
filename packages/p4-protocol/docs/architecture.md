# Architecture

framework-agnostic 공개 wire 상수, TypeScript 타입, P4 event-v3 agent inspection 코덱을 포함한다. transport socket과 상태 저장은 호출자가 소유한다.

| Path | Contract | Drill-down |
| --- | --- | --- |
| `src/event` | event wire·inspection·node lifecycle payload codec | [agent-inspection.ts](../src/event/agent-inspection.ts): `encodeAgentInspectionRequest`, `decodeAgentInspectionResponse`; [lifecycle.ts](../src/event/lifecycle.ts): `encodeLifecycleMetadata`, `decodeLifecycleMetadata`, request/result parser |

공개 export와 프로토콜 identity 진입점은 [index.ts](../src/index.ts)의 `P4_PROTOCOL`이다.

Rust 원본과 버전 축·transport 경계는 [P4 참조 안내](../../../docs/p4-reference.md#source-map)를 따른다. adapter별 모델 계획과 명령 상태는 [studio_domain](../../studio_domain/docs/architecture.md)이 소유한다.
