# Node lifecycle

P4 감사 기준: `56c203b6d70dc91be46e399b6d68f85ebc53cda1` (2026-09-16, clean).
소유 원본: [완료 계획](../../p4/docs/node-load-lifecycle-plan.md), [codec](../../p4/layers/protocol/src/event/lifecycle.rs), [agent control](../../p4/entrypoints/agent/src/event_runtime/control.rs), [실제 호출자](../../p4/tools/event-drive/src/run/lifecycle.rs).

| Boundary | Owner / consumers |
| --- | --- |
| metadata framing, validation, INSPECT projection | [protocol lifecycle](../packages/p4-protocol/src/event/lifecycle.ts), [inspection](../packages/p4-protocol/src/event/agent-inspection.ts) → domain/runtime/browser |
| stage allocation, generation, reuse policy | [lifecycle policy](../packages/studio_domain/src/common/protocol/deployments/lifecycle.ts) → browser gateway, HTTP edit guard, model actions |
| whole-model load, rollback, terminal interpretation | [runtime](../packages/studio_domain/src/common/protocol/deployments/runtime.ts) → [browser gateway](../apps/studio/src/front/features/models/api.ts) |
| binary delivery, correlation/causation/endpoints | [connection](../apps/studio/src/front/p4/connection.ts), [group reception](../apps/studio/src/front/p4/reception.ts) → opaque server bridge |
| receipt + actual node generation persistence | [DTO](../packages/studio_domain/src/common/protocol/deployments/index.ts), [API](../apps/studio/src/server/api/deployments.ts) → SQLite, inference SESSION |
| observation/recovery eligibility | [reconcile](../packages/studio_domain/src/front/model/deployments/reconcile.ts) → model state refresh and actions |

## Commands and ownership

- 노드는 모델 또는 stage 적재 인스턴스다. 계획된 stage는 아직 P4 노드가 아니다. LOAD가 생성·적재하며 UNLOAD 성공이 native 자원·노드 제거 완료다. CREATE/DELETE와 node-target lifecycle 우회는 사용하지 않는다.
- LOAD/UNLOAD 모두 target은 실제 **Agent endpoint**다. `node.load-v1`/`node.unload-v1`의 payload는 `u32le JSON 길이 + JSON metadata + opaque adapter bytes`, 결과는 Agent 발신 `node.lifecycle-result-v1`이다. 공통 metadata 상한은 64 KiB다.
- metadata에 node ID/generation, adapter kind/content type, LOAD의 queue/completion/retained count·retained bytes를 둔다. 기본은 count 각 65,536, bytes 256 MiB이며 stage `allocation`으로 별도 설정한다. `allocation`이 없는 llama.cpp stage는 [resource-profile.ts](../packages/studio_domain/src/common/protocol/deployments/resource-profile.ts)가 그 stage의 `resource_profile`로 산정한 값이 기본보다 크면 그 값을 보낸다: `3 × max_completion_retained_bytes`에 요청별 terminal·release receipt와 token window 예약을 더한 상한 추정이다. P4 `minimum_completion_store_bytes`의 정확한 값은 Rust 내부 크기에 의존하므로 복제하지 않는다. 명시한 `allocation`은 그대로 보낸다. LOAD 직전 `validateDeploymentLoad`가 profile version 2와 필수 필드를 확인하며, 저장된 draft에는 요구하지 않는다. adapter resource profile은 기존 opaque payload 안에 보존한다.
- 브라우저가 correlation/causation/source/target/adapter를 검증한다. domain은 metadata node/generation/operation/kind/content type, success resource state, opaque load generation을 검증한다. llama.cpp는 모든 stage의 build agreement도 통과해야 ready다. SESSION 준비·정상 추론은 별도다.
- `status`, `resource_state`, 최초 실패, cleanup 오류는 독립적으로 기록한다. LOAD 성공은 `succeeded/present`, UNLOAD 성공은 `succeeded/absent`다. 거부의 `absent`는 부재 증거이며 성공한 UNLOAD receipt가 아니다.

## Partial failure and recovery

정상 UNLOAD가 busy로 막힌 경우의 관리 drain·강제 자원 회수·에이전트 재기동 보강은 [후속 계획](agent-recovery-plan.md)을 따른다. 이 기능은 아직 구현하지 않았으며, 강제 재기동 뒤 노드 부재를 성공한 UNLOAD 영수증으로 바꾸지 않는다.

- 순차 LOAD 중 첫 실패 이후 새 stage를 시작하지 않는다. 성공/잔존/불명 stage를 역순으로 UNLOAD하고, 정리 실패가 있어도 다른 stage의 정리를 계속한다. LOAD 및 최초 cleanup 오류와 현재 결과를 보존한다.
- `rejected/present` LOAD는 기존 점유자의 노드일 수 있다. 해당 ID에 자동 UNLOAD를 보내지 않는다.
- 전송 전 연결 실패와 P4 `not_started`는 미전송 실패다. 전송 이후 timeout·잘린 결과·identity 불일치·단절은 결과 불명이다. 이 분류는 lifecycle 결과와 별도로 저장하며 미전송 요청을 remote 자원 소유권으로 승격하지 않는다.
- INSPECT에서 exact node ID가 없거나 UNLOAD가 `rejected/absent`이면 **현재 registry 부재**를 기록한다. 과거 LOAD가 실제 실행되지 않았다는 뜻이나 성공한 UNLOAD receipt라는 뜻은 아니다. 과거 attempt와 결과 불명은 이력으로 유지한다.
- 모든 stage의 현재 자원이 부재하고 실행 중 Studio 작업 lease가 없으면 기존 stage node ID를 유지하고 더 큰 node generation과 새로운 load generation으로 LOAD 재시도를 허용한다. 모델별 exclusive operation lease와 P4의 generation fence가 경합을 막는다. 보고된 generation 충돌이나 같은 ID의 잔존 점유는 성공으로 추정하지 않고 해당 stage 충돌로 처리한다.
- 과거 LOAD 전달 결과가 여전히 불명확하면 계획 편집·삭제는 계속 차단한다. 재적재는 같은 계획을 새 generation으로 재시도하는 동작이며 과거 이력을 지우지 않는다. 강제 복구 후에도 old/new attempt 증거를 합치지 않는다.
- broker의 높은 node generation 기억은 현재 agent 프로세스 수명이다. INSPECT는 boot/incarnation ID를 아직 제공하지 않으므로 에이전트 재시작이 포함된 경합은 이를 이용해 미실행을 증명할 수 없다. 재시도에서 실제 세대 충돌·잔존 노드가 발견되면 그 보고된 identity를 근거로 복구해야 한다.
- INSPECT `lifecycle_state`/`lifecycle_result`는 opaque adapter snapshot보다 우선한다. `empty`/`unloaded` 문자열이 남은 등록은 제거 완료가 아니다. INSPECT에는 adapter load generation이 없어 loaded presence를 이 모델의 ready로 승격하지 않는다.

## UI and migration

- 모델 및 노드 UI UNLOAD는 [browser-local inference cancellation](../packages/studio_domain/docs/api.md#inference-cancellation)을 먼저 실행한다. 다음 웨이브 차단 → 미완료 PREFILL의 원래 연결에서 CANCEL → terminal/RELEASE 대기 → 최신 LOAD 소유권 검증 → Agent-target UNLOAD 순서다. 확인되지 않은 취소는 `unknown`을 보존하고, 실제 자원 제거는 UNLOAD lifecycle result로 별도 판정한다. 다른 브라우저 실행의 취소 완료나 즉각적인 GPU 정지를 이 순서로 주장하지 않는다.

- `/models/new`, `/models/:id/edit`: agent별 **적재 stage 추가**로 새 ID를 계획하고 계획된 stage끼리만 순서를 연결한다. 기존 관측 노드는 조회 전용이다. 동일 agent/GPU에 여러 stage를 계획할 수 있다.
- legacy `createNode` 입력은 schema가 제거한다. `creating` 과거 상태는 이력 표시용이며 새 실행에서 만들지 않는다.
- 단독 노드 선언 API `POST /api/agents/:id/nodes`는 410이다. 이전 노드 등록 deep URL은 수명 설명과 모델 배치 진입을 제공한다. 과거 SQLite 선언·파이프라인 데이터는 삭제하지 않는다.
- server-side deployment runner/socket은 제거했다. 서버는 저장과 opaque WebSocket/TCP bridge만 소유한다. P4 원본은 빌드/실행 의존성이 아니다.

검증: [검증 계약](testing.md), [runtime 반례](../packages/studio_domain/src/common/protocol/deployments/runtime.test.ts), [Rust가 소비하는 고정 fixture](../packages/p4-protocol/src/event/lifecycle.test.ts). 이 변경의 로컬 fixture 검증은 실제 P4 모델·다중 머신 추론 수용이 아니다.
