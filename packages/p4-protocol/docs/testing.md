# Testing

`npm test --workspace @p4studio/p4-protocol`는 버전 identity, 금지된 relay operation 부재, inspection request identity, 머신·노드 snapshot decode, 표준 거부 detail 전달을 검사한다.

[wire.ts](../src/event/wire.ts)는 P4E3 envelope의 node/outer endpoint, generation, causation 및 adapter를 보존한다. [앱 TCP 통합시험](../../../apps/studio/src/server/api/deployments.test.ts)은 분할 frame과 완료 소비를 검사한다. `test/20260911/model-menu/real-p4.json`은 기존 실제 P4 바이너리 두 프로세스 사이 CREATE forwarding, empty 관측, LOAD 실패 반환 증거다. 동일 머신의 제어 시험이며 다중 머신/GPU 적재 성공을 뜻하지 않는다.
