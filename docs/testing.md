# Testing

```powershell
npm run typecheck
npm test
npm run build
```

브라우저 계약은 단일 `main`, 이름 있는 `navigation`, 이름 있는 섹션과 폼, `role=status|alert` 상태면을 사용한다. 주요 제어는 보이는 한국어 accessible name으로 찾는다. 반복 카드만 `agent-card`, `pipeline-stage` test id를 사용한다.

에이전트 검증은 protocol codec fixture, API registration/edit observation, SQLite 충돌 보존, 조회 실패 분리, monitor 동시성 제한, 실제 P4 agent를 대상으로 한 목록→상세→편집 브라우저 동선까지 구분한다. 목록은 `agent-row`에서 `<관리 이름> 상세 보기`, 상세는 `agent-detail`, 복귀는 `에이전트 목록으로`, 편집 폼은 `<관리 이름> 등록정보 편집` 접근 이름을 사용한다.
