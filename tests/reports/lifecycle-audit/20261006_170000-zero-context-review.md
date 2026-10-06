# Zero-context ownership review — 2026-10-06

판정: **전체 수정 미완료**. 사용자 요청으로 `fork_turns: none`인 독립 서브에이전트가 현재 소스와 시험/Chrome/P4 자료를 읽었다. 주 에이전트의 기존 완료 결론이나 대화 기록을 전달하지 않았다. 독립 리뷰 중 제품 수정·배포는 각 회차마다 고정했다. 별도 사용자 채팅의 17:00경 모델 목록 UI 배포는 lifecycle 핵심 파일과 분리했다.

## 첫 독립 리뷰

- P1: inference `finally`가 pending owner도 live lease와 함께 해제한다. 먼저 열린 다른 탭은 자기 메모리에서 unknown owner를 보지 못하고 같은 LOAD 세대의 SESSION/PREFILL을 다시 허용받는다.
- P1: pre-wave `pending + concurrency` 체크포인트 뒤 오래된 periodic snapshot이 저장되면 실제 PREFILL을 보낸 owner가 submitted0/pending0으로 복원될 수 있다.
- 결론: 반례를 유지하고 현재 소비자·Chrome·실기와 대조한 접근은 무작위 시행착오로 보기 어렵다. 그러나 메모리/IndexedDB/SQLite 간 원장 불변식을 닫지 못한 부분수정이 남았다.

실행은 native PowerShell here-string → `node --import tsx --input-type=module -`. 현재 TS의 InferenceCancellation/OperationLeases와 메모리 SQLite, BrowserInferenceHistory와 수동 commit IDB를 사용했다. 실제 native 장애 또는 Chrome 두 탭 전체 실행은 이 독립 반례의 증거가 아니다.

```text
owner A before finally: state=unknown, pendingSettlement=1, settled=false
already-open peer B admission after execute finally: ready=true
stale periodic persist after admission checkpoint: submitted=0,pendingSettlement=0
```

## 후속 독립 리뷰: 아직 배포하지 않은 수정

기존 두 반례는 durable generation owner 및 monotonic checkpoint guard로 닫혔지만 두 후속 P1이 확인됐다.

- P1: owner credential이 없는 settlement PUT만으로 journal을 정산 처리할 수 있다. operationId/loadGeneration을 아는 다른 호출자의 `{pendingSettlement:0,submitted:0}`에 204, 이어 peer admission ready=true. 실제 HTTP 라우터/SQLite 반례이며 일반 UI가 이 PUT을 생성했다는 주장은 아니다.
- P1: stale peer의 delete가 현재 admitted10/pending10을 tombstone으로 바꾸고, 다음 mandatory checkpoint는 쓰기 없이 성공한다. preparing0을 읽은 peer의 unknown0 복원과 삭제 UI 조건을 소스로 대조했다.

```text
original release-only counterexample now: settlement is unknown
another caller asserts pending0 without owner credential: 204
peer admission after assertion: ready=true
original stale snapshot counterexample now: pendingSettlement=10
peer stale view deletion of current admitted owner: deleted=true
pre-PREFILL checkpoint returns success after deletion: checkpointResolved=true
```

동시에 TTL 만료/같은 DB 객체 재구성/alias node generation 차단과 fresh LOAD 분리, old unknown owner 보존을 직접 실행했다. reserve10/send3/abandon7은 pending3, admitted10, settled7이며 단절 뒤에도 세 실제 요청을 미정산으로 남긴다.

## 통합 불변식과 후속 수정

| 사실 | 권위 있는 저장/검사 | 해제 조건 |
| --- | --- | --- |
| SESSION admission owner | 서버 SQLite의 model/load/node-generation 원장, 모든 탭의 lease admission에서 검사 | original browser ledger의 exact 정산과 private capability; fresh LOAD는 새 generation으로 구분하며 옛 기록 보존 |
| live lease | SQLite TTL/heartbeat/revocation | 만료·DELETE는 live lease만 해제; 정산으로 간주하지 않음 |
| PREFILL 가능성 | live ledger reserve와 IndexedDB mandatory checkpoint | 정확히 unsent인 예약 또는 terminal/refusal/RELEASE로만 settlement watermark 증가 |
| 과거 snapshot | IDB 동일 transaction의 monotonic admission/settlement watermark | rollback 불가; mandatory write가 생략되면 다음 PREFILL 금지 |
| 기록 삭제 | IDB actual active/pending과 revision CAS | 현재 inactive/pending0 증거 후 tombstone; UI는 durable 성공 뒤만 제거 |
| 정산 권한 | 실행 closure의 UUID capability, 서버에는 SHA256만 저장 | 다른 호출자의 operationId/loadGeneration만으로는 해제 불가 |

후속 기본 검사: [typecheck22](../../../target/lifecycle-fix-typecheck-22.log), [regression19](../../../target/lifecycle-fix-regression-19.log), protocol24 + domain147 + app97 = **268 PASS**. Source/DTO build와 별개로 최신 deployed Chrome 결합과 독립 재검토는 아직 진행 중이다. 이 표만으로 전체 완료를 판정하지 않는다.

## 실제 증거의 범위

- 기존 Chrome7은 P4 wire와 lease 응답을 모사했다. [7개 재실행](../../../test/20261006/170000_lifecycle-review/browser/browser-report.json). 서버 미정산 fence와 두 탭 결합의 증거가 아니다.
- 기존 native TUF100은 Gemma12B/output32/10×10/5초, completed100·pending0와 두 stage UNLOAD. [실기](../../../test/20261006/165000_tuf-capacity100-final/report.json). MiMo512/다중 host100과 구분한다.
- 기존 approved Windows force 회수 PID23400→31776 및 fresh INSPECT/이력: [실기](../../../test/20261006/162500_tuf-recovery-final/report.json). 정상 CANCEL/RELEASE/UNLOAD의 영수증이 아니다.
- MiMo100/512, 공개 native/KV 관리 drain, TUF 외 OS 회수, 다중 host 전체 수용은 미완료다.
- Studio local/remote main만, worktree 하나인 현재 Git 사실과 다른 저장소의 활성 작업을 구분한다. 현재 수정은 dirty working tree이며 main HEAD만의 수용 시험이 아니다.

[기존 구현 보고](20261006_163000.md)의 오래된 실행 수/배포 링크는 역사 자료이며 최신 상태와 합산하지 않는다. 후속 Chrome 및 최종 아티팩트 결속 결과를 실행 후 갱신한다.
## 세 번째 독립 리뷰와 generation 수정

기존 네 P1 반례와 관련 55개 시험은 독립 재실행을 통과했다. 추가 P1은 LOAD42 unknown 이력의 Recover가 현재 LOAD43 owner를 취소하고 node generations10/11에 UNLOAD를 생성하는 경로다. actual models API/domain을 메모리 번들하여 I/O stub으로 실행했고 실제 native 삭제는 없었다.

Recover가 `run.loadGeneration ?? 0`을 gateway로 전달하고 최초 fresh list 직후 expected generation이 없거나 달라지면 cancellation 전에 거부하도록 수정했다. barrier 후 기존 LOAD/node identity 및 receipt revision 검사는 유지한다. actual API 시험4개는 옛42/미상0 거부, barrier 중43→44 변경 거부, current43 정상 UNLOAD 보존을 검사한다. [typecheck23](../../../target/lifecycle-fix-typecheck-23.log), [regression21](../../../target/lifecycle-fix-regression-21.log): protocol24 + domain147 + app101 = **272 PASS**. regression20의 실패는 기존 spy의 optional undefined 인자 assertion 차이였고 수정 후 전체 재실행했다. 배포 및 실제 Chrome 결합 전 결과이며 독립 generation 재검토는 진행 중이다.

마지막 독립 actual-source 반례: expected42/0 → rejected, current owner preparing/cancelRequested false, lease0/wire0. matching43 경로 유지 및 API/history/lease13시험 PASS. 추가 확정 결함 없음. 다섯 반례가 source/local 범위에서 닫혔으며 배포/Chrome/server journal/MiMo acceptance와 구분한다.

## 최신 배포와 Chrome 결합

- [공식 deploy8](../../../target/lifecycle-fix-deploy-8.log): build/compose/health43120 PASS. [artifact binding](../../../test/20261006/173700_ownership-server-chrome/artifact-binding.json): server cbbb…4a44/front 0b07…ac7b, local/deployed SHA256 일치.
- [Chrome7](../../../test/20261006/173900_lifecycle-final/browser/browser-report.json): 기존 소비 경로 최신 재실행. P4/lease HTTP는 fixture.
- [과거 generation 회수](../../../test/20261006/174200_generation-chrome/browser/browser-report.json): deployed UI의 run42→current43 Recover가 cancellation/UNLOAD/새 lease0. P4/HTTP fixture.
- [실제 서버 두 탭](../../../test/20261006/173700_ownership-server-chrome/browser-report.json): 원래 owner 단절·live lease DELETE 이후 이미 열린 peer POST409, SESSION/PREFILL 증가0. SQLite/HTTP actual, P4 binary WS fixture.
- [정상 정산 대조](../../../test/20261006/174400_ownership-positive/browser-repeat/browser-report.json): original2요청 pending0/settlement204 뒤 peer1요청 허용 및 exact settlement204. 첫 실행은 완료한 뒤 route teardown의 in-flight fetch를 await하지 않아 harness exception이 났다. unrouteAll(wait) 뒤 재실행 PASS. 두 경우의 실제 journal 상태를 확인했다. [fixture cleanup](../../../test/20261006/174400_ownership-positive/fixture-cleanup.json)은 virtual 선언만 제거하고 unknown journal은 보존한다. 실제 native LOAD/UNLOAD로 집계하지 않는다.
- [별도 소비자 감사](../../../target/lifecycle-fix-audit-current.log):21 PASS. 전체272의 부분집합이며 합산하지 않는다.

## MiMo 후속 실기와 시험 도구 경계

[첫 실제 LOAD](../../../test/20261006/173900_mimo100-current/report.json)는 GB10 마지막 stage native exit5, 앞 세 stage 정상 UNLOAD, 최종 resource absent. exact original plan의 stderr를 별도 native 프로세스로 확인한 [diagnostic](../../../target/lifecycle-mimo-gb10-exact-plan-diagnostic.log)은 shared device required93946458368/free124470726656이지만 host free1452519424로 fits=false였다. 모델 복사 cache가 host MemFree를 줄인 상태다. binary/모델 설정은 그대로 두고 복사한 local/NAS MiMo 두 shard만 fsync·DONTNEED로 cache advice했다. 다른 파일이나 global cache, 다른 process는 조작하지 않았다.

초기 재시험 helper는 새 LOAD 생성 전 이전 absent/exit5 기록을 읽어 브라우저를 닫았다. 시험 도구의 경합으로 분류하고 원본 실패 아티팩트를 보존했다. helper는 baseline LOAD generation 변경부터 기다린다. [fresh Chrome INSPECT](../../../test/20261006/175300_mimo-fresh-absence/report.json)는 모든 node missing/resource absent 확인이며 정상 UNLOAD 영수증으로 대체하지 않는다. [실제 새 시도](../../../test/20261006/175400_mimo100-cold-model-recheck/progress.json)는 현재 마지막 stage 로딩 중, 인퍼런스100 수용은 아직 판정하지 않는다.

## 실제 MiMo 수용 RED

four-stage LOAD 성공 뒤 actual100 PREFILL을45초 동안 제출했다. wave=[0,5003,10007,15019,20008,25013,30004,35020,40006,45007]. 42completed/58pending 및28590tokens 후 M42 gateway TCP가 닫혔다. [실기](../../../test/20261006/175400_mimo100-cold-model-recheck/report.json). SSH runtime census에서 M42 agent/native/52000 모두0, SSH 도달성은 유지됐다. 종료 원인은 미확정이다. 기존 canonical task의 agent/native hash와 port0/process0을 확인하여 start-only로 PID14776을 복원했다. 소스/바이너리 교체 또는 기존 process kill은 없었다.

새 Chrome INSPECT는 M42 두 stage missing, PC/GB10 stage loaded를 보였다. 공개 UNLOAD는 [두 stage를 busy/present로 거부](../../../test/20261006/180100_mimo-failed-inference-cleanup/current-unload-rejections.json): PC requests58/pending38/flights4/activeowners20/frontiers20, GB10 requests0/activeowners20/frontiers20. 이는 current Studio/local5P1 closure와 별개인 실제 public P4 회수 실패다. Studio의 unknown58와 durable owner 원장은 유지되며 전체 완료를 선언하지 않는다. TUF-only force profile로 PC/GB10의 UI 회수는 현재 제공되지 않는다.

## 독립 P2 후속과 사용자 SSH 재기동

독립 actual-source 반례에서 fresh missing 두 stage + 다른 stage 정상UNLOAD를 global unloaded로 판정하고 SESSIONproof를 보존했다. aggregate는 모든 정상 lifecycle UNLOAD일 때만 unloaded, 모든 현재 resource없지만 missing/forced혼합은 absent, foreign occupied/present는 failed로 분리했다. model/node UNLOAD 시작부터 기존 SESSIONproof를 무효화한다. missingstage의 과거LOAD이력은 그대로 둔다. 독립 재검증은 mixed→absent/proofnull, occupied→failed/UNLOAD0/present를 확인했고 runtime25시험 PASS, 추가 확정결함 없음.

[typecheck24](../../../target/lifecycle-fix-typecheck-24.log), [regression23](../../../target/lifecycle-fix-regression-23.log): protocol24+domain149+app101=274 PASS. [deploy9](../../../target/lifecycle-fix-deploy-9.log) 공식build/compose/health PASS. [mixed Chrome](../../../test/20261006/181500_mixed-unload-chrome/browser/browser-report.json)은 deployedUI/P4·HTTPfixture이며 실제 busy회수의 성공이 아니다.

사용자가 SSH로 S드라이브 존재를 전제로 기존process제거·재기동을 명시했다. 문제gatewayM42로 범위를 밝혔고 hash/PIDbirth/path/children/port검증 후 canonical InteractiveToken 작업으로14776→18612, native0, port52000 새PID소유를 확인했다. [SSH proof](../../../test/20261006/180500_m42-user-reset/ssh-reset-stdin.log), [actual Chrome INSPECT nodes0](../../../test/20261006/180500_m42-user-reset/browser-report.json). S드라이브 접근 성공은 확인한 사실로 주장하지 않는다. 최초SSH는 Windowscommandline길이제한으로 실행되지 않았고 stdinbootstrap으로 수정했으며, 최초Chromelocator는 사용하지 않는 번역키라 actualsnapshotnodes0 뒤 화면 assertion만 실패했다. 원본failure는 보존하고 actualresource키로 재실행했다.

전체 수용은 **RED**다. 기존 다섯P1 + aggregateP2의 source/local 수정·독립 재실행은 닫혔으나 MiMo42완료/58unknown 및 PC·GB10의 publicUNLOADbusy/present는 유지된다. M42재기동은 사라진중간stage 및 남은owner의 정상정산을 증명하지 않는다. 관리OUTER가 original-ownerCANCEL/declared-predecessorRELEASE/SETTLE을 임의권한으로 사용할 수 없고, 현재publicUNLOAD는 idle만성공한다. 승인된 대상host회수지원 또는 별도publicmanagement drain/reset계약이 필요하다. StudioUI수정권한을 다른P4코드·배포·host강제조작의 권한으로 확대하지 않는다.
