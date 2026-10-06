# Architecture

`src/server`는 env, database, REST API, P4 agent inspection client, in-memory observation store를 소유한다. `src/front`는 shell과 agents/models/pipelines feature를 분리한다. `src/common`에는 이 서비스 내부의 API DTO만 둔다.

registration과 Studio node declaration은 SQLite에 저장한다. 프로토콜이 보고한 machine facts와 live node registry는 observation store에만 두고 등록 직후, 주기 monitor, 카드별 새로고침에서 갱신한다.

작업 lease·Windows I/O·SQLite 회수 journal은 [server operations](../src/server/operations/recovery.ts)에 있다. [Windows runner](../src/server/operations/windows.ts)는 승인 host profile만 사용한다. [recovery front](../src/front/features/agent-recovery/model.ts)는 HTTP/P4 I/O를 domain model에 주입하며 React는 projection을 표시한다. [history view](../src/front/features/models/ModelHistory.tsx)는 현재 기록과 보존 이력을 페이지 단위로 표시한다.
