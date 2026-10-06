# 모델 언로딩·에이전트 초기화 보강 계획

2026-10-06 사용자 요청. 초기 계획 이후 Studio 구현·배포를 진행했다. **Windows 승인 설치의 강제 회수와 TUF 실제 동선은 구현·검증했고, 공개 P4 관리 drain과 모든 host 수용은 미완료**다. 목표는 UNLOAD가 막힌 경우에도 Studio에서 자원 회수와 에이전트 재기동을 끝내는 것이다.

현재 소비 경로: [복구 DTO](../packages/studio_domain/src/common/protocol/recovery/index.ts) → [front model](../packages/studio_domain/src/front/model/recovery/store.ts) → [복구 화면](../apps/studio/src/front/features/agent-recovery/RecoveryView.tsx), [server recovery](../apps/studio/src/server/operations/recovery.ts) → [승인 Windows runner](../apps/studio/src/server/operations/windows.ts). 정상 CANCEL·RELEASE는 원래 브라우저 연결의 기존 공개 계약을 사용한다. 강제 회수는 기존 UNLOAD 영수증을 성공으로 변경하지 않는다.

| 구분 | 현재 구현 / 증거 |
| --- | --- |
| R1 | 정확한 ERROR 귀속, terminal/RELEASE 정산, 연결 단절 전달, 중지·회수 버튼, `absent` projection, 단조 revision, generation별 실행 소유권과 영속 deployment history |
| R2 | 승인 Windows binary/launch/task/endpoint 검사, PID·birth·path·listener 재검사, native 고아 회수, 중복 방지, 원격 exclusive file lock, 부분 실패 뒤 현재 자원 재검토·명시적 계속, stop 이후 startup만 재개, 새 host 증거 + 브라우저 P4 INSPECT 결합 |
| R3 | 미지원. source-bound CANCEL로 다른 OUTER의 원장을 사칭하지 않는다. P4 adapter의 native/KV 관리 drain 완료를 주장하지 않는다 |
| R4 | 대상 stage와 forwarding gateway 영향 모델 집계, 서버 lease로 Studio 탭 간 admission 차단. TUF 외 OS별 runner와 다중 host 실제 회수는 미검증 |

TUF 실제 Chrome: 강제 회수 이후 새 agent/native0/nodes0 확인, Gemma 정상 답변, 제출된 요청의 CANCEL·RELEASE, 두 stage 정상 UNLOAD를 별도 검증했다. 초기 §1과 아래 최초 감사는 당시 상태를 기록한다. 최신 실행·제약은 [구현 검증 보고](../tests/reports/lifecycle-audit/20261006_163000.md)를 따른다.

관련 계약: [노드 수명](node-lifecycle.md), [Studio 경계](constraints.md), [P4 참조](p4-reference.md). 이 계획은 정상 UNLOAD와 강제 초기화의 결과를 구분하는 후속 변경의 소유 문서다.

## 1. 확인한 사례와 증거 경계

| 항목 | 2026-10-06 TUF에서 직접 확인 |
| --- | --- |
| 주소 / 기존 agent | `tcp://192.168.0.17:52000`, PID 8596, `C:\p4-agent-current\p4-agent.exe` |
| native | PID 14792 / 15528, 기존 agent의 자식, 포트 24110 / 24111 |
| head의 UNLOAD 거부 | requests 4, flight_batches 2, flight_executions 2, open_batch_view 2, active_owners 4, active_frontiers 4 |
| tail의 UNLOAD 거부 | requests / flights 0, active_owners 4, active_frontiers 4 |
| lifecycle | 두 stage 모두 `unload / rejected / present`; 성공한 UNLOAD가 아니다 |
| 수행한 복구 | 정확한 PID·경로·listener·자식·기동 task를 검사하고 로그 보존 → 기존 process tree 강제 종료 → 잔존 native·포트 검사 → 기존 S4U scheduled task 재기동 |
| 재기동 결과 | 새 PID 540, 같은 agent/native SHA256, native 프로세스 0, native listener 0 |
| 자원 | GPU used 6,512 → 0 MiB; OS free RAM 56,930,800 → 60,866,124 KiB. 약 3.75 GiB의 가용 RAM 증가이며 프로세스별 해제량 측정은 아니다 |
| 공개 P4 왕복 | 새 OUTER channel의 INSPECT 응답 + FINISH ACK, nodes 0, broker ok |
| Studio | TUF 상태 새로고침 뒤 `언로딩 완료` / 모델 로딩 버튼 표시. 현재 reconcile의 부재 projection이며 정상 UNLOAD 영수증은 아니다 |

agent SHA256: `260FD187B976D348AED7D84501B456BD1BA28651534302ADDA34E6632545A971`.
native SHA256: `2AB3F9EF3D78C6FDEC3AC779AB2567777D0A3F15E3530BD5386E749A5CF7ED92`.
원격 원본은 `C:\p4-agent-current\reset-20261006-143547\{before-processes.json,agent-before.log,reset-report.json}`에 보존했다. 로컬 작업 증거는 `target/tuf-reset-20261006/`의 before/after INSPECT, 실행 스크립트·stdout, reset report, Studio 화면이다. 첫 encoded-command 호출은 Windows 명령 길이 제한으로 실행 전에 실패했으며, 파일 전송 후 동일 guard 스크립트를 실행했다.

프로세스 종료로 자원은 회수했지만 기존 4개 요청의 정상 완료·terminal 전달·RELEASE 정산은 증명하지 않았다. `unload is busy`의 직접 조건은 확인했고, 그 원장이 남게 된 원인은 아직 미확정이다.

조사 기준: Studio HEAD `1cfc8bf46058facc5ff58d21e2e11f0ac127b50e`, P4 HEAD `6be05d78bb1d6021b3f2309a7bb5c4fecaea0261`. 두 working tree에 다른 진행 중 변경이 있어 현재 파일을 읽었으며, 이를 clean HEAD나 배포 artifact와 같다고 판정하지 않았다. 기존 진행 중 소스는 수정하지 않았다.

## 2. 초기 조사 시점의 실행 경로와 부족한 계약

| 경계 | 현재 코드 / 확인한 제한 |
| --- | --- |
| Studio UNLOAD 생산자 | [operateInBrowser](../apps/studio/src/front/features/models/api.ts) → [InferenceExecutions.unload](../packages/studio_domain/src/front/model/inference/cancellation/executions.ts) → [runBrowserDeployment](../packages/studio_domain/src/common/protocol/deployments/runtime.ts) |
| 취소 범위 | `InferenceExecutions.active`는 브라우저 메모리다. 다른 탭·브라우저·OUTER의 실행이나 브라우저 종료 후의 요청을 관리하지 못한다 |
| 공개 CANCEL | [CancelCommand](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/commands.rs), [worker cancel](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/cancel.rs)는 원래 submission/source/return route를 검증한다. 새 관리 연결로 기존 소유자를 사칭할 수 없다. terminal의 `native_kv_stop_proven=false`는 native/KV 정지 증명이 아니다 |
| P4 UNLOAD 소비자 | [agent begin_unload](../../p4/entrypoints/agent/src/event_runtime/control.rs) → [worker unload](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/control.rs) → [require_idle_unload / LocalWork](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/node/worker/shutdown.rs). UNLOAD는 암묵적인 cancel/drain이 아니며, tail의 요청 수 0도 idle을 보장하지 않는다 |
| native 정지 | [ServerProcess](../../p4/layers/adapters/llamacpp/staged/adapter/src/process/server_process.rs)에 native stop evidence가 있다. Studio가 이를 공통 lifecycle/inspection에서 소비하는 공개 완료 계약은 별도 대조·확장이 필요하다 |
| 상태 소비자 | [reconcileDeployment](../packages/studio_domain/src/front/model/deployments/reconcile.ts)는 알려진 LOAD 뒤 노드 부재를 unloaded로 표시할 수 있다. 강제 회수와 정상 UNLOAD 성공을 UI에서 구분하는 증거 종류가 필요하다 |
| 에이전트 초기화 | 현재 [control dispatcher](../../p4/entrypoints/agent/src/event_runtime/control.rs)에 Studio가 호출할 공개 agent reset/restart 명령이 없다. TCP bridge·SSH tunnel은 원격 프로세스 관리 기능이 아니다 |

기존 [CW-TUF-01](../../p4/tests/reports/connection-teardown/20261005_152300.md)의 `tools/check_unload_evidence.py` 판정 조건을 후속 정상 UNLOAD 소비자 시험에 적용한다. 해당 Python 파일을 제품에 import하지 않고, 같은 반례·판정 의미를 Studio 자체 시험으로 고정한다. 과거 원인 미확정을 이번 사례의 원인 규명으로 바꾸지 않는다.

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

초기 복구 계획의 검증은 docs 구조 검사·로컬 링크·`git diff --check`였다. 제품 기능 구현과 실제 정상 drain은 미실행이다. 다음 절은 이후 사용자가 추가한 전수 조사·결정론적 재현과 MiMo 용량 요구를 반영한다.

## 7. 2026-10-06 결정론적 감사 후속

[감사 계획](../tests/plans/lifecycle-audit-20261006.md) · [최초 반례](../tests/reports/lifecycle-audit/20261006_145500.md). 최초 감사에서는12개 RED와 Chromium UI 결함3개를 재현했다. 아래 소비 경로를 구현하고 동일 반례를 재검사했다. 최초 RED는 이후 통과 결과와 구분해 보존한다.

| 우선순위 | 수정할 소비 경로 / 완료 조건 |
| --- | --- |
| 1 | 일반 ERROR를 정확한 source/correlation/causation/load/session/submission에 귀속한다. 한 요청의 refusal로 이미 접수된 다른 요청을 failed/정산 완료로 바꾸지 않는다 |
| 1 | 화면의 실패와 remote settlement 수명을 분리한다. 오류 뒤에도 원래 연결의 소유자를 보존하고 CANCEL/terminal/OUTPUT prefix/RELEASE를 소비한다. natural OUTPUT 완료도 RELEASE 전에 연결을 닫지 않는다 |
| 1 | connection/reception의 transport close/error를 실행 모델에 전달한다. 결과 불명에 최초 오류·부분 출력·미정산 owner를 남긴다. FINISH ACK는 요청/native/KV 정산 증거로 사용하지 않는다 |
| 1 | 모델/node 기록 폐기 전에 영향받는 자원과 회수 권한을 보여준다. loaded/unknown 선언을 확인 없이 discard=true로 삭제하지 않는다. 삭제한 선언의 정확한 LOAD owner와 회수·강제 초기화 이력은 operation journal에 남긴다 |
| 2 | 요청 상세에도 같은 live run의 중지 버튼을 제공한다. failed/unknown 뒤에는 settlement/recovery 동선이 보이며 페이지 이동·새로고침으로 사라지지 않는다 |
| 2 | node UNLOAD도 model UNLOAD와 같은 유한 deadline·거부/실패/불명 영속 기록을 쓴다. 단조 revision/CAS와 agent별 작업 lease로 같은 ms·여러 탭의 갱신 경합을 막는다 |
| 2 | 빈 INSPECT를 관측 부재로 표시하고 정상 UNLOAD succeeded/absent 또는 force recovery 완료와 구분한다. 과거 unload/rejected/present 및 중단된 요청 이력은 새 LOAD가 시작돼도 보존한다 |

### MiMo 동시10 ×10회 ·5초 간격 용량

요구를20건 시험으로 축소하거나 앞 웨이브의 응답 완료까지 다음 제출을 직렬화하지 않는다. adapter의 실행 슬롯과 pending 요청 보유를 구분하고, 요청100건이 동시에 보유돼도 수용할 RAM 예산을 LOAD 전에 준비한다. 필요하면 그 이상의 headroom도 명시한다.

- 과거 구성은 sequence_capacity20와 max_requests20였다. P4의 요청 보유 예산은 count/bytes/input-token/output-token 합을 검사하며, 초과는 명시적 refusal이다. 현재 요청 admission/pending 경로에는 요청 디스크 spill/page-in이 없다. 모델·KV·OS 페이징과 동일 기능으로 취급하지 않는다.
- 감사 당시 MiMo 선언은 max_requests100/output_tokens819200였고 세 번째 stage native exit5와 앞 두 stage UNLOAD 기록이 있었다. 최신 후속 실제 적재와 회수는 [독립 리뷰 실행 보고](../tests/reports/lifecycle-audit/20261006_170000-zero-context-review.md)에서 별도 판정한다. 선언100만으로 실제 적재·100건 응답을 완료했다고 하지 않는다. 과거 보유 예산 오류와 최신 native 초기화 오류는 별도 원인이다.
- 생성 cap8192이면 보유100건 예약은 최소819200 output tokens다. 사용자 시험 cap512와는 구분한다. max_input_tokens150000, retained bytes64MiB 및 terminal/release/completion/edge 저장 한도도 실제100건 입력·토큰 총량과 함께 대조한다. sequence_capacity/KV를100으로 늘리는 변경은 자동으로 따라붙이지 않는다.
- Studio는 현재 profile의 요청 수·output/input token·request/retained byte 예산을 첫 SESSION 전에 검사한다. 입력 토큰은 실제 wire prompt의 UTF8 bytes를 사용한 보수적 추정이며, 실제 tokenization/admission은 adapter의 권한이다. 요청100건·5초 간격은 응답 완료를 기다려20건으로 축소하지 않는다. 적재 profile 부족은 실행 전에 표시한다. MiMo 실제 native 적재·100건 생성·정산은 별도 미완 수용이다.

추가 수용 조건: 오류 요청1개와 정상 접수 요청N개를 섞어 남은 owner를 회수하고, RELEASE 전 연결 종료·stale ERROR 소비·transport 단절 방치를 독립적으로 검사한다. 100건의 생성 응답·terminal·RELEASE, 모든 필수 stage의 정상 UNLOAD와 native 자원 회수를 같은 artifact/generation으로 결속한다. TUF의 제한된 실기 수용 및 MiMo의 후속 결과는 [구현 보고](../tests/reports/lifecycle-audit/20261006_163000.md)와 [독립 재검토](../tests/reports/lifecycle-audit/20261006_170000-zero-context-review.md)에 artifact/generation별로 기록한다.
