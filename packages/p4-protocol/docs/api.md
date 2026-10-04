# API

- `P4_PROTOCOL`: frame, event, status schema version
- `P4_AGENT_OPERATIONS`: Studio가 인지하는 agent operation
- `AgentReachability`: protocol health와 분리한 TCP 상태
- `encodeAgentInspectionRequest`: agent endpoint를 향한 event-v3 control event 생성
- `decodeAgentInspectionResponse`: 상관관계와 content type, schema를 검증하고 머신·노드 snapshot 반환
- `P4AgentSnapshot`: 머신 facts, 현재 agent node registry, node delivery retained 상태, broker 상태와 transport 관측 타입. 없는 필드는 0이 아니라 `null`이다: 경량 브로커 agent의 `broker.receipts`, 통합 메모리 장치의 `vram*`, 구형 agent의 `loadGeneration`·`backend`·`memoryKind`·`transport.failures`·`notices`·`retryWaiting`.
- node `loadGeneration`: 노드가 보유한 적재의 identity. 등록 세대 `generation`과 다른 값이며 서로 대체하지 않는다.
- `P4_DELIVERY_FAILURE_CONTENT_TYPE`, `parseP4DeliveryFailure`: 송신 agent의 `{event_id, result}` 통지. `not_started`는 한 바이트도 쓰지 않음, `unknown`은 쓰기가 시작됨을 뜻한다. 요청 terminal이나 정산이 아니다.
- `P4_AGENT_INSPECT_CONTENT_TYPE`, `P4_AGENT_SNAPSHOT_CONTENT_TYPE`: inspection v1 media type

## Node lifecycle

[lifecycle.ts](../src/event/lifecycle.ts): `NODE_LOAD_CONTENT_TYPE`, `NODE_UNLOAD_CONTENT_TYPE`, `NODE_LIFECYCLE_RESULT_CONTENT_TYPE`, request/result parser와 encode/decode. `u32le metadata length + UTF-8 JSON + opaque adapter bytes`; metadata 상한 65536 bytes, schema 1, 안전 정수 identity·capacity, unknown field 거부. LOAD는 네 capacity가 필수이고 UNLOAD는 allocation을 금지한다. 결과의 status/resource_state/first_error/cleanup_error는 독립 필드다.

INSPECT node의 optional `lifecycleState`·`lifecycleResult`는 agent 소유 상태이며 adapter `state`와 별개다. 소비자는 domain runtime/reconcile와 브라우저 connection이다. [Rust/Python 공유 fixture 검증](../src/event/lifecycle.test.ts), [전체 수명 계약](../../../docs/node-lifecycle.md).


- `finishP4ConnectionFrame()`: public connection-scoped FINISH, four zero bytes; event/요청 terminal이 아니다.
- `P4FrameReader.push(chunk, allowFinish=false)`: arbitrary split/coalesced frame 수신. 종료를 기다리는 소비자만 `allowFinish=true`로 zero-length ACK를 받아 빈 `Uint8Array`로 구분한다. 기본 event 경로는 zero frame을 거절한다. payload 내부 zeros는 ACK가 아니다.
