# Model configurations

Studio OUTER의 모델 구성은 에이전트별 노드 배치와 노드별 LOAD 입력이다. 예제를 선택해도 실제 agent/node 상태를 만들지 않는다.

| Edit target | Owner / consumers |
| --- | --- |
| 전용 페이지 | [ModelEditorPage](../../../apps/studio/src/front/features/models/ModelEditorPage.tsx), `/models/new`, `/models/:id/edit`; [store](../src/front/model/deployments/store.ts)가 편집·선택·예제 펼침 상태 소유 |
| 노드 인자 | [payload](../src/common/protocol/deployments/payload.ts); UI 미리보기·저장과 서버 LOAD가 동일 생성 함수 소비 |
| 영속 DTO | [protocol](../src/common/protocol/deployments/index.ts); 앱 SQLite JSON 문서·API parser |
| 실행 / 호환성 | [plan](../src/server/deployments/plan.ts), [runner](../src/server/deployments/runner.ts), [compatibility](../src/server/deployments/compatibility.ts) |
| 예제 원본 데이터 | [presets](../src/common/protocol/deployments/presets.ts), [offline importer](../../../scripts/import-deployment-preset.mjs) |

`planText`는 native plan 원문, `loadOptionsJson`은 나머지 LOAD JSON이다. runtime args·환경 변수·GPU/CPU tensor override·KV cut·batch/context 값·미래 옵션을 그대로 보존한다. JSON에 `plan`과 `load_generation`을 중복 정의하지 않는다. `load_generation`은 명령 전송 시 새로 부여한다. 서버/브라우저는 plan의 모델 파일·레이어 범위를 읽어 배치 요약과 일치하는지 확인하지만 KV 범위를 다시 생성하지 않는다. 기존 개별 입력형 저장 구성은 편집 시 한 번 텍스트로 변환한다.

미연결 에이전트가 있는 초안은 저장할 수 있다. LOAD는 모든 노드의 에이전트 연결, 실제 노드 세대, 레이어 범위, 실행 endpoint 및 JSON을 검사한 뒤 보낸다. 예제 적용은 원본 경로/장치를 보존하며 새 node ID를 부여하고, 등록 주소가 정확히 같을 때만 agent ID를 매핑한다. 임의 원격 에이전트를 등록하거나 예제의 과거 generation을 재사용하지 않는다.

| Recorded source | Configuration / bounded evidence |
| --- | --- |
| `p4-fleet-20260910/target/hy3-100k-20260910/hy3-100k-wave-headroom-1789035735558` | Hy3 Q5_K_S, 5 hosts / 6 nodes, 80 trunk layers; cuts `[0,16) [16,32) [32,59) [59,62) [62,78) [78,80)`; CUDA/Metal, discrete/host-shared, CPU expert offload, Mac f16 KV vs other nodes q4_0; ctx 102400 × 8, batch/ubatch 512/256. Inference deadline: 4/16 complete, missing evidence and cleanup error retained. |
| `p4/target/mi250-deploy/evidence-16/2026-09-11T00-15-00Z-r16-mixed-p100k-t512` | Step-3.7-Flash Q4_K_XL, 2 hosts / 16 nodes, 45 layers; ROCm device environment per node, q8_0 KV, ctx 100512 × 16, batch/ubatch 512/512. Artifact passed, 16/16 complete/released; no general response quality claim. |

Each generated data file includes config/artifact SHA-256, original directory, build identity, and bounded outcome fields. Import copies only deployment inputs/evidence metadata, never prompts, outputs, or P4 code. Runtime has no dependency on source checkouts. `tools/event-drive/src/run/load.rs` defines the source node-to-LOAD mapping; config timeout supplies both ready/io timeouts.

HY3 opts into the fleet checkout's `physical-wire-v4`: all stages must identify upstream, patch set and backend, and agree on a recognized native `stage_wire_abi`; backend inventories may differ. `exact-build` remains the default and requires matching inventories. A runtime lacking v4 identity cannot pass the v4 policy. This is a LOAD readiness check, not SESSION setup or inference acceptance.

[Tests](../src/server/deployments/presets.test.ts) cover preserved source payloads, text edits/roundtrip, stale summaries, legacy migration and heterogeneous build agreement. [App integration](../../../apps/studio/src/server/api/deployments.test.ts) covers actual HTTP/TCP framing with simulated reports. See [testing](testing.md) for runtime evidence boundaries.
