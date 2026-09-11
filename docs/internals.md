# Internals

SQLite schema는 서버 시작 시 멱등적으로 생성된다. 관계 삭제는 foreign key로 보호한다. 서버는 agent monitor를 실행하지 않는다. browser bridge가 SQLite의 agent ID를 확인한 뒤 연결한 TCP socket은 WebSocket binary bytes를 그대로 전달하며 P4 event frame을 읽거나 생성하지 않는다.

기존 `agents.adapter` 컬럼은 시작 시 제거한다. 어댑터는 노드와 모델 레코드에만 저장한다.

P4 관측 snapshot은 SQLite에 저장하지 않는다. 등록·편집은 `pending` 관리 상태만 반환한다. browser-owned P4 session의 inspection/operation 결과는 해당 브라우저의 live model에만 반영하며, timeout·단절은 확인된 실패가 아니라 `unknown` receipt로 저장한다.
