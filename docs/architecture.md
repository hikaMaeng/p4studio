# Architecture

이 프로젝트는 `F:/dev/p4` 에이전트의 OUTER 웹클라이언트다. P4와의 역할·명령 흐름·기능별 소스 참조는 [P4 참조 안내](p4-reference.md), 구현 규칙은 [AGENTS.md](../AGENTS.md)가 소유한다. 도메인 규칙의 내부 탐색은 [studio_domain 구조](../packages/studio_domain/docs/architecture.md)에서 시작한다.

- `apps/studio`: Express API와 Vite React UI를 함께 소유하는 단일 서비스 모듈
- `packages/p4-protocol`: P4 공개 event-v3 codec와 TCP length framing 경계
- SQLite: UI가 소유하는 에이전트, 노드, 모델, 파이프라인 지식
- Browser P4 owner: 브라우저는 deployment/inference마다 same-origin WebSocket 세션을 열고, OUTER endpoint·event/correlation/causation ID·순서·응답 판정을 소유함
- Server bridge: 저장된 agent ID만 인가한 뒤 [browser bridge](../apps/studio/src/server/agent-socket/browser-bridge.ts)가 WebSocket binary와 P4 TCP bytes를 decode·reframe 없이 양방향 전달함. 서버는 P4 명령·응답 매칭·토큰 stream을 소유하지 않음
- Network: 브리지는 [TCP dial routing](../apps/studio/src/server/agent-socket/routes.ts)과 runtime 소유 SSH tunnel을 이용할 수 있으나, 이는 TCP 목적지만 바꾸며 P4 event 의미를 해석하지 않음

프로덕션에서는 Express가 `dist/front`를 정적으로 제공한다. 개발에서는 Vite가 `/api`를 Express로 프록시한다.

에이전트 관리 이름·호스트·포트와 Studio 노드 선언은 SQLite의 관리 데이터다. 등록·편집은 P4 연결을 열지 않는다. 브라우저가 직접 요청한 관측은 브라우저 세션의 관측값이며, SQLite 선언이나 과거 receipt를 현재 P4 상태로 승격하지 않는다.
