# Constraints

- 한 화면에 하나의 `main` landmark
- 주 탐색은 이름 있는 `nav`
- 주요 collection은 이름 있는 `section`; 항목은 `article` 또는 list item
- 입력은 visible label, dialog는 visible title을 사용
- 반복 pipeline stage와 agent card만 stable test id 사용
- SQLite 등록 상태와 browser-owned P4 inspection 성공을 별도 상태로 표시함
- agent는 어댑터를 소유하지 않으며 node 구성과 독립적으로 등록
- 노드 탭 배지는 해당 agent의 Studio 선언 name과 관측된 P4 nodeId의 합집합 크기다. 같은 노드는 한 번 세며, 선언 수를 P4 등록·적재 완료 수로 바꾸지 않는다.
- P4 node state는 opaque로 렌더링하며 Studio domain 상태로 해석하지 않음
- server monitor fan-out은 금지하며 browser가 명시적으로 시작한 inspection만 허용함

- 모델 메뉴의 로딩 상태는 `model_deployments` 계획과 해당 명령의 보고에서만 도출한다. 기존 `models` 파일 레코드와 `nodes` 선언은 실행 근거가 아니다.
- 모델 표는 `article`/이름 있는 `table`, 구성은 `/models/new`, `/models/:id/edit` 전용 페이지의 이름 있는 section, 노드 선택 nav, `배치 N` fieldset으로 찾는다. 인자는 plan/LOAD JSON textarea로 편집한다. 모바일에서도 표 열을 강제 압축하지 않는다.
- 어댑터별 preflight와 P4 completion 검증은 browser OUTER가 수행한다. 서버 bridge는 endpoint·causation·correlation·adapter·load generation을 해석하지 않는다.
- 인퍼런스는 ready llama.cpp 모델만 선택하며, 브라우저가 새 session identity와 모든 stage의 `SESSION_READY` 뒤에 PREFILL을 보낸다. SSE 실행 controller는 사용하지 않는다.
- 프리필 TPS는 해당 요청의 `BatchObservation.owned_requests.prefill_rows`가 도착한 뒤에만 계산한다. 관측이 없으면 0으로 표시하지 않는다. GPU 활성률은 inspection의 `utilization_gpu_percent` 표본이며 SM 포화율이 아니다.
