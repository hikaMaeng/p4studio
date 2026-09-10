# Constraints

- P4 저장소 또는 crate/package에 직접 의존하지 않음
- 서버가 추론 요청·토큰 스트림을 중계하지 않음
- TCP 연결 성공은 `reachable`이며 조회 성공은 `inspection.state=available`로 별도 표현함
- 머신·노드 snapshot은 P4 agent inspection 응답에서만 취득하고 Studio가 host OS나 adapter 상태를 추정하지 않음
- 모델 초기화 인자와 placement 지식은 Studio 데이터로 보존하고 P4가 해석한다고 가정하지 않음
- 포트는 검증된 환경 변수에서만 읽고 `10000..59999` 범위를 강제함
- 에이전트가 Docker 밖 LAN에 있으므로 Studio는 격리 network와 egress 가능한 edge network를 함께 사용함
- 에이전트 등록은 노드 구성과 독립적이며 어댑터를 소유하지 않음
- 에이전트 목록은 관리 이름·주소·도달성·GPU·RAM·P4 노드·지연만 표시하고, 전체 관측값과 SQLite 등록정보 편집은 별도 상세 화면에 둠
- 반복 목록 항목은 `agent-row`, 상세 화면은 `agent-detail` test id를 사용하며 상세 진입과 목록 복귀는 이름 있는 버튼으로 노출함
- 주기 조회 fan-out은 `P4STUDIO_AGENT_INSPECTION_CONCURRENCY`로 제한함
