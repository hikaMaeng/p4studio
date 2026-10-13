# Model configurations

Studio OUTER의 모델 구성은 에이전트별 노드 배치와 노드별 LOAD 입력이다. 예제를 선택해도 실제 agent/node 상태를 만들지 않는다.

| Edit target | Owner / consumers |
| --- | --- |
| 전용 페이지 | [ModelEditorPage](../../../apps/studio/src/front/features/models/ModelEditorPage.tsx), `/models/new`, `/models/:id/edit`; [store](../src/front/model/deployments/store.ts)가 편집·선택·예제 펼침 상태 소유 |
| 노드 인자 | [payload](../src/common/protocol/deployments/payload.ts); UI 미리보기·저장과 브라우저 LOAD가 동일 생성 함수 소비 |
| 영속 DTO | [protocol](../src/common/protocol/deployments/index.ts); 앱 SQLite JSON 문서·API parser |
| 실행 / 호환성 | [plan](../src/server/deployments/plan.ts), [runtime](../src/common/protocol/deployments/runtime.ts), [compatibility](../src/server/deployments/compatibility.ts) |
| 예제 원본 데이터 | [presets](../src/common/protocol/deployments/presets.ts), [offline importer](../../../scripts/import-deployment-preset.mjs) |

`planText`는 native plan 원문, `loadOptionsJson`은 나머지 LOAD JSON이다. runtime args·환경 변수·GPU/CPU tensor override·KV cut·batch/context 값·미래 옵션을 그대로 보존한다. JSON에 `plan`과 `load_generation`을 중복 정의하지 않는다. `load_generation`은 명령 전송 시 새로 부여한다. 서버/브라우저는 plan의 모델 파일·레이어 범위를 읽어 배치 요약과 일치하는지 확인하지만 KV 범위를 다시 생성하지 않는다. 기존 개별 입력형 저장 구성은 편집 시 한 번 텍스트로 변환한다.

미연결 에이전트가 있는 초안은 저장할 수 있다. LOAD는 모든 노드의 에이전트 연결, 새 적재 인스턴스의 node generation, 레이어 범위, 실행 endpoint 및 JSON을 검사한 뒤 보낸다. 예제 적용은 원본 경로/장치를 보존하며 새 node ID를 부여하고, 등록 주소가 정확히 같을 때만 agent ID를 매핑한다. 임의 원격 에이전트를 등록하거나 예제의 과거 generation을 재사용하지 않는다.

| Recorded source | Configuration / bounded evidence |
| --- | --- |
| `p4-fleet-20260910/target/hy3-100k-20260910/hy3-100k-wave-headroom-1789035735558` | Hy3 Q5_K_S, 5 hosts / 6 nodes, 80 trunk layers; cuts `[0,16) [16,32) [32,59) [59,62) [62,78) [78,80)`; CUDA/Metal, discrete/host-shared, CPU expert offload, Mac f16 KV vs other nodes q4_0; ctx 102400 × 8, batch/ubatch 512/256. Inference deadline: 4/16 complete, missing evidence and cleanup error retained. |
| `p4/target/mi250-deploy/evidence-16/2026-09-11T00-15-00Z-r16-mixed-p100k-t512` | Step-3.7-Flash Q4_K_XL, 2 hosts / 16 nodes, 45 layers; ROCm device environment per node, q8_0 KV, ctx 100512 × 16, batch/ubatch 512/512. Artifact passed, 16/16 complete/released; no general response quality claim. |

Each generated data file includes config/artifact SHA-256, original directory, build identity, and bounded outcome fields. Import copies only deployment inputs/evidence metadata, never prompts, outputs, or P4 code. Runtime has no dependency on source checkouts. `tools/event-drive/src/run/load.rs` defines the source node-to-LOAD mapping; config timeout supplies both ready/io timeouts.

HY3 opts into the fleet checkout's `physical-wire-v4` compatibility policy: all stages must identify upstream, patch set and backend, and agree on a recognized native `stage_wire_abi` (only `p4pb6le64`: P4LB v5, P4PB v6/v7; earlier `p4pb4`/`p4pb5` families are refused before LOAD, never read as c = 1); backend inventories may differ. The ABI string must match across every stage. `exact-build` remains the default and requires matching inventories; it also refuses a stage that reports an unsupported wire family, while a stage too old to name its wire is left to its own worker LOAD refusal. A runtime lacking a recognized native ABI cannot pass this policy. This is a LOAD readiness check, not SESSION setup or inference acceptance.

[Tests](../src/server/deployments/presets.test.ts) cover preserved source payloads, text edits/roundtrip, stale summaries, legacy migration and heterogeneous build agreement. [App integration](../../../apps/studio/src/server/api/deployments.test.ts) covers HTTP receipt persistence and generation preservation. See [testing](testing.md) for runtime evidence boundaries.

## Qwen·MiMo 실측 구성

[추가 preset 원본](../src/common/protocol/deployments/presets.ts)은 Qwen none seq16, Qwen MTP n_max2, MiMo DFlash n_max4를 포함한다. [실측 표·원본 run·분모·등록 명령](../../../docs/studio-revamp.md#실측-데이터와-등록)이 수치의 권위다. source.artifactFile은 inference.json.gz이며 artifactSha256은 압축 파일 바이트의 해시다. source.evidenceFiles에는 여러 run의 config/analysis/summary/inference/binding 파일 SHA를 보존한다. source.measurements는 워밍업 제외·출력 종류·창·지연한도를 보존한다. optional insightNotes는 현재 모델의 운영 노트다. 기존 필드 없는 저장 문서를 허용한다.

[import-deployment-preset.mjs](../../../scripts/import-deployment-preset.mjs)는 artifact.json 또는 inference.json.gz를 읽으며 optional 다섯째 인자로 insightNotes/measurements/evidenceFiles JSON을 받는다. 생성된 원본 데이터만 제품에 포함하고 프롬프트·답변·P4 소스를 복사하지 않는다. [register-recorded-models.mjs](../../../scripts/register-recorded-models.mjs)는 optional 셋째 인자의 preset ID 목록만 선언 등록하고 기존 사용자 수정은 덮어쓰지 않는다. agent probe와 폐기된 빈 node 생성 API를 호출하지 않는다. 새 stage ID/node ID를 부여하며 현재 remote 존재를 추정하지 않는다.

## Qwen CC·CC+W 구성

`qwen38-mtp-nmax2` preset은 `--kv-unified`를 쓰며 과거 측정으로 보존하고 수정하지 않는다. CC는 비통합 KV에서만 적격이므로 별도 preset으로 둔다.

| Preset | 원본 harness run | 차이 |
| --- | --- | --- |
| `qwen38-mtp-cc-nseq16` | `AB-mtp-cc-c1-20261012-203105` (`mtp-cc`, W 미적용) | `--kv-unified` 없음, `P4_STAGED_CC_FIXED_WIDTH` 미설정 |
| `qwen38-mtp-cc-w3-nseq16` | `AB-mtp-cc-w3-c1-20261013-011606` (`mtp-cc-w3`) | `--kv-unified` 없음, 전 stage LOAD environment `P4_STAGED_CC_FIXED_WIDTH=1` |

두 harness run에는 inference artifact가 없어 artifact 근거는 `summary.json`이며 `source.artifactFile`에 그대로 밝힌다. W 적용 증거(harness stderr `P4_STAGED_CC_FIXED_WIDTH width=3 tail=0/1` 줄)는 `source.measurements[].fixedWidthLines`에 보존한다. 두 preset 모두 `physical-wire-v4`, 17/17 완료·정산, build `stage_wire_abi` `p4pb6le64`다.

선언한 CC/W 환경은 LOAD 전송 전 `validateDeploymentLoad`가 전 stage 일치를 검사한다([cc-env](../src/common/protocol/deployments/cc-env.ts): `checkCcEnvironmentAgreement`). 설정·미설정을 섞으면 LOAD를 보내지 않는다. 실제 계약 일치는 LOAD 보고에 대해 전체 `loaded` 확정 전에 검사한다([session](../src/common/protocol/deployments/session.ts): `checkLoadStageContracts`). 실행 기록은 선언 설정·보고된 실제 계약·용량·W 증거 유무를 구분해 표시한다([ModelHistory](../../../apps/studio/src/front/features/models/ModelHistory.tsx)): W는 P4 LOAD 보고에 적용 필드가 없으므로 항상 "증거 없음"이며 설정값만으로 적용을 확정하지 않는다.
