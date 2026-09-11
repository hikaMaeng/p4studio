# API

서비스 API는 루트 [API 문서](../../../docs/api.md)를 따른다. API DTO는 `src/common/domain.ts`가 소유한다.

모델 배치 API는 [domain deployment 계약](../../../packages/studio_domain/src/common/protocol/deployments/index.ts)의 schema·route를 양쪽에서 사용한다. [router](../src/server/api/deployments.ts)는 `/api/model-deployments` GET/POST, `/:id` PUT와 browser-authored `/:id/receipt` PUT만 실행한다. `/:id/load`와 `/:id/unload`는 server execution을 거부한다. 브라우저가 WebSocket P4 session을 수행한 뒤 상태·노드별 receipt를 저장한다.

<a id="browser-owned-inference"></a>
인퍼런스 run과 monitoring projection은 browser memory model이 소유한다. 브라우저가 ready llama.cpp deployment와 `/api/graph-agents` 접속 좌표를 읽고 같은 WebSocket bridge session에서 P4 SESSION/PREFILL/OUTPUT과 llama.cpp `batch-observation-v4`·`stage-span-v4` telemetry를 처리한다. 실행 중 telemetry는 node address·ID·generation과 현재 load/session을 대조한 뒤 run history에 bounded snapshot으로 보존한다. monitoring 화면은 각 agent에 실제 P4 INSPECT를 보내 adapter 상태와 GPU를 갱신하고, 같은 browser session에서 받은 최신 batch/span을 합성한다. server-side `/api/inference` controller와 SSE는 실행 경로가 아니다.

에이전트 등록 DTO는 `name`, `host`, `port`이며 Studio 노드 선언 DTO는 `name`만 포함한다. 선언은 원격 P4 CREATE가 아니며, 실행 어댑터는 모델 배치가 실제 CREATE와 LOAD를 보낼 때 선택한다.

에이전트 view DTO의 `inspection`은 등록 시 `pending`이다. 서버는 등록 중 P4를 probe하지 않으며, browser session에서 얻은 관측을 SQLite 선언이나 현재 사실로 저장하지 않는다.

그래프 관리 이름은 [graph-inventory schema·routes](../../../packages/studio_domain/src/common/protocol/graph-inventory/index.ts)를 양쪽에서 사용한다. GET `/api/graph-agents`는 browser-owned P4 session에 필요한 등록 agent ID·이름·host·port를 반환하고, GET `/api/node-labels`는 이름 projection 목록을 반환한다. PATCH `/api/agents/:id/name`은 `{name}`, PUT `/api/agents/:id/node-labels`는 `{nodeId,name}`을 받는다. 잘못된 입력은 400, 없는 에이전트는 404, 에이전트 이름 충돌은 409다. 노드 ID는 URL이나 수정 대상 이름이 아니라 불변 lookup key다. [메타데이터 계약](usage.md#managed-metadata)에 따라 SQL만 수정하며 P4 명령을 보내지 않는다.
