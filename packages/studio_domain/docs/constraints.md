# Constraints

- `front`의 [AgentRemovalStore](../src/front/model/agents/removal.ts)는 [AgentRemovalDialog](../../../apps/studio/src/front/features/agents/AgentRemovalDialog.tsx)와 목록/상세 삭제 버튼이 소비한다. 진행 중 대상 교체·중복 요청을 차단하고 거부/전송 실패 시 대상을 보존한다.

| Subpath | Consumers | Invariants |
| --- | --- | --- |
| `/common` | Studio HTTP·영속화·프런트 API 소비자 | browser/node 전용 I/O 없이 동일 schema로 요청·응답 해석; 선언과 실행 결과 구분 |
| `/server` | Studio 배치 검증 소비자 | P4 실행 I/O 없음; adapter payload 생성 규칙 보존 |
| `/front` | Studio `useModel`·i18n·언어 선택 | React 의존 없음; model이 원본; slice별 구독과 unsubscribe 보존 |

패키지는 `apps/`나 `F:/dev/p4` 구현을 import하지 않는다. llama.cpp plan 문법은 common의 adapter payload 모듈에서 UI/서버가 함께 사용하며 backend 중립 wire 패키지로 옮기지 않는다. 관측된 하드웨어 수치를 제품 배치 성공으로 해석하지 않는다. [원문 인자와 실기 예제 계약](model-configurations.md)을 따른다.

이 패키지는 DOM을 렌더하지 않는다. 화면 locator는 [앱 constraints](../../../apps/studio/docs/constraints.md)와 [Studio testing](../../../docs/testing.md)이 소유한다.

`/front` inference timing의 소비자는 browser inference gateway와 query/history 표다. 전송·수신은 같은 monotonic clock을 사용하며 전송 시각은 각 요청의 실제 `WebSocket.send()` 직전에 잡는다. 반복 웨이브는 최초 요청이나 이전 웨이브의 기준점을 공유하지 않는다. 첫 토큰은 TPS 분자에서 제외한다. 완료 전 final TPS와 관측 구간이 없는 TPS는 null이다. 실행 요약은 평균 TTFT 대신 p50·p95·최댓값을 사용한다. [계산·기록 이행 계약](api.md#inference-timing)을 따른다.

인퍼런스 모니터링 집계는 active run의 session ID와 구성 stage identity를 통과한 batch/span만 더한다. batch `observation_id`와 span execution/time identity를 중복 제거하며, stage 간 처리 행의 합은 파이프라인 전체 고유 토큰 수로 해석하지 않는다. 원시 snapshot 보존 한도와 누적 summary를 분리한다.

요청별 모니터링은 `owned_requests`와 stage execution owner가 확인된 event만 더한다. 요청에 귀속된 stage 시간은 함께 실행된 공유 batch 시간이며 요청 전용 compute 시간이 아니다. batch fill은 physical rows / observation의 `scheduling.max_issue_rows`(P4 `SchedulingSnapshot`, 실행 시점 issue-row 상한)로 계산한다. 이 값이 0(상한 없음)이거나 `scheduling`이 없는 producer의 관측은 배포에 저장된 configured UBATCH로 fallback하고 `configured`로 구분해 집계한다(`batchFillFallbackSamples`, `fallbackCapacityRows`); 둘 다 없으면 분모를 만들지 않고 fill sample도 기록하지 않는다. 분모는 physical batch가 아니라 observation 단위로 정해져 graph와 요청 fill이 같은 값을 쓰며, 분자는 계속 physical batch rows다. `max_issue_rows`는 issue 선택 상한이지 physical 용량 자체가 아니다: P4는 atomic 후보가 있으면 이 상한을 적용하지 않아 fill이 1을 넘을 수 있고, 실제 n_ubatch가 상한보다 작으면 fill이 낮게 나온다(둘 다 Studio가 보정하지 않는다). batch fill은 건강 점수나 최적화 목표로 쓰지 않는다. `ready_rows`는 issue 순간의 표본이며 지속 queue 길이가 아니다. bytes가 없는 stage span에서 네트워크 대역폭을 만들지 않는다.

`/common` graph-inventory의 소비자는 Studio HTTP router/SQL/frontend gateway, `/front` GraphInventoryStore의 소비자는 모델 그래프·이름 편집·노드 inspector다. 관리 이름 변경은 P4 nodeId/generation·배치 연결을 바꾸지 않는다. 관측 갱신은 Studio 이름을 덮어쓰지 않으며 실패는 기존 관측을 삭제하지 않는다. [관리 메타데이터](../../../apps/studio/docs/usage.md#managed-metadata)의 저장·확장 경계를 유지한다.
## Agent group consumers

- `common` agent-group schema/routing consumers: [SQLite repository](../../../apps/studio/src/server/database/agent-groups.ts), [HTTP router](../../../apps/studio/src/server/api/agent-groups.ts), [browser reception](../../../apps/studio/src/front/p4/reception.ts), [inspection](../../../apps/studio/src/front/p4/inspection.ts). 중복 소속·그룹 밖 대표·삭제된 대표를 직접 접속 fallback으로 바꾸지 않는다.
- `front` AgentGroupsStore consumer: [AgentGroupsView](../../../apps/studio/src/front/features/agent-groups/AgentGroupsView.tsx). draft는 React 밖에 있고 API 성공 후 topology를 갱신한다. 임시 UI 설정을 원격 연결 성공으로 표시하지 않는다.

`common` lifecycle/runtime 소비자는 browser model gateway다. 최종 Agent 결과의 node/generation/operation/adapter 및 opaque load generation을 검증하고 첫 오류·cleanup 오류를 보존한다. `rejected/present` LOAD의 기존 노드는 회수 대상이 아니다.
