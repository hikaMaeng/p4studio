# Testing

`npm test --workspace @p4studio/p4-protocol`는 버전 identity, 금지된 relay operation 부재, inspection request identity, 머신·노드 snapshot decode, 표준 거부 detail 전달을 검사한다.

[agent-inspection.test.ts](../src/event/agent-inspection.test.ts)는 P4 `4b62e3e4`로 빌드한 agent가 실제로 보낸 INSPECT 응답 bytes([fixture](../src/event/fixtures/agent-snapshot-p4-4b62e3e4.ts), 빈 상태와 한 stage 적재 상태)를 decode한다. fixture는 수집물이며 수정하지 않는다. 같은 파일의 손으로 쓴 fixture는 receipt ledger를 보고하던 이전 agent 형태다.

[wire.ts](../src/event/wire.ts)는 P4E3 envelope의 node/outer endpoint, generation, causation 및 adapter를 보존한다. [앱 TCP 통합시험](../../../apps/studio/src/server/api/deployments.test.ts)은 분할 frame과 완료 소비를 검사한다. `test/20260911/model-menu/real-p4.json`은 기존 실제 P4 바이너리 두 프로세스 사이 CREATE forwarding, empty 관측, LOAD 실패 반환 증거다. 동일 머신의 제어 시험이며 다중 머신/GPU 적재 성공을 뜻하지 않는다.
