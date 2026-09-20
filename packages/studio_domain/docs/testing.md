# Testing

- [reconcile.test.ts](../src/front/model/deployments/reconcile.test.ts): INSPECT의 loaded를 ready로 승격하지 않음, absent/empty 미적재, 부분 접속 실패, 노드 세대·adapter 불일치, 전환 상태, worker 정지, 이전 LOAD 근거 보존. [상태 조회 계약](api.md#model-refresh).

[presets.test.ts](../src/server/deployments/presets.test.ts)는 HY3 6노드와 Step 16노드의 원본 인자 보존, JSON/plan 수정·재해석, 오래된 요약 거부, 기존 구성 변환, 이종 backend ABI 대조를 검사한다. 원본과 전용 페이지의 연결은 [model configurations](model-configurations.md)에 기록한다.

저장소 루트에서 실행한다.

```powershell
npm run typecheck --workspace=@p4studio/studio_domain
npm test --workspace=@p4studio/studio_domain
```

[modelRender.test.ts](../src/front/model/modelRender.test.ts)는 동일 값 갱신의 알림 생략과 값 변경/구독을 검사한다. 이 시험으로 deployment 제어의 완료를 주장하지 않는다.

[timing.test.ts](../src/front/model/inference/timing.test.ts)는 요청별 전송 기준 TTFT, 요청·웨이브 간 시각 격리, 첫 토큰·동시 수신의 미측정 상태, 소수 시각, sampled terminal token, v1 TPS 환산과 v3 이전 TTFT 무효화를 검사한다. [계산 계약](api.md#inference-timing)의 브라우저 수신 TPS를 검증하며 엔진 처리량 시험은 아니다.

[monitoring-summary.test.ts](../src/front/model/inference/monitoring-summary.test.ts)는 batch/span의 run·stage 집계, 중복 event 제거, phase·execution·시간 합계, 전체·웨이브별 TTFT p50/p95/최댓값, 최종 TPS p50과 이전 snapshot 기록의 중복 제거를 검사한다.

[observability.test.ts](../src/front/model/inference/observability.test.ts)는 요청 owner를 유지한 batch fill·phase 집계, execution owner를 유지한 stage 시간 집계와 1초 output window 병합을 검사한다. 실제 GPU 표본 간격·브라우저 렌더·P4 event 완전성은 별도 연동 시험 대상이다.

배치 규칙 변경은 레이어 누락/중복, endpoint·generation, 불법 옵션과 adapter payload를 검사한다. 실행기 변경은 가짜 transport로 stage별 완료·부분 실패·결과 불명 보존을 재현하고 실제 앱 소비 경로와 agent 연동을 별도로 검증한다. 현재 존재하는 시험과 새로 필요한 시험을 결과에 구분한다.

P4 wire 호환은 [protocol testing](../../p4-protocol/docs/testing.md), 화면·실제 연동은 [Studio testing](../../../docs/testing.md)을 따른다. 이 문서는 시험 실행 보고서가 아니다.

[plan.test.ts](../src/server/deployments/plan.test.ts)는 Windows 경로 인용, 겹침/누락, 표시한 배치를 덮어쓰는 옵션 거부, 다른 어댑터의 JSON 전달을 검사한다. 실제 응답 소비 검증은 [앱 deployment 통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이 소유한다.
## Agent groups

[routing.test.ts](../src/common/protocol/agent-groups/routing.test.ts)는 그룹별 gateway 선택, 비소속 직접 경로, 누락/다중 소속 거부를 검증한다. 실제 HTTP·browser·bridge 소비 경로는 [Studio tests](../../../apps/studio/docs/testing.md#gateway-group-verification)와 연결한다.

수명 codec·browser runtime·단절/부분 실패 회수와 UI 검증은 [노드 수명 계획](../../../tests/plans/node-lifecycle-20260916.md)을 따른다.
