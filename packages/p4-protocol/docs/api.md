# API

- `P4_PROTOCOL`: frame, event, status schema version
- `P4_AGENT_OPERATIONS`: Studio가 인지하는 agent operation
- `AgentReachability`: protocol health와 분리한 TCP 상태
- `encodeAgentInspectionRequest`: agent endpoint를 향한 event-v3 control event 생성
- `decodeAgentInspectionResponse`: 상관관계와 content type, schema를 검증하고 머신·노드 snapshot 반환
- `P4AgentSnapshot`: 머신 facts와 현재 agent node registry 타입
- `P4_AGENT_INSPECT_CONTENT_TYPE`, `P4_AGENT_SNAPSHOT_CONTENT_TYPE`: inspection v1 media type
