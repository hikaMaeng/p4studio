# Testing

[presets.test.ts](../src/server/deployments/presets.test.ts)는 HY3 6노드와 Step 16노드의 원본 인자 보존, JSON/plan 수정·재해석, 오래된 요약 거부, 기존 구성 변환, 이종 backend ABI 대조를 검사한다. 원본과 전용 페이지의 연결은 [model configurations](model-configurations.md)에 기록한다.

저장소 루트에서 실행한다.

```powershell
npm run typecheck --workspace=@p4studio/studio_domain
npm test --workspace=@p4studio/studio_domain
```

[modelRender.test.ts](../src/front/model/modelRender.test.ts)는 동일 값 갱신의 알림 생략과 값 변경/구독을 검사한다. 이 시험으로 deployment 제어의 완료를 주장하지 않는다.

배치 규칙 변경은 레이어 누락/중복, endpoint·generation, 불법 옵션과 adapter payload를 검사한다. 실행기 변경은 가짜 transport로 stage별 완료·부분 실패·결과 불명 보존을 재현하고 실제 앱 소비 경로와 agent 연동을 별도로 검증한다. 현재 존재하는 시험과 새로 필요한 시험을 결과에 구분한다.

P4 wire 호환은 [protocol testing](../../p4-protocol/docs/testing.md), 화면·실제 연동은 [Studio testing](../../../docs/testing.md)을 따른다. 이 문서는 시험 실행 보고서가 아니다.

[plan.test.ts](../src/server/deployments/plan.test.ts)는 Windows 경로 인용, 겹침/누락, 표시한 배치를 덮어쓰는 옵션 거부, 다른 어댑터의 JSON 전달을 검사한다. 실제 응답 소비 검증은 [앱 deployment 통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이 소유한다.
