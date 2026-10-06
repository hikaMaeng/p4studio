# Constraints

- Docker 영구 저장소는 `p4studio_studio-data:/app/data`; SQLite 경로는 `/app/data/p4studio.db`로 고정한다. 상세 수명·백업 경계는 [영구 저장소 계약](usage.md#persistent-storage)을 따른다.

- 한 화면에 하나의 `main` landmark
- 주 탐색은 이름 있는 `nav`
- 주요 collection은 이름 있는 `section`; 항목은 `article` 또는 list item
- 입력은 visible label, dialog는 visible title을 사용
- 반복 pipeline stage·agent card·model row·inference run group은 [testing.md](testing.md)에 기록한 stable test id를 사용
- SQLite 등록 상태와 browser-owned P4 inspection 성공을 별도 상태로 표시함
- agent는 어댑터를 소유하지 않으며 node 구성과 독립적으로 등록
- 노드 탭 배지는 관측된 P4 registry의 노드 수만 표시한다. [NodeCards](../src/front/features/agents/nodes/NodeCards.tsx)는 `(nodeId, generation)`별 `agent-node-card` list item을 렌더링하며 이전 Studio 선언은 표시하지 않는다. 관측 시각·조회 실패와 성공한 0개 조회를 구분한다.
- [JsonCapsules](../src/front/features/agents/nodes/JsonCapsules.tsx)는 어댑터의 opaque state를 `키: 값` 캡슐(`node-value-capsule`)로 표시한다. JSON 텍스트는 한 번 파싱하고 중첩 객체·배열 인덱스·빈 값·원본 키를 보존한다. 어댑터 종류나 필드 이름으로 실행 준비를 추정하지 않으며 JSON을 자르지 않는다. 요약 상태만 받은 경우 상세 설정 미제공을 안내한다.
- server monitor fan-out은 금지하며 browser가 명시적으로 시작한 inspection만 허용함

- 모델 메뉴의 로딩 상태는 `model_deployments` 계획과 해당 명령의 보고에서만 도출한다. 기존 `models` 파일 레코드와 `nodes` 선언은 실행 근거가 아니다.
- 모델 표는 `article`/이름 있는 `table`, 구성은 `/models/new`, `/models/:id/edit` 전용 페이지의 이름 있는 section, 노드 선택 nav, `배치 N` fieldset으로 찾는다. 인자는 plan/LOAD JSON textarea로 편집한다. 모바일에서도 표 열을 강제 압축하지 않는다.
- 어댑터별 preflight와 P4 completion 검증은 browser OUTER가 수행한다. 서버 bridge는 endpoint·causation·correlation·adapter·load generation을 해석하지 않는다.
- 인퍼런스는 ready llama.cpp 모델만 선택하며, 브라우저가 새 session identity와 모든 stage의 `SESSION_READY` 뒤에 PREFILL을 보낸다. SSE 실행 controller는 사용하지 않는다.
- `inference-run-stop`은 번역된 visible text를 가진 버튼이다. 질의 `inference-run-group`, 기록 `inference-history-row`, 상세 `inference-history-detail`에서 대상 run으로 범위를 지정한다. preparing/running 동안 enabled, cancelling 동안 disabled이며 종료 상태에서는 숨긴다. 목록의 action 열은 번역된 문구 길이를 수용한다.
- 프리필 TPS는 해당 요청의 `BatchObservation.owned_requests.prefill_rows`가 도착한 뒤에만 계산한다. 관측이 없으면 0으로 표시하지 않는다. GPU 활성률은 inspection의 `utilization_gpu_percent` 표본이며 SM 포화율이 아니다.
