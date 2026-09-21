# P4 참조 안내

이 문서는 P4 Studio가 OUTER로 구현해야 할 책임과 `F:/dev/p4`에서 계약을 찾는 경로를 정리한다. 작업 규칙은 [AGENTS.md](../AGENTS.md), Studio 내부 구조는 [architecture.md](architecture.md)가 소유한다. P4 명세를 복제하는 문서가 아니다.

2026-09-19 현재 계약 대조: P4 HEAD `4df7496b92c9c84efddb4a908ab56ea0b5c6e77f`, clean. event-v3/inspection schema v1은 유지되고, agent inspection의 `transport.transfer`에 누적 `hop_data_writes`·`hop_data_bytes`가 추가됐다. Studio는 이를 agent-wide 관측값으로만 보존·표시하며 request/edge별 bytes나 MB/s로 바꾸지 않는다. `tools/event-drive`의 Release A source-grounded oracle·측정 barrier·증거 봉인은 benchmark driver의 수용 계약이지 P4 agent의 새 browser/Studio API가 아니다. [Studio 적용 계약](node-lifecycle.md). 아래 최초 조사 기록은 역사다.

2026-09-21 텔레메트리 계약 대조: P4 HEAD `945fc359e625a96ad06080415a606038078c2684`(작업 트리는 dirty였고 `layers/adapters/llamacpp/staged/adapter/src/v2/{mod,commands}.rs`의 커밋되지 않은 변경을 포함한 작업 트리 내용을 읽음). 현재 llama.cpp adapter는 `application/vnd.p4.llamacpp.batch-observation-v5+json`과 `stage-span-v5+json`을 방출하며 v4 대비 `BatchRequestObservation`·`StageRequestObservation`에 필수 `reply`(ReplySpec)가 추가됐다. Studio는 정확한 v5 content type만 소비하고 다른 버전의 같은 계열은 현재 계약으로 취급하지 않는다. 이 대조는 실행 시험이 아니며 실기 Studio 검증은 별도 결과다.

## 조사 기준과 권위

2026-09-11 조사 시작: P4 HEAD `11dc7a0ce74460a8b3390d057bb097684cb28c90`, 당시 clean tree. Studio HEAD `b22ed898b1dd0a6e5e79a7fe8b58166427cfec67`; 모델 제어와 에이전트 UI의 다른 작업이 진행 중이었다. P4에도 조사 중 다른 작업의 증거 문서가 추가됐다. 아래 구현 설명은 이때 읽은 소스 범위이며 실행 시험을 새로 수행했다는 뜻이 아니다.

P4 경로는 이 문서에서 `../../p4/`로 연결한다. 다른 환경에서는 실제 P4 checkout 루트로 해석한다. 소스 참조 위치와 제품 런타임 의존성을 혼동하지 않는다.

| 확인하려는 것 | 기준 |
| --- | --- |
| Studio 제품 역할·구현 규칙 | [AGENTS.md](../AGENTS.md)와 현재 사용자 요구 |
| P4 현재 상태·후속 작업 | [로드맵 current-status](../../p4/docs/distributed-batching-roadmap.md#current-status) |
| 명세의 소유자·과거 문서 지위 | [document-map.md](../../p4/docs/document-map.md) |
| 계층 책임·engine 변경 범위 | [layer-isolation-contract.md](../../p4/docs/layer-isolation-contract.md) |
| 실제 지원 wire·명령·오류 | 현재 실행 진입점과 생산자/소비자 코드·시험 |
| 과거 선택의 이유 | 아래 Codex 세션 기록; 현재 구현/배포 성공의 대체 증거로 사용하지 않음 |

예를 들어 `RELEASE·SETTLE 예산 검사 연결` 세션의 봉인 완료 보고와 조사 시점의 로드맵·릴리즈 노트에 있는 후보/BLOCKED 상태는 일치하지 않았다. 과거 완료 문구를 최신 상태로 복사하지 않고 현재 소스·증거·tag/바이너리 결속을 다시 확인한다. 이 문서는 해당 릴리즈 상태를 재판정하지 않는다.

## 역할과 데이터 흐름

```text
브라우저 UI ── Studio HTTP API ── SQLite 관리 지식/작업 기록
                                  │ 관리·조회용 소켓 연결
                                  ▼
OUTER endpoint ── entry agent ── target agent ── node ── adapter ── engine/backend
       ▲               └───────────── forwarding ──────────────┘
       └────────────── return_route의 결과 event ──────────────┘
```

현재 P4 agent는 TCP만 받으며 브라우저 WebSocket endpoint는 제공하지 않는다. 따라서 Studio는 browser-owned WebSocket session과 server-owned TCP dial을 결합한다. 서버 bridge는 P4 frame을 해석하지 않고 bytes만 전달하고, 브라우저가 native P4 frame 생성·응답 소비·추론 상태를 소유한다. 이는 서버가 추론을 중계하거나 P4 OUTER가 되는 구조가 아니다.

| 객체/계층 | 소유하는 것 | 혼동하면 안 되는 것 |
| --- | --- | --- |
| Studio OUTER | 주소·관리 이름, 모델 파일과 template/옵션, adapter 선택, stage 계획, 전체 topology, 작업/세션 identity | P4가 자동 모델 탐색·분할·배치 계획을 만든다는 가정 |
| P4 agent | 자기 노드 registry, endpoint 전달, 공통 순서·큐·backpressure | 에이전트 하나 = GPU 하나 = 노드 하나라는 고정 대응 |
| node | 모델 또는 구간의 적재 인스턴스; LOAD에서 ID 점유, UNLOAD 성공에서 제거 | 재사용 가능한 빈 노드 슬롯이라는 가정 |
| concrete adapter | payload 해석, 실제 모델/컨텍스트 적재, KV·배치·실행·정산 | llama.cpp 전용 의미를 공통 P4 protocol로 승격 |
| engine/backend | llama.cpp의 모델 실행과 ggml/CUDA/CPU 등의 실제 연산 | llama.cpp adapter와 CUDA backend를 동일한 선택 계층으로 취급 |

현재 [control.rs](../../p4/entrypoints/agent/src/event_runtime/control.rs)의 `begin_load`와 [adapters.rs](../../p4/entrypoints/agent/src/event_runtime/adapters.rs)의 kind/factory가 지원을 결정한다. llama.cpp와 feature-enabled HF의 수명 계약이 구현됐으며 vLLM/SGLang을 지원한다고 추론하지 않는다.

## 모델 작업의 단계

1. **선언:** Studio가 모델 카탈로그와 실행 배치를 구분해 저장한다. 배치는 ordered stages, 각 agent/node/generation, 모델 파일, `[layer_begin, layer_end)`, device/offload, context/batch, adapter 인자를 가진다.
2. **수명 요청:** Agent endpoint에 NODE_LOAD를 보낸다. 공통 metadata는 node identity·adapter identity·네 allocation capacity를 포함하고 실제 모델 입력은 opaque bytes다. 별도 CREATE는 없다.
3. **적재:** agent가 ID 점유·adapter 생성·적재를 수행한다. Agent의 lifecycle-result와 내부 adapter 결과를 결속해 모든 필수 stage의 동일 작업·세대를 확인한다. 실패 시 OUTER가 성공/잔존 stage를 회수하고 미해결 결과를 추적한다.
4. **추론 구성:** 현재 llama.cpp `SessionCommand`는 `load_generation`, `session_id`, 전체 ordered `stages`, 해당 노드의 `stage_index`를 요구한다. 각 노드의 SESSION_READY를 확인한다. 현재 구현은 구별되는 head/tail, 최소 두 stage를 요구하며 이는 모든 P4 adapter에 강제할 공통 규칙이 아니다.
5. **실행·종료:** 추론의 승인된 OUTPUT, 종료와 RELEASE receipt를 각 계약대로 소비한다. Agent-target UNLOAD의 succeeded/absent와 adapter Unloaded를 확인한다. 별도 DELETE는 없다. 출력·정산·해제·소켓 종료를 같은 완료로 취급하지 않는다.

`tools/event-drive`는 위 흐름의 실제 요청 생산자/결과 소비자 예시다. 현재 드라이버는 동일 agent의 LOAD를 직렬화하고 서로 다른 agent의 LOAD를 wave로 구성한다. 이 실험 정책이나 고정 포트·모델·시나리오를 Studio 제품 제약으로 그대로 복사하지 않는다.

모든 모델 경로와 staged binary 경로는 대상 머신 기준이다. 관리 API 서버의 드라이브 접근 성공이 원격 agent 계정의 접근 성공을 보장하지 않는다. 합법적인 stage cut·메모리/부하 여유·build identity는 adapter 응답과 해당 모델/backend 검증을 따른다.

<a id="source-map"></a>

## 기능별 참조표

| 작업 | P4 계약/소스와 읽을 심볼 | Studio 적용 위치와 영향 |
| --- | --- | --- |
| 기본 runtime 확인 | [main.rs](../../p4/entrypoints/agent/src/main.rs): `main`, `P4_AGENT_SERVICE_RUNTIME` | event runtime이 기본. service 경로 예제를 선택하지 않음 |
| envelope·endpoint·identity | [event/mod.rs](../../p4/layers/protocol/src/event/mod.rs): `Envelope`, `Endpoint`, `OuterEndpoint` | [p4-protocol](../packages/p4-protocol/docs/architecture.md); 모든 wire 소비자 영향 |
| 바이트 codec·framing | [event/wire.rs](../../p4/layers/protocol/src/event/wire.rs): `encode/decode`; [transport.rs](../../p4/entrypoints/agent/src/event_runtime/transport.rs): `read_event/write_event` | TS codec과 socket 수신기. 길이·정수·누적 버퍼 검증 |
| agent 조회·노드 적재/제거 | [control.rs](../../p4/entrypoints/agent/src/event_runtime/control.rs): `run/begin_load/begin_unload/lifecycle_reply`; [inspection/mod.rs](../../p4/entrypoints/agent/src/event_runtime/control/inspection/mod.rs): `snapshot` | [inspection client](../apps/studio/src/server/agent-socket/inspection/client.ts): `inspectAgent`; 관리 노드와 live registry 분리 |
| 머신·agent 관측 정보 | [hardware.rs](../../p4/entrypoints/agent/src/event_runtime/control/inspection/hardware.rs), [transport.rs](../../p4/entrypoints/agent/src/event_runtime/transport.rs): `Inspector::snapshot`, [agent inspection 계약](../../p4/docs/event-protocol-v2.md#agent-inspection) | [agent-inspection.ts](../packages/p4-protocol/src/event/agent-inspection.ts): `decodeAgentInspectionResponse`; capability/occupancy/probes와 누적 `transport.transfer`를 decode하고 필드 부재는 unavailable로 보존 |
| LOAD·SESSION payload | [v2/mod.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/mod.rs): content types; [commands.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/commands.rs): `LoadCommand`, `SessionCommand`, `UnloadCommand`; [resource_profile.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/resource_profile.rs) | [도메인 구조](../packages/studio_domain/docs/architecture.md)의 server 규칙. llama LOAD v4에는 adapter-owned `resource_profile`가 필수이며, `--memory-topology`와 실제 backend device 이름도 plan에 명시한다. adapter 전용 payload를 공통 codec에서 분리 |
| 전체 명령 순서·응답 귀속 | [run/mod.rs](../../p4/tools/event-drive/src/run/mod.rs): `session_events`, `Sender::event`; [load.rs](../../p4/tools/event-drive/src/run/load.rs): `drive`; [replies.rs](../../p4/tools/event-drive/src/run/replies.rs): `ExpectedReply`, `receive_exact` | stage별 작업 상태, causation/source/generation 검사. HTTP 수락을 완료로 취급하지 않음 |
| 재연결·timeout·분할 수신 | [run/wire.rs](../../p4/tools/event-drive/src/run/wire.rs): `EventWire`; [wire/tests.rs](../../p4/tools/event-drive/src/run/wire/tests.rs) | 취소/timeout 후 미완성 프레임 보존. 재연결 identity와 부분 응답 관리 |
| 레이어 cut·메모리·실행 인자 | [llamacpp-stage-memory.md](../../p4/docs/llamacpp-stage-memory.md), [server/plan.cpp](../../p4/layers/adapters/llamacpp/staged/server/src/server/plan.cpp), [run/config.rs](../../p4/tools/event-drive/src/run/config.rs): `NodeConfig` | Studio stage 계획/검증. backend 실제 메모리 계산은 복제하지 않음 |
| build·지원 구성 대조 | [build_identity.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/build_identity.rs): `BuildIdentity`, `agree`; [load.rs](../../p4/tools/event-drive/src/run/load.rs) | Loaded 응답의 build/patch/backend 일치 확인; GPU/모델 정보만으로 호환 판정 금지 |
| 추론 결과·지속 관측·실패/정리 | [inference.rs](../../p4/tools/event-drive/src/run/inference.rs), [observe.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/observe.rs), [effects.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/effects.rs), [run/mod.rs](../../p4/tools/event-drive/src/run/mod.rs), [failure CLI test](../../p4/tools/event-drive/tests/cli_writes_the_artifact_of_a_failed_run.rs) | `batch-observation-v5`·`stage-span-v5`(request 소유 항목의 `reply` return context 포함)의 source/load/session identity, 승인 출력/부분 결과, 최초 오류, `cleanup_error`, `evidence_missing` 구분 |
| KV·heartbeat·재개 | [protocol-outer.md](../../p4/docs/protocol-outer.md), [kv-state-store-convention.md](../../p4/docs/kv-state-store-convention.md), [layer isolation](../../p4/docs/layer-isolation-contract.md) | 분야 목표와 현재 event 구현을 대조. service 경로 구현을 event 지원으로 광고하지 않음 |
| 시나리오·성능 결과 | [p4-4node README](../../p4/test/benchmarks/p4-4node/README.md), [scenarios.mjs](../../p4/test/benchmarks/p4-4node/scenarios.mjs), [검증 규약](../../p4/docs/distributed-batching-verification.md) | 입력 예시/시험 설계에 사용. report metrics version·분모·정상 응답·topology 확인 |

## wire를 구현할 때 지킬 차이

- 파일명이 `event-protocol-v2.md`이고 Rust 모듈이 `v2`여도 현재 event envelope version은 **3**, magic은 **`P4E3`**다. TCP는 `u32 little-endian length + encoded event`다. event 내부에는 magic, envelope 길이, payload 길이, envelope, payload가 있다.
- 옛 frame version 8, status schema 6, inspection snapshot schema 1, adapter별 content-type version은 서로 다른 버전 축이다. 모든 명령의 suffix를 일괄 v3로 바꾸지 않는다. 현재 SESSION v4와 OUTPUT v5 같은 값은 adapter의 상수를 확인한다.
- endpoint의 node generation, adapter load generation, OUTER connection generation과 session/request/event identity는 수명이 다르다. UUID 하나로 합치지 않는다. source/target/return_route와 요청-응답 identity를 검사한다.
- inspection `transport.transfer.hop_data_writes`와 `hop_data_bytes`는 agent 전체 수명에서 P4 DATA hop을 성공적으로 write한 누적 counter다. 개별 request·stage·edge 소유, 수신 byte, retry/queue 시간, 측정창 경계가 없으므로 per-run 전송량·대역폭·완료 증거로 사용하지 않는다.
- UNLOAD 성공은 자원과 노드의 제거 완료다. DB 행 삭제는 UNLOAD가 아니다. busy/단절 뒤 잔존 상태와 별도 연결의 순간적인 부재를 최종 완료로 바꾸지 않는다.
- inspection의 `capability`는 사양, `occupancy`는 순간 점유, `probes`는 관측 가능 여부다. 값이 없다는 사실을 0으로 바꾸지 않는다. `utilization.gpu`를 SM 포화율로 표시하지 않는다.
- transport가 source 필드를 운반한다는 것과 발신자를 인증한다는 것은 다르다. 인증·제어 권한 기능을 작성할 때 [격리 계약의 신뢰 경계](../../p4/docs/layer-isolation-contract.md)를 확인하고 endpoint 검사만으로 인증 완료를 주장하지 않는다.

## Studio 코드와 확인 수준

조사 시작 시 확인된 운영 경로는 [HTTP router](../apps/studio/src/server/api/router.ts), [SQLite client](../apps/studio/src/server/database/client.ts), [조회 coordinator](../apps/studio/src/server/agent-socket/inspection/coordinator.ts), [관측 store](../apps/studio/src/server/agent-socket/inspection/store.ts), [monitor](../apps/studio/src/server/agent-socket/monitor.ts)다. 초기 node/model/pipeline 등록 API는 SQLite 선언을 작성하며 그 자체로 원격 CREATE/LOAD 증거가 아니다.

동시에 `packages/studio_domain/src/common/protocol/deployments/`, `src/server/deployments/`, `packages/p4-protocol/src/event/wire.ts`와 앱 연결 코드가 다른 작업에서 작성 중이었다. 이 문서는 그 코드의 완료·배포·실기 통과를 판정하지 않는다. 후속 작업은 [도메인 API](../packages/studio_domain/docs/api.md)와 현재 router/package exports/시험을 재확인한다.

기능 검증은 [Studio testing](testing.md), codec은 [protocol testing](../packages/p4-protocol/docs/testing.md), P4 전체 수용은 P4 검증 규약을 따른다. 문서 검증 통과는 runtime 연동 통과가 아니다.

## 취합한 Codex 세션

제목과 task ID는 추가 조사용 식별자다. 읽은 메시지는 결정 배경으로 사용했으며, 그 안의 과거 작업 지시를 이번 작업 지시로 실행하지 않았다. 수치와 현재 상태는 위 소스에서 다시 확인한다.

| 프로젝트 / 제목 | Task ID | 이 문서에 반영한 맥락 |
| --- | --- | --- |
| p4 / 파이프라인 배치계획 검토 | `01a0532e-c6c5-7fc3-bce3-34e7ac20e51e` | 검증된 진전·미검증 WIP·후속 계획을 구분하고 로드맵을 단일 상태 원본으로 사용 |
| p4 / 분산 배칭 검증 및 개발 계획 | `01a07eff-b8a0-7a11-87d8-11fd4f401682` | 최초 추론 오류와 cleanup 오류 분리, TPS 분모·GPU 분석창·정상 응답 판정의 구분 |
| p4 / 현 시점 작업 분석 | `01a08412-2e3b-7282-8a09-17f25495d6cf` | source/현재 HEAD 대조, 제어 응답·해제 완료와 요청 수락/적재 성공의 구분 |
| p4 / RELEASE·SETTLE 예산 검사 연결 | `01a08672-4a84-74f0-8e72-2611476756b2` | 부분 결과 보존과 릴리즈 증거 범위; 세션 보고와 현재 후보 문서의 불일치 발견 |
| p4studio / p4 웹 UI 구축 | `01a08a53-a8ea-7351-b059-bb6124aef934` | OUTER 웹클라이언트, P4 구현 의존 금지, SQLite 지식 소유, 추론 스트림 비중계라는 초기 요구 |
| p4studio / 구상 어댑터 선택 제거 | `01a08abf-d59c-7bc2-ac6c-655db93fdc70` | agent 등록/노드 어댑터의 분리, 관리 이름과 live hardware/node 관측 분리 |
| p4studio / P4 프로토콜 기반 모델 메뉴 재구축 | `01a08c4a-781b-75c1-8582-5a09e11de1c1` | 실행 모델은 여러 agent의 node별 레이어 적재로 실체화하며 완료 보고가 OUTER로 돌아온다는 요구; 진행 중 구현은 검증 사실에서 제외 |

새 세션은 전체 대화를 다시 읽지 않고 작업별 소스표부터 시작한다. 계약 의도가 모호할 때 위 task를 `read_thread`로 읽고 필요한 이전 페이지로 내려간다.
