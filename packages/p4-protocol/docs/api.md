# API

- `P4_PROTOCOL`: frame, event, status schema version
- `P4_AGENT_OPERATIONS`: Studio가 인지하는 agent operation
- `AgentReachability`: protocol health와 분리한 TCP 상태
- `encodeAgentInspectionRequest`: agent endpoint를 향한 event-v3 control event 생성
- `decodeAgentInspectionResponse`: 상관관계와 content type, schema를 검증하고 머신·노드 snapshot 반환
- `P4AgentSnapshot`: 머신 facts, 현재 agent node registry, node delivery retained 상태와 broker receipt 저장 상태 타입. 구형 snapshot에서 추가 필드가 없으면 `delivery`와 `broker`는 `null`이다.
- `P4_AGENT_INSPECT_CONTENT_TYPE`, `P4_AGENT_SNAPSHOT_CONTENT_TYPE`: inspection v1 media type

## Node lifecycle

[lifecycle.ts](../src/event/lifecycle.ts): `NODE_LOAD_CONTENT_TYPE`, `NODE_UNLOAD_CONTENT_TYPE`, `NODE_LIFECYCLE_RESULT_CONTENT_TYPE`, request/result parser와 encode/decode. `u32le metadata length + UTF-8 JSON + opaque adapter bytes`; metadata 상한 65536 bytes, schema 1, 안전 정수 identity·capacity, unknown field 거부. LOAD는 네 capacity가 필수이고 UNLOAD는 allocation을 금지한다. 결과의 status/resource_state/first_error/cleanup_error는 독립 필드다.

INSPECT node의 optional `lifecycleState`·`lifecycleResult`는 agent 소유 상태이며 adapter `state`와 별개다. 소비자는 domain runtime/reconcile와 브라우저 connection이다. [Rust/Python 공유 fixture 검증](../src/event/lifecycle.test.ts), [전체 수명 계약](../../../docs/node-lifecycle.md).
