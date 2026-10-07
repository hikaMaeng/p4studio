# 모델 언로딩·에이전트 복구 계약

Windows 승인 설치의 host-management 복구를 제공한다. 공개 P4 관리 drain과 POSIX runner는 미지원이며, 모든 host의 실제 자원 회수 수용은 별도 검증한다.

현재 소비 경로: [복구 DTO](../packages/studio_domain/src/common/protocol/recovery/index.ts) → [front model](../packages/studio_domain/src/front/model/recovery/store.ts) → [복구 화면](../apps/studio/src/front/features/agent-recovery/RecoveryView.tsx), [server recovery](../apps/studio/src/server/operations/recovery.ts) → [승인 Windows runner](../apps/studio/src/server/operations/windows.ts). 정상 CANCEL·RELEASE는 원래 브라우저 연결의 기존 공개 계약을 사용한다. 강제 회수는 기존 UNLOAD 영수증을 성공으로 변경하지 않는다.

| 구분 | 현재 구현 |
| --- | --- |
| R1 | 정확한 ERROR 귀속, terminal/RELEASE 정산, 연결 단절 전달, 중지·회수 버튼, `absent` projection, 단조 revision, generation별 실행 소유권과 영속 deployment history |
| R2 | 승인 Windows binary/launch/task/endpoint 검사, PID·birth·path·listener 재검사, native 고아 회수, 중복 방지, 원격 exclusive file lock, 부분 실패 뒤 현재 자원 재검토·명시적 계속, stop 이후 startup만 재개, 새 host 증거 + 브라우저 P4 INSPECT 결합 |
| R3 | 미지원. source-bound CANCEL로 다른 OUTER의 원장을 사칭하지 않는다. P4 adapter의 native/KV 관리 drain 완료를 주장하지 않는다 |
| R4 | 대상 stage와 forwarding gateway 영향 모델 집계, 서버 lease로 Studio 탭 간 admission 차단. TUF 외 OS별 runner와 다중 host 실제 회수는 미검증 |


관련 계약: [노드 수명](node-lifecycle.md), [Studio 경계](constraints.md), [P4 참조](p4-reference.md). 이 계획은 정상 UNLOAD와 강제 초기화의 결과를 구분하는 후속 변경의 소유 문서다.

## 2. 실행 경계와 제한

| 경계 | 현재 코드 / 확인한 제한 |
| --- | --- |
| Studio UNLOAD 생산자 | [operateInBrowser](../apps/studio/src/front/features/models/api.ts) → [InferenceExecutions.unload](../packages/studio_domain/src/front/model/inference/cancellation/executions.ts) → [runBrowserDeployment](../packages/studio_domain/src/common/protocol/deployments/runtime.ts) |
| 취소 범위 | `InferenceExecutions.active`는 브라우저 메모리다. 다른 탭·브라우저·OUTER의 실행이나 브라우저 종료 후의 요청을 관리하지 못한다 |
| 공개 CANCEL | [CancelCommand](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/commands.rs), [worker cancel](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/cancel.rs)는 원래 submission/source/return route를 검증한다. 새 관리 연결로 기존 소유자를 사칭할 수 없다. terminal의 `native_kv_stop_proven=false`는 native/KV 정지 증명이 아니다 |
| P4 UNLOAD 소비자 | [agent begin_unload](../../p4/entrypoints/agent/src/event_runtime/control.rs) → [worker unload](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/control.rs) → [require_idle_unload / LocalWork](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/shutdown.rs). UNLOAD는 암묵적인 cancel/drain이 아니며, tail의 요청 수 0도 idle을 보장하지 않는다 |
| native 정지 | [ServerProcess](../../p4/layers/adapters/llamacpp/staged/adapter/src/process/server_process.rs)에 native stop evidence가 있다. Studio가 이를 공통 lifecycle/inspection에서 소비하는 공개 완료 계약은 별도 대조·확장이 필요하다 |
| 상태 소비자 | [reconcileDeployment](../packages/studio_domain/src/front/model/deployments/reconcile.ts)는 알려진 LOAD 뒤 노드 부재를 unloaded로 표시할 수 있다. 강제 회수와 정상 UNLOAD 성공을 UI에서 구분하는 증거 종류가 필요하다 |
| 에이전트 초기화 | 현재 [control dispatcher](../../p4/entrypoints/agent/src/event_runtime/control.rs)에 Studio가 호출할 공개 agent reset/restart 명령이 없다. TCP bridge·SSH tunnel은 원격 프로세스 관리 기능이 아니다 |


## 3. 사용자 동선과 완료 판정

1. 모델의 **언로딩**: 영향받는 모델/node에 새 LOAD·SESSION·PREFILL·다음 웨이브를 차단하고, 소유한 실행을 취소한다. 각 stage의 drain·정지·UNLOAD 결과와 deadline을 표시한다.
2. busy 또는 deadline: `자원 남음 / 요청 결과 미확정 / 회수 필요`와 stage별 잔존 work를 표시한다. 원래 UNLOAD 오류와 cleanup 오류를 따로 유지한다.
3. **자원 회수 및 에이전트 초기화**: 관리 가능한 agent와 영향받는 모든 모델·node·요청을 보여주고 한 번의 실행으로 로그 보존, 정확한 process tree 회수, 재기동, 새 INSPECT까지 수행한다. 기본은 이 명시적 동작으로 승격하며, 무인 자동 승격은 agent별 사전 설정된 정책에서만 허용한다.
4. 성공: `자원 회수·에이전트 재기동 완료`로 표시한다. 중단된 요청은 결과 미확정/강제 중단으로 보존하고 성공한 응답이나 정상 UNLOAD로 변환하지 않는다. 모델은 미적재이며 재적재·SESSION 준비는 별도 동작이다.
5. 실패: 이전 process/native/port가 남으면 재기동을 차단한다. 재기동 실패는 `자원 회수 완료 / 에이전트 기동 실패`처럼 확인된 부분 성공을 남긴다. SSH 단절·observer timeout은 작업 ID로 재조회하며 종료/기동 명령을 무조건 재전송하지 않는다.

독립 화면은 제안 URL `/agents/:id/recovery`, 작업 상세는 `/agents/:id/recovery/:operationId`. [route parser](../apps/studio/src/front/shell/routes.ts)에 encode/decode를 포함해 한 곳에서 정의한다. 모델의 busy 화면에서 이 복구 화면으로 연결하며 reload/back/forward로 대상·작업을 복원한다.

**세 가지 완료 증거를 분리한다.**

- 정상 UNLOAD: 각 필수 stage의 정확한 node/load generation에 대해 `unload / succeeded / absent`를 소비하고 현재 node 부재·native 회수 증거를 결속한다.
- 강제 회수: 정확한 이전 프로세스·native 자식·소유 listener의 부재와 관리 작업 결과로 증명한다. 이전 UNLOAD 영수증을 덮어쓰지 않는다.
- 에이전트 재기동: 이전 incarnation 종료 + 새 process identity + 동일 승인 binary/환경 + 실제 advertise/반환 경로 INSPECT/FINISH ACK로 증명한다. listener 성공만으로 완료하지 않는다. GPU/RAM은 동일 host의 시각 있는 보조 증거이고, 무관한 GPU 작업 때문에 GPU 전체 0을 보편 조건으로 삼지 않는다.

## 4. 책임과 추가 계약

### Studio의 복구 작업

- `studio_domain/common`에 operation ID, 기대 agent incarnation, 대상 stage/generation, 영향받는 deployment revision, 단계별 결과·시각·최초 오류·cleanup 오류·증거 출처를 정의한다. 상태는 `planned → quiescing → unloading → recovery_required → stopping → stopped → starting → verifying → recovered`, 별도 `failed / unknown`을 둔다. 정상 UNLOAD는 `unloaded`로 끝내며 강제 회수 이력과 합치지 않는다.
- 서버에 **명시적인 host-management I/O 경계**를 추가한다. 이는 관리 프로세스 회수·기동만 실행하며 P4 envelope 생성·응답 매칭·추론 stream 중계를 맡지 않는다. 브라우저는 정상 P4 제어와 새 INSPECT를 계속 소유한다. [기존 서버 제약](constraints.md)의 확장을 구현 시 문서에 함께 명시한다.
- 모델/node별 기존 브라우저 barrier와 별도로 agent별 작업 lease·deployment revision guard를 저장한다. 모든 Studio LOAD/SESSION/PREFILL 시작 경로가 lease를 검사하고, 다른 탭도 차단한다. 이미 열린 연결의 지연된 명령은 프로세스 incarnation 종료와 P4 측 fence로 막는다. Studio lease만으로 임의 외부 OUTER를 차단했다고 주장하지 않는다.
- 제안 API: agent별 recovery capability 조회, 복구 계획 생성, 고정 계획 실행, operation ID로 상태 조회. destructive 실행에는 인증된 관리 권한·same-origin/CSRF 검사·감사 기록을 둔다. 주소·셸 명령·PID를 임의 body로 받아 실행하지 않는다. 같은 idempotency key는 같은 작업을 반환한다.
- 허용된 agent별 관리 profile에 host identity, transport, 승인 실행 파일·hash, launch task/service, 환경, listener, 자격 증명 참조를 둔다. SSH 키는 서버 secret mount로만 읽는다. 공개 TCP가 닿는다는 이유로 management 가능을 표시하지 않는다.
- 첫 구현 대상은 이번 TUF의 기존 Windows scheduled task다. Windows runner는 PID + 생성 시각 + 실행 경로 + listener owner + descendant identity를 종료 직전 재검사한다. POSIX 확장은 systemd/launchd 또는 검증된 supervisor process group별 profile로 후속 구현한다. 전체 머신의 `killall`, 이름만으로 종료, 무관한 task 변경·재부팅은 동작에 포함하지 않는다.
- native 후손까지 회수하고 잔존 여부를 검사한다. 관리 프로세스가 사라져도 이미 접수한 작업의 증거·결과는 유지한다. Studio 재시작 뒤 미완 작업은 host 증거로 재조회하며 자동 kill/start 재실행 대신 `unknown`에서 확인한다.
- 서버 reset 완료 이후 브라우저 새 channel/generation의 P4 증거를 합쳐 완료한다. 브라우저가 닫히면 `호스트 재기동 완료 / P4 확인 대기`를 보존하고 복구 화면 재접속에서 검증을 이어간다. 새 agent가 생긴 증거 없이 단순 INSPECT 부재만으로 불명 LOAD를 해소하지 않는다.

### P4·adapter가 소유할 보강

Studio UI만으로 원래 OUTER를 잃은 요청을 정상 drain하거나 adapter 원장을 지울 수 없다. 아래는 **P4 저장소의 별도 구현·검증 범위**이며 이번 작업에서 P4 소스를 수정하거나 새 바이너리를 배포하지 않았다.

- 먼저 head의 requests/flights와 tail의 owner/frontier가 유지된 경로를 실제 release·ownership·frontier·physical receive 소비자까지 추적한다. 이 사례의 work census와 공개 cancel/UNLOAD 시험을 반례 입력으로 남기고 정상 진행 대조를 둔다. busy guard 삭제나 카운터 강제 0은 해결책으로 채택하지 않는다.
- 관리자가 정확한 load generation을 대상으로 **신규 admission 차단 → 진행 중 작업 drain/취소 → native/KV 정지 → stage owner/frontier/receive 정리 → 전달·정산 결과 분류**를 요청할 공개 adapter 계약을 설계한다. 원래 source에 묶인 `cancel-v1`을 관리 명령으로 재사용하지 않는다. 새 content type/버전·관리 권한·stale generation 거부·부분 stage 실패 의미를 producer/consumer/fixture와 함께 확정한다.
- stop proof는 native 종료/정지, KV 해제, 요청 terminal 생성/전달, RELEASE 정산, 잔존 입력을 별도 필드로 둔다. 끊긴 OUTER에 terminal 전달을 보장할 수 없으면 undelivered/unknown으로 남긴다. 정상 drain이 성공하면 기존 Agent-target UNLOAD로 node를 제거한다.
- inspection에 버전 있는 work census·drain capability·agent incarnation·승인 native startup 정보·정지 증거의 공개 노출을 검토한다. 기존 오류 문자열의 JSON을 제품의 유일한 파싱 계약으로 고정하지 않는다. 필드 없는 구버전은 지원하지 않음/증거 없음으로 표시한다.
- agent 자체가 멈춘 경우 재기동은 agent 밖의 host supervisor가 수행한다. P4 wire의 reset 요청 하나만으로 멈춘 프로세스·native 고아·새 listener까지 제어할 수 있다고 설계하지 않는다. OS별 process-tree 수명 보장도 supervisor/adapter 시험에 포함한다.

## 5. 구현 순서와 소비자

| 순서 | 변경 위치 / 소비자 | 완료 조건 |
| --- | --- | --- |
| R1: 증거와 표시 | domain deployment/recovery DTO, runtime/reconcile, 모델 화면·에이전트 상세·기록 | `rejected/present`, unknown, native 정지 없음과 정상 unloaded를 구분; 기존 CW-TUF-01 반례 거부 |
| R2: TUF 초기화 | 신규 domain server recovery 상태 전이, app server management runner·SQLite 작업, recovery Model Render 화면·canonical route | Studio 버튼으로 이번 exact-tree 복구 수행, lease/identity/idempotency/부분 실패 검사, 재접속 뒤 작업 복원 |
| R3: 정상 drain | P4 agent/llamacpp 공개 capability·versioned commands/results, Studio browser producer/domain consumer | 원래 브라우저 종료·다른 OUTER·tail-only work에서도 지원 범위 안에서 native/KV 정지 후 정상 UNLOAD; 미지원은 R2로 명시적 승격 |
| R4: 다중 agent·운영 | capability profile 확장, 영향 모델 집계, 단계별 회수·작업 이력·구형 agent 처리 | 여러 stage의 부분 성공/회수 실패 보존, gateway 대표 초기화 영향과 다른 agent 연결 복구, 실제 host별 검증 |

R1/R2는 현재 P4 wire에 없는 명령을 발명하지 않고 먼저 제공할 수 있다. R3의 P4 계약·권한·반례가 확정되기 전에는 정상 UNLOAD 보강이 완성됐다고 보고하지 않는다. gateway agent 초기화는 그 agent의 모델뿐 아니라 이를 접수 경로로 쓰는 모델에도 영향을 줄 수 있으므로 계획에 표시한다.

소비자: 모델 LOAD/UNLOAD, 노드 UNLOAD, inference SESSION/PREFILL/웨이브, deployment receipt/reconcile, agent observation, 작업 기록, gateway reception. 구현 시 각 기존 entry point에서 lease와 새 incarnation 검사 연결 여부를 명시한다. generic `p4-protocol`에는 공개 envelope/capability codec만 두고 llama.cpp drain payload와 회수 정책은 domain/adapter에 둔다.

## 6. 실행할 검증과 수용 기준

아래는 전체 수용 기준이다. 국소 회귀·TUF 동선은 최신 구현 보고에 결과를 기록하고, 다른 OUTER 관리 drain·다중 host·독립 변이 수용은 통과로 간주하지 않는다.

| ID | 입력 / 확인할 결과 |
| --- | --- |
| REC-01 | idle 모델 정상 UNLOAD: 모든 exact-stage 성공·absent 및 정지 증거; forced reset 기록 없음 |
| REC-02 | 이번 TUF head 4 requests/2 flights + tail 0 requests/4 owners: busy guard 유지, 자원 present 표시, recovery 동선 제공 |
| REC-03 | 소유 브라우저 살아 있음 / 다른 탭 / 브라우저 종료 / 외부 OUTER: 취소 가능한 범위만 취소, 관리 drain과 source-bound CANCEL 권한 혼동 거부 |
| REC-04 | terminal만 수신 / native KV 미정지 / RELEASE 미수신 / 입력 retained: UNLOAD 완료 거부, 각각의 미완 증거 보존 |
| REC-05 | PID 재사용·경로/hash/생성 시각 변경·listener owner 불일치·대상 revision 변경: 종료 전 거부, 무관한 process 생존 |
| REC-06 | 에이전트 종료 뒤 native 고아·손자·listener 잔존: 회수 실패 또는 정체성 검증 후 추가 회수, 부재 확인 전 새 agent 기동 금지 |
| REC-07 | SSH/HTTP/브라우저 단절·중복 클릭·Studio restart·늦은 응답: 같은 operation 조회, kill/start 중복 실행 없음, 과거 receipt가 새 generation에 적용되지 않음 |
| REC-08 | 회수 성공/기동 실패, 기동 성공/INSPECT 실패, 한 stage 회수 실패: 부분 성공·최초 실패·cleanup 오류 분리, 모델 ready 승격 없음 |
| REC-09 | 같은 agent의 여러 모델, gateway 대표, 다른 탭의 새 LOAD/SESSION/웨이브: 정확한 영향 집계·lease 차단·release, 무관한 agent 정상 동작 |
| REC-10 | TUF 실기: Studio UI만으로 blocked 상태→회수→새 agent→nodes0/native0/소유 ports0→새 LOAD/SESSION→정상 질의→정상 UNLOAD; 증거는 같은 artifact와 generation에 결속 |
| REC-11 | deep URL·reload·back/forward·encoded ID·없는 대상·권한 없는 호출·CSRF: 작업 복원 또는 명시적 거부, 임의 원격 명령 실행 없음 |
| REC-12 | 독립 변이: lifecycle identity/stop proof/old-tree 부재/lease 검사를 하나씩 제거하면 대응 소비자 시험 실패. 단순 encode/decode 왕복으로 대체하지 않음 |

구현 후 범위에 맞춰 `npm run typecheck`, `npm test`, `npm run build`, 실제 브라우저/API/P4/OS 경로를 검증한다. P4 wire 변경 시 Rust fixture와 버전/identity 거부를 검사하고 해당 저장소의 검증 규약을 적용한다. 국소 GREEN, TUF 실기, 다중 host 수용을 별도로 보고한다.
