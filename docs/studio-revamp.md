# Studio 관측·워크로드·SESSION 호환 계약

## 소유 경로와 소비자

| 경계 | 구현·소비자 | 계약 |
| --- | --- | --- |
| 페이즈 그래프 | [도메인 관측](../packages/studio_domain/src/front/model/inference/observability.ts), [화면](../apps/studio/src/front/features/inference/InferenceObservability.tsx) | 1초 bucket의 물리 배치당 평균 prefill/decode/verify/replay 행. batch 없는 bucket은 null |
| 요청 수 분포 | [순수 계산](../packages/studio_domain/src/front/model/inference/batch-requests.ts), [패널](../apps/studio/src/front/features/inference/observability/BatchRequestDistributionPanel.tsx) | owned_requests의 고유 request_id 수. 1·2·3·4·5+ 배치 수, 실제 요청 합/배치 수, 2개 이상 배치/배치 수 |
| 입장 시각 | [공개 관측 schema](../packages/studio_domain/src/common/protocol/inference/telemetry.ts), 요청 상세 | slot 입장 이벤트·시각이 없어 두 구간 모두 측정 불가 |
| speculative | [집계](../packages/studio_domain/src/front/model/inference/speculative/index.ts), [패널](../apps/studio/src/front/features/inference/speculative/SpeculativeMetrics.tsx) | speculative-round-v1만 사용. 채택률=sum accepted/sum drafted, 경로 비율=경로 rounds/전체 rounds |
| 워크로드 | [계획 파서](../packages/studio_domain/src/common/protocol/deployments/payload.ts), [브라우저 실행기](../apps/studio/src/front/features/inference/api.ts), [입력·결과](../apps/studio/src/front/features/inference/InferenceView.tsx) | 최소 stage n_seq_max 경고, scheduled/after-completion 설정과 기록 |
| SESSION | [선택기](../packages/studio_domain/src/common/protocol/deployments/session.ts), 브라우저 실행기 | LOAD 보고 계약 일치 후 v5, 전체 부재는 v4. head READY→다음 stage 순서 유지 |
| 등록·노트 | [preset](../packages/studio_domain/src/common/protocol/deployments/presets.ts), [등록 스크립트](../scripts/register-recorded-models.mjs), [모델 구성](../packages/studio_domain/docs/model-configurations.md) | 선택한 preset을 공개 HTTP API로 선언 등록. P4 실행·probe·빈 node 등록 없음 |

## 관측 해석

분포는 승인된 관측의 stage 실행들을 누적한다. owned_requests는 수신 OUTER에 공개된 소유 목록이다. 다른 OUTER의 요청을 request_count로 보충하지 않는다. 여러 stage가 같은 요청을 처리해도 각 stage의 물리 실행은 별도 표본이다. phase 행은 해당 phase의 owner row가 양수인 요청만 세고, 그 phase가 없는 배치는 분모에서 제외한다. 혼합 배치는 여러 phase 행에 들어간다. 중복 observation은 기존 recordBatchSummary가 제거한 뒤 계산한다. 과거 기록에 분포가 없으면 bounded latest snapshot에서 복원하지 않고 미측정으로 둔다.

P4 main `commands.rs`의 BatchObservation, StageSpan, Output에는 요청의 slot 입장 시각이 없다. scheduling.pending_admission은 순간 개수이며 요청별 시각이 아니다. StageSpan.ingress는 발행된 물리 작업의 stage 도착 시각이라 입장 시각을 대신할 수 없다. TTFT는 브라우저 실제 송신부터 첫 OUTPUT 수신까지이며 입장 대기·계산·전송·브라우저 지연을 포함한다. 입장 대기와 입장 후 첫 출력 구간은 정의 불가이므로 숫자를 생성하지 않는다.

replay 설명 노출 상수는 0.65다. 2026-10-12 Qwen MTP 기준선의 약65% 관찰을 기준으로 삼았으며 성능 저하의 인과 판정이나 자동 실행 차단이 아니다. 원본 선별 n_max2 run은 40.9475%였으므로 모든 MTP 설정에65%를 적용하지 않는다. 사건 부재는 disabled 또는0%로 해석하지 않는다.

## 워크로드 반복

scheduled(기본값)는 최초 송신 기준 반복×간격 deadline마다 다음 웨이브를 보낸다. 앞 웨이브 완료를 기다리지 않는다. after-completion은 앞 웨이브의 모든 terminal OUTPUT 완료를 기다린 후 간격을 적용한다. 첫 출력·일부 완료·RELEASE만으로 다음 웨이브를 보내지 않는다. 취소·오류·단절은 대기와 이후 전송을 중단한다. 기존 정산 원장과 마지막 전체 RELEASE 대기는 유지한다. run.settings.repeatMode 부재인 과거 기록은 당시의 scheduled 의미로 표시한다.

n_seq_max는 공통 planTokens를 사용해 각 stage의 원문 LOAD plan에서 읽는다. 누락·중복·잘못된 plan은 한도를 추정하지 않는다. sequence_capacity 및 resource_profile.max_requests(보관 예산)를 실행 slot 수로 대체하지 않는다. 경고는 실행 금지가 아니며 반복 scheduled 방식은 한 웨이브가 한도 이하라도 미완료 웨이브가 쌓일 수 있다.

## CC SESSION와 오류

참조 CC HEAD는 시작 시 `d1ead500d1be551f02b1581b6e27043ea1e31eb6`, 최종 대조 시 `f2854c7135858b7bb0bef36d0d0b60dfb0c67829`다. 같은 content type의 본문이 작업 도중 바뀌었다. 현재 코드→생산자→소비자 우선 규칙에 따라 f2854c71 `commands.rs::SessionCommand`, `mod.rs`, `docs/speculative-staged.md` §8.19를 구현했다. 작업 지시 C1의 스칼라 형식과 다르다. main 또는 옛 CC v5의 수용을 주장하지 않는다.

- v4: load_generation, session_id, stages, stage_index 네 필드. 모든 stage LOAD 보고에 speculative_contract가 없을 때 선택한다.
- 현재 v5: `application/vnd.p4.llamacpp.session-v5+json`, 위 네 필드 + `stage_contracts` 문자열 배열 필수. 배열 길이·순서는 stages와 같고 항목은 해당 stage의 loaded 보고 speculative_contract다. 모든 항목이 완전히 같아야 전송하며 각 stage에 같은 전체 배열을 보낸다(stage_index만 다름). LOAD 보고의 현재 load_generation을 검사한다. 형식 mode/max_draft/max_physical_rows/max_new_outputs는 Studio가 분해·재생성하지 않는다.
- 일부 필드 부재·다른 문자열·null/빈 문자열·오래된 LOAD 세대·중복/누락 보고는 SESSION 송신 전에 거부한다. 준비 순서는 head부터 각 SESSION_READY-v4를 기다리는 기존 순서다. 저장된 LOAD 보고의 ready를 즉시 SESSION 준비로 승격하지 않는다.
- 사전 거부는 `SESSION_CONTRACT_ERRORS` 코드 6종(stage 수/LOAD 보고/세대/잘못된 문자열/일부 누락/불일치)으로 보존한다. 도메인은 한국어 문구를 만들지 않으며 화면의 resource key가 8개 언어로 번역한다. [API 계약](../packages/studio_domain/docs/api.md#session-contract), [화면 소비자](../apps/studio/src/front/features/inference/InferenceError.tsx).
- 과거 스칼라 v5(d1ead500)는 새 배열 v5와 같은 content type이지만 strict parser에서 서로 거부한다. 공개 capability에 본문 버전 구별자가 없으므로 자동 추정·재전송·형식 fallback을 하지 않는다. 현재 CC 계약을 대상으로 한다.
- `LLAMA_PIPELINE_AGREEMENT_FAILED`의 생산자는 최신 CC에서 probe/answer/철회/합의 게이트와 함께 제거됐다. 현재 형식의 새 합의 실패 정산을 정의하지 않는다. 기존 정산 알고리즘은 바꾸지 않았다.
- 이전 CC 오류가 오면 역사 호환 소비자는 error-v2의 exact submission(load_generation/session_id/request_id/submission_event_id)과 owner(incarnation)를 구분한다. submission은 미발행·미계산이므로 기존 exact submission 오류 released 정산을 유지한다. owner는 별도 RELEASE receipt를 기다리며 미계산으로 설명하지 않는다. 화면은 둘의 의미를 번역한다.
- 최신 CC는 하류 설치 합의를 하지 않는다. 하류 세션 부재/binding 불일치 거부 뒤 head의 이미 발행된 요청 정산은 공개 문서의 `STAGE-REFUSAL-SETTLE-01` 미해결 사항이다. Studio 시험 통과로 이 문제의 해결을 주장하지 않는다.

## 실측 데이터와 등록

2026-10-12 읽은 K2 목록: K2-B-c1-20261012-084734, K2-B-c5-20261012-094745, K2-B-c8-20261012-095250, K2-B-c12-20261012-101720, K2-B-c12-20261012-105513, K2-B-c16-20261012-102200, K2-B-c16-20261012-105045. 원본 추출 시 추가로 K2-B-c8-20261012-114123, K2-B-c8-20261012-114633도 관측했다(총9개, 로컬 measurements.json에 목록 보존). c16 두 run의 정상 출력·정산·지연한도 통과를 확인했다. INVALID/ABORTED 표시 run은 선택하지 않았다.

| 구성·출처 run | 재계산 수치 | 범위 |
| --- | --- | --- |
| Qwen none seq16: K2-B-c16-20261012-102200 / -105045 | 6087 generated tokens / 54.766·54.906초 =111.145601·110.862201 useful TPS; 평균 대비 차이0.255307%; 단일 K2-B-c1-20261012-084734=27.152168 | 3090 head[0,44), 4080 tail[44,64); warmup1 제외 동시16, 전체17/17 정산. TTFT p95 3144.75·3142.25ms, 중앙 gen TPS9.09508·9.04413, 한도 통과 |
| Qwen MTP n_max2: S-D-nmax2-20261012-033318 | 1663 generated tokens / 51.112초=32.536391 useful TPS; accepted832/drafted1182=70.3892%, replay242/591=40.9475% | 동시5, 정상5/5. 지시 표의 replay64%와 다름. 중앙 gen TPS7.05617<8, 지연 한도 미통과 |
| MiMo DFlash4: strongpin23-20261011-221013 | 7664 sampled tokens / 561.695초=13.644416 TPS(EOS 포함); 7556 generated tokens=13.452140 useful TPS(EOS 제외). accepted5171/9772=52.9165%, replay0/2449 | Mac20→Mac21→GB10,120/120. cold8pin23-20261011-220018은8/8, useful16.32700 TPS |

Qwen source: `F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/<run>/`; MiMo source: `F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/<run>/`. config.json의 LOAD 원문과 inference.json.gz·analysis.json·summary.json·binding.json의 SHA-256 및 수치를 preset source.evidenceFiles/measurements에 보존한다. 유효 출력의 generated token(EOS 제외) 수와 첫 예정 송신~마지막 terminal 창으로 Qwen analysis.json을 다시 계산해 일치 확인했다. MiMo 표의13.64는 sampled TPS이므로 useful과 분리했다. 응답의 의미 품질은 이 수치로 증명하지 않는다.

선별 보고는 n_seq_max5→16의 동시5 처리량 개선·agent 배칭 knob 개선을 확인하지 못했다. 창1·min rows5는 깨끗한 MTP 반복 대비 절반 이하이며 창1에는 CPU 경쟁이 섞였다. 이는 해당 corpus·장치·현 P4 구조의 한정 관찰이다. MiMo 이전 핀 비회귀도 당시 보고의 한정 판정이다. 다른 환경에서의 최적 설정으로 광고하지 않는다.

사람의 별도 승인 후 운영 Studio에 선언만 등록하는 명령(이번 작업에서 실행하지 않음):

```powershell
node scripts/register-recorded-models.mjs http://127.0.0.1:43120 tests/reports/studio-revamp/approved-registration.json qwen38-none-seq16,qwen38-mtp-nmax2,mimo-dflash-nmax4
```

별도 검증 인스턴스는43180과 worktree 안 tmp/revamp.db를 사용한다. deploy·push·병합과 운영 DB 쓰기는 하지 않는다. 등록된 선언은 적재·SESSION·정상 응답 근거가 아니다.

## 회귀 검증 경로

A2는 [앱 이벤트 소비 시험](../apps/studio/src/front/features/inference/api.test.ts)의 BatchObservation 수신→같은 stage 중복 제거→다른 stage 별도 누적→저장→새 API 복원을 따른다. [TEMP 변이 실행기](../tests/integration/studio-revamp-mutation.mjs)는 빌드된 도메인을 작업 트리 밖에 복사하고 `addBatchRequestDistributions` 호출 한 줄만 제거한다. 정상 복사본 통과, 변이 실패, 제품 SHA-256 유지로 연결 시험의 실효성을 검사한다.

[브라우저 시나리오](../tests/browser/studio-revamp.mjs)는 A1–A4, B1–B2, C2의 한국어·영어 오류 4종, D의 세 preset·노트를 검사한다. 모사 보고의 LOAD 성공·자원 존재 필드도 현재 계약대로 갖추고 실제 P4 접속은 0이어야 한다. [Windows 실행기](../tests/browser/run-studio-revamp.ps1)는 대화상자 방지와 테스트 Chromium 잔류 0을 검사한다. 초기 모델 선택은 값이 달라질 때만 갱신해 모델 목록 로딩 전 반복 emit을 막는다. 실행 이력·스크린샷은 tests/reports와 tests/plans의 Git 제외 자료이며 현재 시험 방법은 [testing](testing.md)이 소유한다.
