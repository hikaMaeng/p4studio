# API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | 프로세스와 SQLite 준비 상태 |
| `GET` | `/api/snapshot` | 전체 운영 레지스트리 snapshot |
| `POST` | `/api/agents` | 에이전트 등록 후 즉시 P4 머신·노드 조회 |
| `PATCH` | `/api/agents/:id` | SQLite 관리 이름·호스트·포트 수정 후 변경 주소 재조회 |
| `POST` | `/api/agents/:id/probe` | P4 머신·노드 정보 새로고침 |
| `POST` | `/api/agents/:id/nodes` | 에이전트 소속 노드 선언 |
| `DELETE` | `/api/agents/:id` | 연결되지 않은 에이전트 등록 제거 |
| `POST` | `/api/models` | 모델 메타데이터 등록 |
| `POST` | `/api/pipelines` | 노드 stage로 구성된 파이프라인 등록 |

모든 오류는 `{ "error": { "code", "message", "issues?" } }` 형태다.

에이전트 등록과 수정 입력은 `name`, `host`, `port`만 받는다. `name`은 SQLite가 소유하는 관리 이름이며 P4 에이전트 identity가 아니다. 실행 어댑터는 노드 선언에서 선택한다.

에이전트 응답에는 `inspection.state`, `inspection.inspectedAt`, `inspection.error`, `inspection.snapshot`이 추가된다. snapshot은 P4 event version, 생성 시각, 머신의 OS·아키텍처·가용 코어·지원 어댑터와 에이전트에 실제 등록된 노드의 ID·generation·adapter kind·opaque state를 포함한다. 등록은 조회 실패와 독립적으로 유지된다.
