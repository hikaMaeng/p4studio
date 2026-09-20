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
- metadata에 node ID/generation, adapter kind/content type, LOAD의 queue/completion/retained count·retained bytes를 둔다. 기본은 count 각 65,536, bytes 256 MiB이며 stage `allocation`으로 별도 설정한다. adapter resource profile은 기존 opaque payload 안에 보존한다.
- 브라우저가 correlation/causation/source/target/adapter를 검증한다. domain은 metadata node/generation/operation/kind/content type, success resource state, opaque load generation을 검증한다. llama.cpp는 모든 stage의 build agreement도 통과해야 ready다. SESSION 준비·정상 추론은 별도다.
- `status`, `resource_state`, 최초 실패, cleanup 오류는 독립적으로 기록한다. LOAD 성공은 `succeeded/present`, UNLOAD 성공은 `succeeded/absent`다. 거부의 `absent`는 부재 증거이며 성공한 UNLOAD receipt가 아니다.

## Partial failure and recovery

- 순차 LOAD 중 첫 실패 이후 새 stage를 시작하지 않는다. 성공/잔존/불명 stage를 역순으로 UNLOAD하고, 정리 실패가 있어도 다른 stage의 정리를 계속한다. LOAD 및 최초 cleanup 오류와 현재 결과를 보존한다.
- `rejected/present` LOAD는 기존 점유자의 노드일 수 있다. 해당 ID에 자동 UNLOAD를 보내지 않는다.
- timeout·잘린 결과·identity 불일치·단절은 결과 불명이다. 회수에 새 OUTER channel을 사용하며 LOAD를 재전송하지 않는다. 아직 loading이면 UNLOAD가 거부될 수 있으므로 기록을 유지하고 사용자가 다시 상태 확인/회수할 수 있다.
- 원래 LOAD가 불명일 때 별도 연결의 UNLOAD `rejected/absent`나 INSPECT 부재는 늦게 도착할 LOAD의 미실행 증명이 아니다. 불명을 지우지 않으며 자동 무한 재시도/새 LOAD를 만들지 않는다. 성공한 동일 generation UNLOAD가 와야 회수 확정이다.
- 회수 필요 stage가 있으면 UI와 HTTP가 편집·재적재를 차단한다. 해소 후 ID는 유지하고 더 큰 node generation과 새로운 load generation을 부여한다. actual generation을 receipt의 `stageGenerations`로 먼저 저장하고 SESSION·다음 회수에 사용한다.
- INSPECT `lifecycle_state`/`lifecycle_result`는 opaque adapter snapshot보다 우선한다. `empty`/`unloaded` 문자열이 남은 등록은 제거 완료가 아니다. INSPECT에는 adapter load generation이 없어 loaded presence를 이 모델의 ready로 승격하지 않는다.

## UI and migration

- `/models/new`, `/models/:id/edit`: agent별 **적재 stage 추가**로 새 ID를 계획하고 계획된 stage끼리만 순서를 연결한다. 기존 관측 노드는 조회 전용이다. 동일 agent/GPU에 여러 stage를 계획할 수 있다.
- legacy `createNode` 입력은 schema가 제거한다. `creating` 과거 상태는 이력 표시용이며 새 실행에서 만들지 않는다.
- 단독 노드 선언 API `POST /api/agents/:id/nodes`는 410이다. 이전 노드 등록 deep URL은 수명 설명과 모델 배치 진입을 제공한다. 과거 SQLite 선언·파이프라인 데이터는 삭제하지 않는다.
- server-side deployment runner/socket은 제거했다. 서버는 저장과 opaque WebSocket/TCP bridge만 소유한다. P4 원본은 빌드/실행 의존성이 아니다.

검증: [계획](../tests/plans/node-lifecycle-20260916.md), [runtime 반례](../packages/studio_domain/src/common/protocol/deployments/runtime.test.ts), [Rust가 소비하는 고정 fixture](../packages/p4-protocol/src/event/lifecycle.test.ts). 이 변경의 로컬 fixture 검증은 실제 P4 모델·다중 머신 추론 수용이 아니다.
