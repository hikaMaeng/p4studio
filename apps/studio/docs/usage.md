# Usage

- 개발: `npm run dev --workspace @p4studio/studio`
- 빌드: `npm run build --workspace @p4studio/studio`
- 배포: 루트 `npm run deploy`

Compose에서 Windows 호스트의 로컬 agent를 등록할 때 agent는 `0.0.0.0`에 listen하고 `tcp://host.docker.internal:<port>`를 광고한다. Studio 등록 host도 `host.docker.internal`을 사용한다.

## Model graph

- `/models/new`, `/models/:id/edit`: [PlacementCanvas](../src/front/features/models/PlacementCanvas.tsx)의 에이전트 그룹 안에 관측된 노드들을 표시한다. 에이전트 헤더는 이동 손잡이이며 연결 포트가 없다. 각 노드 행의 출력→입력 포트를 드래그해 같은/다른 에이전트의 노드를 연결한다.
- 연결 identity는 `agentId + nodeId + generation`; 노드 ID가 다른 에이전트에서 같아도 별도 대상이다. 연결은 [DeploymentStore.connectObservedNodes](../../../packages/studio_domain/src/front/model/deployments/store.ts)의 ordered stages로 반영되며 P4 명령 실행은 아니다.
- 그룹 이동 시 자식 노드와 선이 따라간다. 노드 클릭은 우측 상세를 선택하고, 배치에 포함된 노드는 적재 인자 편집을 표시한다. 그룹 위치는 세션 내 프런트 모델에만 보존한다.
- 에이전트 헤더의 새로고침은 [inspectGraphAgent](../src/front/p4/inspection.ts)가 browser-owned INSPECT를 보내 해당 에이전트만 갱신한다. 중복 클릭은 차단하고 실패하면 이전 관측·배치 연결을 보존하면서 오류를 표시한다. 조회는 CREATE/LOAD가 아니다.
- [GraphNameEditor](../src/front/features/models/GraphNameEditor.tsx)의 연필은 에이전트/노드 이름을 인라인 편집한다. Enter/저장으로 SQL 반영, Escape/취소로 폐기한다. 에이전트의 관리 ID·접속 주소와 노드의 P4 ID·generation·연결은 변경하지 않는다.

## Managed metadata

- Studio는 운영 편의를 위한 메타데이터의 소유자다. P4는 실행 identity·관측·공개 wire 계약을 소유한다. SQL 메타데이터를 원격 노드 존재나 현재 적재 상태로 해석하지 않는다.
- [node_metadata](../src/server/database/schema.ts)는 `(agent_id, node_id)`별 `schema_version`, `revision`, `metadata_json`, `updated_at`을 보존한다. 노드 이름은 첫 관리 필드이며 generation이 바뀌어도 같은 관리 대상의 이름을 유지한다. 기존 `nodes.name`은 선언된 P4 ID이므로 이름 편집으로 수정하지 않는다.
- [StudioDatabase.renameNode](../src/server/database/client.ts)는 JSON의 `name`만 patch하고 revision을 증가시킨다. 다른 메타데이터 키를 덮어쓰지 않는다. 대규모 메타데이터의 검색·인덱스·별도 엔터티/관계는 각 기능 계약에 따라 확장하며, 모든 데이터를 그래프에 싣거나 하나의 범용 JSON 수정 API로 노출하지 않는다.
- 현재 HTTP API는 이름 projection만 제공한다. 설명·태그 등 추가 필드의 UI/API는 아직 제공하지 않는다. [GraphInventoryStore](../../../packages/studio_domain/src/front/model/graph-inventory/store.ts)는 이름과 관측을 별도 slice로 유지한다.

## Persistent storage

- [Root Compose](../../../docker-compose.yml) mounts the existing named volume `p4studio_studio-data` read/write at `/app/data`. The fixed name preserves the same storage across checkout/project-name changes; do not point parallel Studio instances at this volume.
- Compose pins `P4STUDIO_SQLITE_PATH=/app/data/p4studio.db`. SQLite, adjacent WAL/SHM files, and server-owned durable files belong under `/app/data`; future durable files must use a subdirectory here. This overrides host development DB paths in `.env`.
- Agent registrations, node declarations, model configurations and operation receipts share this database. [Deploy verification](../../../scripts/deploy.mjs) rejects a missing/wrong/read-only volume or a SQLite path outside the pinned location, and reports both volume and DB path.
- Container recreation/image updates and ordinary Compose shutdown retain the volume. Explicit volume deletion (`docker compose down -v` or `docker volume rm`) removes it. Before migration, use SQLite's online backup API; copying only the live DB file can miss WAL contents. An on-volume backup survives container replacement but is not a backup against volume/disk loss.
- SSH credentials remain in `apps/studio/docker/volumes/ssh`, mounted read-only at `/run/studio-ssh`. The runtime copy under `/tmp` is ephemeral and recreated from that mount.

## Agent network

<a id="agent-network"></a>

- `npm run deploy -- studio`가 Docker 서비스와 게시 포트의 동일 instance를 확인한다. 같은 포트의 로컬 개발 서버가 응답하면 배포 성공으로 처리하지 않는다.
- `P4STUDIO_DOCKER_SUBNET`은 LAN/VPN과 겹치지 않는 CIDR; 기본 `10.253.240.0/24`. 예전 `studio-internal`/`studio-edge`는 이 Compose 프로젝트 소유이며 사용 컨테이너가 없는 경우에만 배포 시 제거한다.
- `P4STUDIO_AGENT_TUNNELS` 기본 `[]`. 항목은 `{agentHost, agentPort, sshHost, sshPort, sshUser, localPort}`. 등록 주소는 P4의 실제 advertise 주소를 유지하며 localPort는 컨테이너 loopback 전용이다.
- SSH 키와 검증된 known_hosts를 `apps/studio/docker/volumes/ssh/{id_ed25519,known_hosts}`에 둔다. Git 제외·읽기 전용 mount이며 runtime이 키를 임시 0600 파일로 복사한다. SSH host key 검증을 생략하지 않는다. 터널은 연결 종료 5초 후 재시도하고 Studio 종료 시 정리한다.
- browser WebSocket이 SQLite agent ID를 열면 server bridge가 동일 [dial resolver](../src/server/agent-socket/routes.ts)를 사용해 TCP만 연다. CREATE/LOAD/SESSION/PREFILL과 응답 판정은 브라우저가 수행한다. 터널은 agent 사이의 네트워크를 만들지 않으므로 배치의 agent 간 forwarding 주소는 서로 도달 가능해야 한다.
- `register-recorded-models.mjs`는 기록된 주소 또는 같은 호스트·관리 이름의 현재 등록을 재사용한다. 운영 포트 변경 후에도 기존 ID·모델 참조를 보존한다.
