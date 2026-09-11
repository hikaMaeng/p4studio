# Usage

- 개발: `npm run dev --workspace @p4studio/studio`
- 빌드: `npm run build --workspace @p4studio/studio`
- 배포: 루트 `npm run deploy`

Compose에서 Windows 호스트의 로컬 agent를 등록할 때 agent는 `0.0.0.0`에 listen하고 `tcp://host.docker.internal:<port>`를 광고한다. Studio 등록 host도 `host.docker.internal`을 사용한다.

## Model graph

- `/models/new`, `/models/:id/edit`: [PlacementCanvas](../src/front/features/models/PlacementCanvas.tsx)의 에이전트 그룹 안에 관측된 노드들을 표시한다. 에이전트 헤더는 이동 손잡이이며 연결 포트가 없다. 각 노드 행의 출력→입력 포트를 드래그해 같은/다른 에이전트의 노드를 연결한다.
- 연결 identity는 `agentId + nodeId + generation`; 노드 ID가 다른 에이전트에서 같아도 별도 대상이다. 연결은 [DeploymentStore.connectObservedNodes](../../../packages/studio_domain/src/front/model/deployments/store.ts)의 ordered stages로 반영되며 P4 명령 실행은 아니다.
- 그룹 이동 시 자식 노드와 선이 따라간다. 노드 클릭은 우측 상세를 선택하고, 배치에 포함된 노드는 적재 인자 편집을 표시한다. 그룹 위치는 세션 내 프런트 모델에만 보존한다.

## Agent network

<a id="agent-network"></a>

- `npm run deploy -- studio`가 Docker 서비스와 게시 포트의 동일 instance를 확인한다. 같은 포트의 로컬 개발 서버가 응답하면 배포 성공으로 처리하지 않는다.
- `P4STUDIO_DOCKER_SUBNET`은 LAN/VPN과 겹치지 않는 CIDR; 기본 `10.253.240.0/24`. 예전 `studio-internal`/`studio-edge`는 이 Compose 프로젝트 소유이며 사용 컨테이너가 없는 경우에만 배포 시 제거한다.
- `P4STUDIO_AGENT_TUNNELS` 기본 `[]`. 항목은 `{agentHost, agentPort, sshHost, sshPort, sshUser, localPort}`. 등록 주소는 P4의 실제 advertise 주소를 유지하며 localPort는 컨테이너 loopback 전용이다.
- SSH 키와 검증된 known_hosts를 `apps/studio/docker/volumes/ssh/{id_ed25519,known_hosts}`에 둔다. Git 제외·읽기 전용 mount이며 runtime이 키를 임시 0600 파일로 복사한다. SSH host key 검증을 생략하지 않는다. 터널은 연결 종료 5초 후 재시도하고 Studio 종료 시 정리한다.
- browser WebSocket이 SQLite agent ID를 열면 server bridge가 동일 [dial resolver](../src/server/agent-socket/routes.ts)를 사용해 TCP만 연다. CREATE/LOAD/SESSION/PREFILL과 응답 판정은 브라우저가 수행한다. 터널은 agent 사이의 네트워크를 만들지 않으므로 배치의 agent 간 forwarding 주소는 서로 도달 가능해야 한다.
- `register-recorded-models.mjs`는 기록된 주소 또는 같은 호스트·관리 이름의 현재 등록을 재사용한다. 운영 포트 변경 후에도 기존 ID·모델 참조를 보존한다.
