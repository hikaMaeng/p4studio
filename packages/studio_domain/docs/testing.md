# Testing

- [Speculative reducer tests](../src/front/model/inference/speculative/index.test.ts) cover versioning/count bounds, weighted aggregation, replay counters supplied by P4, EOS output independence, duplicate conflicts, stale identity rejection, bounded charts and history compatibility. [Store tests](../src/front/model/inference/store.test.ts) cover first-observation publication. [Browser consumer tests](../../../apps/studio/src/front/features/inference/api.test.ts) validate head class/route, exact return owner, shared OUTPUT incarnation and persistence; [browser scenario](../../../tests/browser/speculative-decoding.mjs) covers rendered live/history/request views.

- [cancellation/control.test.ts](../src/front/model/inference/cancellation/control.test.ts): 정확한 PREFILL당 단일 CANCEL, 완료 요청 보존, RELEASE/terminal 역순·늦은 OUTPUT prefix, 큐 취소 거부, stale identity 거부, 정산 불명, 자연 완료 경합, 공유 노드 UNLOAD barrier와 SESSION proof 저장 경합을 검사한다. [store.test.ts](../src/front/model/inference/store.test.ts)는 진행 중 삭제 금지와 취소 중 구독 유지의 소비 경로를 검사한다.

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

[observability.test.ts](../src/front/model/inference/observability.test.ts)는 요청 owner를 유지한 batch fill·phase 집계(실행 시점 issue cap이 stale configured UBATCH보다 우선하는 1행/cap 10 = 10%, cap 없음·0의 표시된 fallback, 분모 부재 시 무측정, 다중 physical batch·다중 stage의 observation별 분모), execution owner를 유지한 stage 시간 집계와 1초 output window 병합을 검사한다. 같은 파일은 폭 10 발행 2건(같은 초)·1건(다음 초)이 모두 10 row/batch로 투영되는 `projectPhaseWorkSeries` 반례, stage 병합·ready 최대·physical batch 없는 bucket의 `null`, 다중 request batch와 phase-mixed 집계의 분리를 검사한다. [monitoring-summary.test.ts](../src/front/model/inference/monitoring-summary.test.ts)는 첫 `idle_ms` 9,284,758과 둘째 3이 `initialIdleMs`·`idleMs`로 분리되는 것, 중복 관측이 첫 idle 자리를 소비하지 않는 것, legacy 재구성의 동일 분리와 `initialIdleMs` 기본값을 검사한다. 실제 GPU 표본 간격·브라우저 렌더·P4 event 완전성은 별도 연동 시험 대상이다.

배치 규칙 변경은 레이어 누락/중복, endpoint·generation, 불법 옵션과 adapter payload를 검사한다. 실행기 변경은 가짜 transport로 stage별 완료·부분 실패·결과 불명 보존을 재현하고 실제 앱 소비 경로와 agent 연동을 별도로 검증한다. 현재 존재하는 시험과 새로 필요한 시험을 결과에 구분한다.

P4 wire 호환은 [protocol testing](../../p4-protocol/docs/testing.md), 화면·실제 연동은 [Studio testing](../../../docs/testing.md)을 따른다. 이 문서는 시험 실행 보고서가 아니다.

[plan.test.ts](../src/server/deployments/plan.test.ts)는 Windows 경로 인용, 겹침/누락, 표시한 배치를 덮어쓰는 옵션 거부, 다른 어댑터의 JSON 전달을 검사한다. 실제 응답 소비 검증은 [앱 deployment 통합시험](../../../apps/studio/src/server/api/deployments.test.ts)이 소유한다.
## Agent groups

[routing.test.ts](../src/common/protocol/agent-groups/routing.test.ts)는 그룹별 gateway 선택, 비소속 직접 경로, 누락/다중 소속 거부를 검증한다. 실제 HTTP·browser·bridge 소비 경로는 [Studio tests](../../../apps/studio/docs/testing.md#gateway-group-verification)와 연결한다.

수명 codec·browser runtime·단절/부분 실패 회수와 UI 검증은 [노드 수명 검증 계약](../../../docs/testing.md)을 따른다.

[session.test.ts](../src/common/protocol/deployments/session.test.ts)는 v4/v5·일부 부재·불일치·오래된 LOAD·중복/누락 보고와 LOAD 확정용 `checkLoadStageContracts`(전체 일치 반환·구 adapter legacy 분리·단일 stage 허용)를 검사한다. [compatibility.test.ts](../src/common/protocol/deployments/compatibility.test.ts)는 `p4pb6le64` 통과·구 ABI 거부·잘못된 hash/type 목록·stage 불일치·exact-build 미지원 ABI 거부를 검사한다. [cc-env.test.ts](../src/common/protocol/deployments/cc-env.ts)는 CC/W 환경 일치·계약 파싱·선언/보고/증거 구분 요약을 검사한다. [runtime.test.ts](../src/common/protocol/deployments/runtime.test.ts)는 계약 일치 시 loaded 확정·불일치/부분 누락 시 역순 회수·회수 실패 보존을 검사한다. [speculative/index.test.ts](../src/front/model/inference/speculative/index.test.ts)는 draft 0 라운드의 범위 포함과 채택률 불변을 검사한다. [batch-requests.test.ts](../src/front/model/inference/batch-requests.test.ts)는 입력 불변·고유 owner·1/2/3/4/5+·phase 혼합·정확한 평균·미관측·history 호환을 검사한다. observability 시험은 verify/replay의 평균·null을 포함한다. presets 시험은 세 새 구성의 payload·slot·노트·SHA 형식을 검사한다. [CC 오류 시험](../src/front/model/inference/cancellation/control.test.ts)은 exact submission 즉시 정산과 owner RELEASE 대기를 분리한다.

SESSION 시험은 계약 불일치·일부 누락·null/빈 문자열/NUL·LOAD 세대 불일치/부재의 정확한 오류 코드를 검사한다. A2 연결은 [앱 소비 시험](../../../apps/studio/src/front/features/inference/api.test.ts)의 실제 BatchObservation 수신, 같은 stage 중복 제거, 다른 stage 별도 누적, 저장 및 새 API 인스턴스 복원으로 검증한다. [변이 시험](../../../tests/integration/studio-revamp-mutation.mjs)은 TEMP 도메인 복사본의 분포 누적 호출을 제거해 이 연결 시험이 실패하는지 확인한다. 순수 계산 시험만으로 수신 연결을 승인하지 않는다.
