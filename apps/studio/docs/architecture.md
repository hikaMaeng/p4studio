# Architecture

`src/server`는 env, database, REST API, P4 agent inspection client, in-memory observation store를 소유한다. `src/front`는 shell과 agents/models/pipelines feature를 분리한다. `src/common`에는 이 서비스 내부의 API DTO만 둔다.

registration과 Studio node declaration은 SQLite에 저장한다. 프로토콜이 보고한 machine facts와 live node registry는 observation store에만 두고 등록 직후, 주기 monitor, 카드별 새로고침에서 갱신한다.
