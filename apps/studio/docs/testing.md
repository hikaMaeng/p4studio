# Testing

통합 테스트는 in-memory SQLite와 Express app factory를 사용한다. inspector를 주입해 registration success/error와 machine/node DTO를 검사하고, 여러 agent 조회의 최대 동시성을 검증한다. 브라우저 acceptance는 실제 P4 agent를 등록하고 named machine/P4 node/Studio declaration section을 확인한다.

[deployments.test.ts](../src/server/api/deployments.test.ts)는 실제 Express/SQLite/길이-prefix TCP 소비 경로에서 원격 target 보존, 부분 완료, 중복 실행 차단, 오래된 load generation, 단절, 재시작, 실패 원문 보존을 검사한다. 응답 서버는 모의 어댑터이며 GPU 적재 증거가 아니다.

모델 화면은 이름 있는 `section`, 모델별 `article`/`table`, `/models/new`와 `/models/:id/edit` 전용 구성 페이지, 노드 그래프와 `배치 N` fieldset을 사용한다. [모델 그래프 계약](usage.md#model-graph)에 따라 에이전트는 포트 없는 그룹이며 자식 노드끼리 연결한다. 노드 선택 → plan/LOAD JSON 수정 → 저장/새로고침 → 노드별 보고 → 언로딩은 별도 제어 검증이다.

그래프 locator: `flow-agent-{agentId}` 그룹, `flow-agent-header-{agentId}` 이동 헤더, `flow-node-{agentId}:{nodeId}:{generation}` 노드, `flow-input-…`/`flow-output-…` 포트. 상세는 `노드 ID` 번역명으로 이름 붙인 `aside`와 `section`이다. React Flow 소유 edge에만 `.react-flow__edge` CSS 예외를 사용한다.

새로고침 버튼은 `{agent name} 노드 목록 새로고침`, 연필은 `{name} 편집`, textbox는 `에이전트 이름`/`노드 이름` 번역명으로 찾는다. 헤더의 주소/여백을 드래그하며 입력·버튼은 드래그하지 않는다. 조회/저장 실패는 `alert`, 조회 중은 `progressbar`다.

[graph-inventory.test.ts](../src/server/api/graph-inventory.test.ts)는 실제 Express/SQLite로 이름 변경·ID 보존·agent별 node ID 분리·다른 JSON 필드 보존·revision 증가를 검사한다. [store.test.ts](../../../packages/studio_domain/src/front/model/graph-inventory/store.test.ts)는 조회 중복 차단·실패 후 이전 관측 유지·이름 저장 재시도를 검사한다. `test/20260911/152000_graph-metadata/` 로컬 시나리오 증거는 임시 SQLite의 실제 HTTP 이름 저장, 모의 P4 WebSocket 조회, 내부/외부 노드 연결, 조회 실패 후 연결 유지, 페이지 reload 뒤 SQL 이름 복원을 포함한다. 실제 P4 적재·추론 증거가 아니다.

[grouped-node-connections.mjs](../../../test/20260911/grouped-node-connections.mjs)는 HTTP fixture(에이전트 2개 × 노드 4개)로 동일 node ID의 에이전트 간 분리, 내부/외부 포트 연결, 그룹 이동 후 자식 포함·edge 유지, 정확한 노드 상세 선택을 검사한다. `P4STUDIO_TEST_URL`로 실행 중인 Vite URL을 지정한다. 증거는 `test/20260911/130000_grouped-node-connections/`; 실제 P4 적재 시험이 아니다. 이전 페이지/제어 증거는 `test/20260911/model-editor/`, `test/20260911/model-menu/`다.

인퍼런스 화면은 `/inference/query`에서 1·5·10·20·30·40 동시 요청, 반복·간격·프롬프트를 설정하고 stream 결과 표의 토큰/TTFT/TPS를 확인한다. `/inference/monitoring`에서는 선택 모델의 stage별 inspection 결과를 확인한다. 실제 수용에는 P4 agent가 반환한 SESSION_READY, OUTPUT, BatchObservation와 정상 출력이 필요하며, 프런트 unit/typecheck만으로 이를 주장하지 않는다.
