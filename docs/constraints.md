# Constraints

- P4 저장소 또는 crate/package에 직접 의존하지 않음
- 서버는 P4 command, event 생성, event decode, 응답 매칭, 추론 token stream을 소유하지 않음
- 서버의 WebSocket bridge는 저장된 agent ID를 확인한 뒤 P4 TCP bytes를 투명 전달만 함; 브라우저가 세션 수명·OUTER identity·command 순서·완료 판정을 소유함
- 브라우저 WebSocket은 same-origin `Origin`만 검사한다. 별도 로그인/권한 체계가 도입되기 전에는 Studio 자체를 신뢰된 네트워크에만 노출함
- 머신·노드 snapshot은 브라우저가 P4 agent inspection 응답에서만 취득하고 Studio가 host OS나 adapter 상태를 추정하지 않음
- 모델 초기화 인자와 placement 지식은 Studio 데이터로 보존하고 P4가 해석한다고 가정하지 않음
- 포트는 검증된 환경 변수에서만 읽고 `10000..59999` 범위를 강제함
- Docker는 LAN/VPN과 겹치지 않는 `studio-control` egress bridge를 사용함. 기본 `10.253.240.0/24`, 설치 환경에 따라 `P4STUDIO_DOCKER_SUBNET`으로 변경함
- 사설망 SSH 경유는 TCP dial 주소만 변경하며 P4 source/target·generation·correlation은 유지함. 설정과 비밀 파일은 [Studio 운영](../apps/studio/docs/usage.md#agent-network)에 명시함
- 에이전트 등록은 노드 구성과 독립적이며 어댑터를 소유하지 않음
- 에이전트 목록의 SQLite 등록과 브라우저가 이번 세션에 관측한 P4 상태를 혼동하지 않음
- 반복 목록 항목은 `agent-row`, 상세 화면은 `agent-detail` test id를 사용하며 상세 진입과 목록 복귀는 이름 있는 버튼으로 노출함
- 서버 주기 조회 fan-out은 금지함. 브라우저가 명시적으로 시작한 P4 관측의 동시성은 클라이언트가 제한함
- 게이트웨이는 전체 Studio의 단일 대표가 아니라 그룹별 대표다. 한 agent는 최대 한 그룹에 속하고, 대표는 그 그룹 구성원이어야 한다. 그룹 구성원에 대한 직접 bridge open은 거부하며 접수 장애를 직접 접속으로 우회하지 않는다. 상세는 [그룹 계약](../packages/studio_domain/docs/api.md#agent-groups).

- Agent-target LOAD/UNLOAD와 최종 lifecycle 결과만 노드 생성·제거 계약이다. 중복 ID 거부는 기존 노드를 회수하지 않고, 불명 LOAD는 별도 연결의 순간적인 부재만으로 해소하지 않는다. [회수 계약](node-lifecycle.md).
