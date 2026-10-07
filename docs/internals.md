# Internals

SQLite schema는 서버 시작 시 멱등적으로 생성된다. 관계 삭제는 foreign key로 보호한다. 서버는 agent monitor를 실행하지 않는다. browser bridge가 SQLite의 agent ID를 확인한 뒤 연결한 TCP socket은 WebSocket binary bytes를 그대로 전달하며 P4 event frame을 읽거나 생성하지 않는다.

기존 `agents.adapter` 컬럼은 시작 시 제거한다. 어댑터는 노드와 모델 레코드에만 저장한다.

P4 관측 snapshot은 SQLite에 저장하지 않는다. 등록·편집은 `pending` 관리 상태만 반환한다. browser-owned P4 session의 inspection/operation 결과는 해당 브라우저의 live model에만 반영하며, timeout·단절은 확인된 실패가 아니라 `unknown` receipt로 저장한다.


브라우저 연결 종료는 FINISH(0-length frame)→framed ACK→WebSocket close 순서이며30s 안에 ACK가 없으면 확인 실패다. pending operation은 unknown으로 끝나며 요청/정산/KV 완료로 변환하지 않는다. 서버는 브라우저가 사라졌을 때 transport FINISH만 쓰고 TCP close를 기다리며30s 뒤 reset한다. SIGTERM/SIGINT는 이 회수를 기다리고 Compose init/35s grace가 이를 지원한다. 이벤트 해석·응답 일치는 계속 브라우저 소유다. [연결 회수 회귀](../apps/studio/src/server/agent-socket/finish.test.ts).
