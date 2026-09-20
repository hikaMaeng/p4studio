# Architecture

이 프로젝트는 `F:/dev/p4` 에이전트의 OUTER 웹클라이언트다. P4와의 역할·명령 흐름·기능별 소스 참조는 [P4 참조 안내](p4-reference.md), 구현 규칙은 [AGENTS.md](../AGENTS.md)가 소유한다. 도메인 규칙의 내부 탐색은 [studio_domain 구조](../packages/studio_domain/docs/architecture.md)에서 시작한다.

- `apps/studio`: Express API와 Vite React UI를 함께 소유하는 단일 서비스 모듈
- `packages/p4-protocol`: P4 공개 event-v3 codec와 TCP length framing 경계
- SQLite: UI가 소유하는 에이전트, 노드, 모델, 파이프라인 지식
- Browser P4 owner: 브라우저는 deployment/inference마다 same-origin WebSocket 세션을 열고, OUTER endpoint·event/correlation/causation ID·순서·응답 판정을 소유함
- Server bridge: 저장된 agent ID만 인가한 뒤 [browser bridge](../apps/studio/src/server/agent-socket/browser-bridge.ts)가 WebSocket binary와 P4 TCP bytes를 decode·reframe 없이 양방향 전달함. 서버는 P4 명령·응답 매칭·토큰 stream을 소유하지 않음
- Network: 브리지는 [TCP dial routing](../apps/studio/src/server/agent-socket/routes.ts)과 runtime 소유 SSH tunnel을 이용할 수 있으나, 이는 TCP 목적지만 바꾸며 P4 event 의미를 해석하지 않음
- Inference observability: 현재 P4 증거, Studio가 계산할 운영 지표, 추가 P4 계약의 경계는 [추론 관측 설계](inference-observability.md)가 소유함

프로덕션에서는 Express가 `dist/front`를 정적으로 제공한다. 개발에서는 Vite가 `/api`를 Express로 프록시한다.

에이전트 관리 이름·호스트·포트와 Studio 노드 선언은 SQLite의 관리 데이터다. 등록·편집은 P4 연결을 열지 않는다. 브라우저가 직접 요청한 관측은 브라우저 세션의 관측값이며, SQLite 선언이나 과거 receipt를 현재 P4 상태로 승격하지 않는다.

접수 경로는 [에이전트 게이트웨이 그룹](../packages/studio_domain/docs/api.md#agent-groups)이 소유한다. 그룹별 대표는 노드 소유 여부와 독립적이며, 그룹 밖 에이전트는 직접 연결한다. 에이전트 상세·노드 조회와 모델 그래프 조회의 [inspection](../apps/studio/src/front/p4/inspection.ts), 모델 LOAD/UNLOAD, 추론 SESSION/PREFILL은 모두 [브라우저 접수 연결](../apps/studio/src/front/p4/reception.ts)을 사용한다. 작업 시작 시 캐시 없이 읽은 topology를 고정하고 대상별 그룹을 선택한다. 그룹 정보 누락은 직접 연결 허용으로 해석하지 않는다. 모델의 stage 배치·실행 순서는 그대로 유지한다.

노드 수명·다중 stage 회수의 계약과 소비자는 [노드 수명](node-lifecycle.md)이 소유한다. 저장된 stage는 적재 계획이며 기존 노드를 연결하는 빈 슬롯이 아니다.
