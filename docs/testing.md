# Testing

```powershell
npm run typecheck
npm test
npm run build
```

브라우저 계약은 단일 `main`, 이름 있는 `navigation`, 이름 있는 섹션과 폼, `role=status|alert` 상태면을 사용한다. 주요 제어는 보이는 한국어 accessible name으로 찾는다. 반복 카드만 `agent-card`, `pipeline-stage` test id를 사용한다.

에이전트 검증은 protocol codec fixture, API registration/edit observation, SQLite 충돌 보존, 조회 실패 분리, monitor 동시성 제한, 실제 P4 agent를 대상으로 한 목록→상세→편집 브라우저 동선까지 구분한다. 목록은 `agent-row`에서 `<관리 이름> 상세 보기`, 상세는 `agent-detail`, 복귀는 `에이전트 목록으로`, 편집 폼은 `<관리 이름> 등록정보 편집` 접근 이름을 사용한다.

노드 수명: [검증계획](../tests/plans/node-lifecycle-20260916.md), [계약과 증거 경계](node-lifecycle.md).

- [노드 수명 검증 결과](../tests/reports/node-lifecycle/20260916_120900.md)


[연결 회수 계획](../tests/plans/connection-teardown-20261005.md) · [검증 기록](../tests/reports/connection-teardown/20261005_042300.md): `test/connection-teardown.mjs`는 명시한 테스트 소유 P4 바이너리와 실제 Chromium/bridge를 사용해20회 INSPECT/FINISH ACK와 PID별 잔여0을 단언한다. 배포된 제품 UI나 모델 실기 수용을 대체하지 않는다.
