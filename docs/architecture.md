# Architecture

- `apps/studio`: Express API와 Vite React UI를 함께 소유하는 단일 서비스 모듈
- `packages/p4-protocol`: P4 공개 프로토콜 버전·event-v3 agent inspection wire 경계
- SQLite: UI가 소유하는 에이전트, 노드, 모델, 파이프라인 지식
- Agent observation store: 머신·P4 등록 노드 snapshot을 프로세스 메모리에 보관
- TCP monitor: 동시성 제한 아래 표준 P4 조회 이벤트를 보내며 추론 payload를 전송하거나 중계하지 않음
- Network: 내부 서비스용 격리 network와 P4 agent/LAN 및 host publish용 edge bridge를 분리

프로덕션에서는 Express가 `dist/front`를 정적으로 제공한다. 개발에서는 Vite가 `/api`를 Express로 프록시한다.

에이전트 관리 이름·호스트·포트와 Studio 노드 선언은 SQLite의 관리 데이터다. 등록정보 수정 시 새 주소를 즉시 재조회한다. 머신 정보와 에이전트 내부 노드 목록은 에이전트가 P4 event-v3로 보고한 관측 데이터이며 재시작 후 다시 조회한다.
