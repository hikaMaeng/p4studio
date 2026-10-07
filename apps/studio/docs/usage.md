# Usage

- 스트리밍 질의의 `동시 질의 수 10 · 반복 횟수 10 · 반복 간격 5초`는 첫 회차부터 0·5·10·…·45초에 각각 10개씩 총 100개를 전송한다. 이전 응답이 진행 중이어도 다음 회차를 전송하며, 전체 응답 완료까지 결과를 수신한다. 간격 0은 모든 회차 즉시 전송이다. [전송 계약](api.md#browser-owned-inference).

- 진행 중 실행의 `질의 중지` 버튼은 인퍼런스 하단 결과 카드, 기록 목록의 해당 행, 기록 상세 상단 오른쪽에 표시된다. 준비·현재 웨이브·웨이브 간 대기를 중단하고, 겹친 회차의 미완료 요청 전체를 취소한다. 취소 확인 중에는 버튼이 `중지 중`으로 비활성화되고, 종료 후 부분 답변과 완료 요청을 유지한다. 실행 중 삭제는 비활성화한다. 인퍼런스 하단은 최신 실행과 모든 활성 실행을 표시하므로 더 최근 실행이 먼저 끝나도 이전 실행을 중지할 수 있다.
- 모델 언로드 또는 노드 상세의 모델 언로드는 현재 브라우저의 관련 실행과 이후 웨이브를 자동으로 먼저 취소한다. P4 정산이 확인되지 않으면 실행은 결과 불명으로 남으며 자원 제거는 UNLOAD 결과에 따른다. [취소 계약](../../../packages/studio_domain/docs/api.md#inference-cancellation).

- 모델 카드의 `상태 새로고침`은 현재 게이트웨이 그룹을 통해 대상 에이전트별 INSPECT를 보내고 노드의 실제 상태·확인 시각을 DB에 저장한다. 상단 `목록 새로고침`도 목록을 읽은 뒤 모델별 P4 조회를 순차 실행한다(모델 상세에서는 해당 모델만 조회). 한 모델의 조회 저장 실패가 다른 모델의 갱신을 막지 않는다. 배경의 2초 갱신은 저장 목록만 읽는다. 접힌 행에도 조회·로딩·언로딩 진행, 실패 이유와 마지막 관측 시각을 표시한다. 언로딩 전 추론 취소·연결 준비 중에도 진행을 표시하며 중복 동작을 차단한다. 노드 부재는 현재 관측으로 기록하며 미해결 LOAD는 계속 불명이다. 빈 adapter 문자열은 node 제거가 아니다. 접속 실패·세대 불일치는 미확인으로 표시한다. 현재 P4의 `load_generation`과 감독된 LOAD 완료 결과를 대조하며, 과거 agent의 세대 없는 `loaded` 문자열만으로 완료를 확정하지 않는다. 다른 작업이 기록을 바꾸면 오래된 결과의 저장을 거부한다. 삭제된 agent 등록을 참조하는 배치는 미확인 상태와 원인을 보존하며 다른 agent로 자동 변경하지 않는다. [상태 판정 계약](../../../packages/studio_domain/docs/api.md#model-refresh).

- 개발: `npm run dev --workspace @p4studio/studio` (Vite `43121`, API `43122`; `P4STUDIO_DEV_PORT`로 API 포트만 변경)
- 빌드: `npm run build --workspace @p4studio/studio`
- 배포: 루트 `npm run deploy`

Compose에서 Windows 호스트의 로컬 agent를 등록할 때 agent는 `0.0.0.0`에 listen하고 `tcp://host.docker.internal:<port>`를 광고한다. Studio 등록 host도 `host.docker.internal`을 사용한다.

## Model graph

- `/models/new`, `/models/:id/edit`: [PlacementCanvas](../src/front/features/models/PlacementCanvas.tsx)의 에이전트 그룹 안에 저장된 배치 노드와 관측된 노드를 표시한다. 미조회·조회 실패·등록이 없어진 에이전트에서도 저장된 단계와 순서 화살표를 유지한다. 정확한 agent/node/generation 관측만 병합하며, 관측되지 않은 구성은 점선과 별도 상태로 표시한다. 이는 노드 존재·적재 성공의 증거가 아니다. 에이전트 헤더는 이동 손잡이이며 연결 포트가 없다. 에이전트의 적재 stage 추가 버튼으로 새로운 배치를 만든다. 계획된 stage의 출력→입력 포트만 연결할 수 있고 관측된 기존 인스턴스는 조회 전용이다.
- 연결 identity는 `agentId + nodeId + generation`; 노드 ID가 다른 에이전트에서 같아도 별도 대상이다. 연결은 [DeploymentStore.connectPlannedStages](../../../packages/studio_domain/src/front/model/deployments/store.ts)의 ordered stages로 반영되며 P4 명령 실행은 아니다.
- 그룹 이동 시 자식 노드와 선이 따라간다. 본문 전체가 다이어그램이며 노드 클릭 때만 오른쪽 플로팅 상세를 연다. 배치에 포함된 노드는 적재 인자 편집을 표시한다. 닫기·캔버스 빈 영역 클릭은 패널만 닫고 draft를 유지한다. 그룹 위치는 세션 내 프런트 모델에만 보존한다.
- 에이전트 헤더의 새로고침은 [inspectGraphAgent](../src/front/p4/inspection.ts)가 browser-owned INSPECT를 보내 해당 에이전트만 갱신하고, 성공한 snapshot과 관측 시각을 SQLite `agent_observations`에 마지막 관측으로 보존한다. 목록과 상세는 재시작 뒤에도 이 기록을 복원하지만, 기록의 시각은 현재 상태나 적재 성공을 뜻하지 않는다. 중복 클릭은 차단하고 실패하면 이전 관측·배치 연결을 보존하면서 오류를 표시한다. 조회는 LOAD가 아니다.
- 미조회 안내와 성공한 조회의 0개 결과는 별도 문구로 표시한다. P4 snapshot이 없는 상태를 노드 0개로 단정하지 않는다.
- [GraphNameEditor](../src/front/features/models/GraphNameEditor.tsx)의 연필은 에이전트/노드 이름을 인라인 편집한다. Enter/저장으로 SQL 반영, Escape/취소로 폐기한다. 에이전트의 관리 ID·접속 주소와 노드의 P4 ID·generation·연결은 변경하지 않는다.

- [ModelEditorPage](../src/front/features/models/ModelEditorPage.tsx) 헤더에 현재 모델 이름·모델로 돌아가기·기본 구성·저장을 둔다. 목록의 구성 상세 진입과 그래프·노드 인자 조회는 적재·회수·결과 불명 상태에서도 가능하다. 저장이 금지된 배치는 저장 버튼을 비활성화하고 적재된 모델은 그 자리에 `적재중`을 표시한다. 회수 중·결과 불명·부분 실패는 해당 상태를 표시하며, 폼 제출도 저장을 실행하지 않는다. 기본 구성은 헤더에서 펼치며 노드 설정은 12px 본문/입력과 13px 소제목을 사용한다. 초기 fit은 배치 소속 에이전트를 기준으로 하며 나머지 에이전트는 캔버스를 이동해 탐색한다.

## Agent nodes

- `/agents/:id/nodes`의 [NodeCards](../src/front/features/agents/nodes/NodeCards.tsx)는 마지막 P4 조회의 노드를 개별 카드로 표시한다. 공통 identity·수명 상태, 어댑터 상태, 전달·보관 상태, 최근 수명 작업 결과를 구분하며 이전 Studio 노드 선언은 표시하지 않는다.
- 어댑터 JSON은 원본 키와 중첩 구조·배열 순서를 유지한 `키: 값` 캡슐로 표현한다. 특정 어댑터 설정을 공통 형식으로 강제하지 않는다. 현재 조회가 `loaded` 등의 요약 문자열만 반환하면 상세 적재 설정의 부재를 안내한다. 저장된 계획이나 과거 LOAD 인자를 현재 설정으로 대신 표시하지 않는다.
- 헤더의 P4 관측 시각은 현재 상태의 보증이 아니다. 새로고침 실패 시 마지막 관측을 보존하고 오류를 표시하며, 미조회와 조회 성공 후 노드 없음은 구별한다.

## Agent removal

- 에이전트 목록의 휴지통과 상세의 삭제 버튼은 [AgentRemovalDialog](../src/front/features/agents/AgentRemovalDialog.tsx)를 연다. 대상 이름과 삭제 범위를 확인하며 취소/진행 중 중복 요청을 차단한다. 확인창은 일시적 동작이며 별도 URL을 만들지 않는다.
- DELETE는 Studio 등록과 node metadata만 제거한다. 원격 agent/node 종료·UNLOAD·DELETE 명령은 보내지 않는다. Studio 노드 선언 또는 게이트웨이 그룹 참조가 있으면 삭제를 거부한다.
- 성공/이미 삭제된 대상은 목록을 갱신하고 `/agents`로 복귀한다. 삭제된 상세 URL 재방문은 대상 없음 안내를 표시한다. 전송 실패는 결과 불명으로 안내하고 등록을 성공적으로 삭제했다고 표시하지 않는다.

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

- `npm run deploy -- studio`는 production Compose를 IPv4 loopback `127.0.0.1:43120`에만 게시하고 동일 instance를 확인한다. 개발 API는 기본 `43122`를 쓰며 production port를 열지 않는다. 같은 게시 포트에서 다른 instance가 응답하면 배포는 실패한다. MI250 같은 사설망 agent의 SSH tunnel은 컨테이너 loopback `45111`·`45112`에서만 종료되므로 공개 Studio 포트와 독립적이다.
- `P4STUDIO_DOCKER_SUBNET`은 LAN/VPN과 겹치지 않는 CIDR; 기본 `10.253.240.0/24`. 예전 `studio-internal`/`studio-edge`는 이 Compose 프로젝트 소유이며 사용 컨테이너가 없는 경우에만 배포 시 제거한다.
- `P4STUDIO_AGENT_TUNNELS` 기본 `[]`. 항목은 `{agentHost, agentPort, sshHost, sshPort, sshUser, localPort}`. 등록 주소는 P4의 실제 advertise 주소를 유지하며 localPort는 컨테이너 loopback 전용이다.
- SSH 키와 검증된 known_hosts를 `apps/studio/docker/volumes/ssh/{id_ed25519,known_hosts}`에 둔다. Git 제외·읽기 전용 mount이며 runtime이 키를 임시 0600 파일로 복사한다. SSH host key 검증을 생략하지 않는다. 터널은 연결 종료 5초 후 재시도하고 Studio 종료 시 정리한다.
- browser WebSocket이 SQLite agent ID를 열면 server bridge가 동일 [dial resolver](../src/server/agent-socket/routes.ts)를 사용해 TCP만 연다. LOAD/UNLOAD/SESSION/PREFILL과 응답 판정은 브라우저가 수행한다. 터널은 agent 사이의 네트워크를 만들지 않으므로 배치의 agent 간 forwarding 주소는 서로 도달 가능해야 한다.
- `register-recorded-models.mjs`는 기록된 주소 또는 같은 호스트·관리 이름의 현재 등록을 재사용한다. 운영 포트 변경 후에도 기존 ID·모델 참조를 보존한다.

모델 LOAD/UNLOAD·부분 실패·재적재와 이전 노드 등록 URL의 이행은 [노드 수명](../../../docs/node-lifecycle.md)을 따른다.

## Approved Windows recovery

모델 메뉴의 미결 요청 줄은 Studio의 미정산 요청·실행 수와 P4 head의 관측 요청·대기 수를 분리한다. `미결 조회`로 갱신하며 표시되는 수는 관측 시각의 값이다. `요청 클리어`는 확인 후 추론을 취소하고 모델을 언로드한다. 모든 단계의 실제 부재가 확인되어야 미정산 차단을 해제한다. 이전 실행 결과는 보존된다. busy/단절로 실패하면 같은 줄에서 에이전트 회수 화면으로 진입한다. 강제 회수에는 아래 승인 profile이 필요하다.

에이전트 상세의 자원 회수 화면에서 영향 모델, 전후 PID·birth·실행 경로·listener·hash를 검토한다. 강제 회수 뒤 새 agent의 P4 INSPECT를 확인해야 완료된다. 정상 UNLOAD 거부 이력은 성공으로 바꾸지 않는다. 일부 stop 실패는 현재 자원 다시 검토 후 계속할 수 있고, stop 성공/start 실패는 재기동만 재개한다. 브라우저 reload는 같은 operation URL을 복원한다.

P4STUDIO_AGENT_MANAGEMENT는 기본[]인 private JSON 설정이다. 각 항목은 {agentId,host,port,sshHost,sshPort,sshUser,root,task,agentHash,nativeHash,launchHash,identityName}. 등록 agent 좌표와 승인 installation이 정확히 일치해야 한다. root는 전용 Windows 폴더이며 task action은 cmd.exe /c <root>\run-agent.cmd, S4U다. 해시는 관리자 검토 후 환경에 넣는다. client는 원격 shell을 입력하지 않는다.

승인 키는 apps/studio/docker/volumes/ssh/<identityName>, 기본 management_identity에 두며 Git 제외·read-only mount한다. known_hosts는 이미 검증된 host key를 사용한다. 비밀키·credential은 보고서나 evidence archive에 포함하지 않는다. 인증·승인 hash가 바뀌면 자동 우회하지 않고 실패를 표시한다.

MiMo 같은 대형 모델은 대상 agent에서 실제 접근 가능한 local/remote path를 설정한다. Studio 서버나 SSH user에서의 파일 존재를 다른 실행 identity의 사용 가능 증거로 바꾸지 않는다. mapped drive는 세션에 따라 없을 수 있다. retained request budget과 execution sequence slots는 별개이며 LOAD profile 변경 후 재적재가 필요하다.
