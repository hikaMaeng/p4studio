# Internals

SQLite schema는 서버 시작 시 멱등적으로 생성된다. 관계 삭제는 foreign key로 보호한다. 에이전트 모니터는 등록된 주소에 길이 prefix가 있는 P4 event-v3 inspection 요청을 보내 latency, reachability, 머신 facts, live node registry를 갱신한다. 기본 동시성은 8이며 이전 tick이 끝나기 전에는 다음 tick을 시작하지 않는다.

기존 `agents.adapter` 컬럼은 시작 시 제거한다. 어댑터는 노드와 모델 레코드에만 저장한다.

P4 관측 snapshot은 SQLite에 저장하지 않는다. 등록 직후와 주기 monitor, 수동 새로고침에서 in-memory observation store를 갱신한다. TCP 연결 후 wire 거부나 decode 실패가 발생하면 `reachable`은 유지하고 `inspection.state=error`로 분리한다.
