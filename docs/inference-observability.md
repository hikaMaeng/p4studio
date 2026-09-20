# 추론 관측 설계

이 문서는 P4 Studio 운영 화면이 원시 이벤트를 어떻게 요청별 증거와 서비스 지표로 바꿀지 정한다. 조사 기준은 Studio HEAD `b510af9fc06c893f247f26156c9f2a727b022092`의 dirty checkout과 P4 HEAD `4df7496b92c9c84efddb4a908ab56ea0b5c6e77f`의 clean checkout이다. 배포 바이너리의 build identity와 일치한다는 뜻은 아니다. 아래 P4 telemetry 구조는 P4 HEAD의 계약이며 Studio dirty diff에서 새로 만든 것이 아니다.

## 결론

P4의 `OUTPUT v5`, `batch-observation v4`, `stage-span v4`, agent `INSPECT`만으로도 새 실행에 대해 다음 화면은 만들 수 있다.

- 요청별 TTFT·decode 시간·출력 속도·완료 사유와, 그 요청이 소유한 issue/row/physical execution/stage 경로
- 실행 전체의 동시 요청 수, 출력 token rate, batch width·ready rows·phase mix, stage 겹침, GPU·VRAM·전력·온도 변화
- 각 시각 자료에서 요청과 execution으로 내려가는 상세 증거

완전한 운영 진단에는 P4 telemetry가 부족하다. 요청이 대기한 정확한 구간과 이유, KV cache 압력, edge별 bytes·대역폭, adapter native 내부 시간, clock 품질이 없다. Studio는 없는 값을 추정하지 않고 `수집 안 됨`으로 표시하며 P4 계약 확장 뒤 활성화한다.

현재 Studio의 stage 합계는 회계·사후 검증에는 쓸 수 있지만 운영자가 장애 원인을 찾는 기본 화면으로는 부족하다. 전체 화면은 시간축 그래프, 요청 목록은 요청별 요약과 waterfall modal을 중심으로 바꾼다. stage 합계표는 보조 drill-down으로 유지한다.

## 현재 P4가 제공하는 증거

| 출처 | 단위 | 제공 값 | 안전한 해석 | 한계 |
| --- | --- | --- | --- | --- |
| [OUTPUT v5](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/commands.rs) `OutcomePayload`, [completion.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/completion.rs) `ApprovedOutputPayload` | 요청·출력 token | request/sequence, token, text, position, stop, submission/incarnation, terminal issued-work proof | 브라우저 실제 send부터 첫 OUTPUT까지 client TTFT, 첫~마지막 OUTPUT decode 구간, token 수와 종료 사유 | 서버 queue/prefill/decode 내부 경계 timestamp 없음. 브라우저 수신 시각에는 transport 지연 포함 |
| [commands.rs](../../p4/layers/adapters/llamacpp/staged/adapter/src/v2/commands.rs) `BatchObservation` | logical issue와 physical batch | logical/physical rows, phase별 rows, request/sequence 수, mixed batch, stage/idle, ready rows/sequences, scheduling snapshot | batch 폭, phase 구성, issue 시점 ready set, 정책·제약 스냅샷 | `idle_ms`는 직전 stage call 반환 뒤 다음 계획까지의 공백. 원인 전체를 뜻하지 않음 |
| 같은 파일의 `BatchRequestObservation` | 요청이 소유한 physical batch 부분 | request/submission/sequence/incarnation, request issue index, 정확한 issued row와 phase | 요청별 issue 횟수·prefill/decode/verify/replay row·execution 귀속 | batch의 stage 시간은 함께 탄 요청이 공유한 wall time이며 요청 전용 compute 시간이 아님 |
| 같은 파일의 `StageSpan` | stage·execution 묶음 | execution IDs와 소유 요청, ingress/start/end/forward wall clock, rows | stage 실행·전달 구간, pipeline swimlane, 열린 execution 동시성 | 다중 머신 시 clock 동기 품질만큼만 정확. bytes가 없어 네트워크 MB/s를 계산할 수 없음 |
| [agent inspection](../../p4/entrypoints/agent/src/event_runtime/control/inspection/mod.rs), [transport snapshot](../../p4/entrypoints/agent/src/event_runtime/transport.rs) | pull 시점 agent/node/broker 및 agent 수명 | node generation·adapter 상태 문자열, retained input/completion, receipt 저장량·용량·eviction, 성공한 P4 DATA hop write/encoded byte 누적 | node 생존, 전달·receipt 압력, agent-wide 누적 전송 활동 | transport counter는 request/stage/edge·수신 byte·retry·측정창을 소유하지 않는다. adapter snapshot은 구조화된 queue/KV 상태가 아니라 `loaded`, `failed:*` 같은 상태 문자열 |
| [hardware inspection](../../p4/entrypoints/agent/src/event_runtime/control/inspection/hardware.rs) | pull 시점 machine/GPU | RAM, GPU memory, GPU utilization, temperature, power, probe state | 운영 중 자원 변화. 값이 null이면 관측 불가 | NVIDIA·AMD·Apple provider별 지원 필드가 다름. GPU utilization은 SM 점유율이나 pipeline 포화율이 아님 |

`SchedulingSnapshot`에는 service/pipeline 결정, ordinary limit 적용 여부, min/max issue rows, open batch, pending admission, blocked outstanding, no-ready-input, eligible phase별 수가 있다. 이는 issue 순간의 진단 표본이다. 지속 queue 길이 또는 요청별 queue duration으로 승격하지 않는다.

P4 로드맵도 `ready_rows`가 다음 계획 순간의 ready set이며 남은 prompt token 전체를 포함한다고 정정했다. `idle_gated=0` 역시 일부 gate가 거절하지 않았다는 뜻일 뿐 모든 발행 불가 원인을 분류하지 않는다. [현재 해석과 누락 증거](../../p4/docs/distributed-batching-roadmap.md#p-3-무엇을-기다렸는가--30행과-2행-집단의-반복)를 따른다.

## Studio가 현재 보존하거나 버리는 정보

| 현재 동작 | 영향 |
| --- | --- |
| [telemetry.ts](../packages/studio_domain/src/common/protocol/inference/telemetry.ts)가 owner/execution 상세까지 strict decode | 새 실행 수신 시 요청 귀속 원자료는 존재함 |
| [front telemetry cache](../packages/studio_domain/src/front/model/inference/telemetry.ts)는 stage별 최신 projection을 유지하고, [observability.ts](../packages/studio_domain/src/front/model/inference/observability.ts)는 수신 즉시 `owned_requests`와 `executions`를 요청별 합계와 1초 run series로 투영 | 새 실행은 요청별 batch·phase·stage 귀속과 run-wide 그래프를 저장함. 원시 이벤트 전체를 복제하지 않음 |
| [monitoring-summary.ts](../packages/studio_domain/src/front/model/inference/monitoring-summary.ts)가 stage totals를 별도 누적 | 회계용 stage 합계는 보조 상세로 계속 제공함 |
| browser-owned inference가 실행 중 INSPECT 변경 snapshot을 최대 240개 보존하고, P4 protocol decoder가 node delivery와 broker receipt를 구조화함 | GPU/VRAM과 input/completion retained, broker allocated/evicted/known bytes 그래프를 만듦. 긴 실행은 앞 표본이 잘릴 수 있음 |
| OUTPUT 수신마다 1초 output token·active request bucket을 저장 | 실행 전체 output rate는 가능. 개별 token timestamp 전부를 보존하지 않으므로 정확한 ITL 분포는 아직 불가능함 |

과거 기록은 버린 owner/execution/token 시각을 복원하지 않는다. 새 schema 이후 실행부터 요청별 관측을 제공하고 이전 기록은 coverage를 `unavailable`로 표시한다.

## 운영자 화면에 제공할 지표

### 서비스와 실행 전체

상단은 현재 상태와 SLO를 판단하는 작은 수의 지표만 둔다.

| 지표 | 표현 | 현재 가능 여부 |
| --- | --- | --- |
| 요청률·완료율·오류율 | 최근 window의 req/s와 finish/error taxonomy | OUTPUT과 client 상태로 가능. P4 오류 taxonomy 보강 필요 |
| TTFT | p50/p95/p99와 SLO 충족률, wave별 분포 | 실제 send timestamp 기준으로 가능 |
| TPOT/ITL | p50/p95/p99, 단일 token 요청 제외 | token 수신 timestamp 보존을 추가하면 가능 |
| output goodput | 정상 완료 token/s와 정상 완료 req/s | stop/error/품질 조건을 명시해 Studio에서 계산 |
| running/waiting | 시간 그래프와 최대값 | client active는 가능. P4 scheduler의 정확한 waiting은 추가 계약 필요 |
| telemetry coverage | owner/span/GPU 표본 수, 누락·clock 상태 | Studio에서 즉시 추가 가능. P4 dropped/sampled counter는 추가 필요 |

주요 그래프는 같은 x축을 공유한다.

1. 활성·queued·streaming·completed 요청 수와 wave 제출 시각
2. window별 output tokens/s와 completed requests/s
3. physical batch rows / configured `n_ubatch`, `ready_rows`, physical batch 수
4. prefill/decode/verify/replay row의 stacked area와 mixed batch 비율
5. stage swimlane: ingress→start queue, start→end native stage, end→forward 전달
6. stage별 열려 있는 execution 수와 pipeline overlap/depth
7. GPU utilization, VRAM used, power, temperature 및 host RAM
8. receipt allocated/retained bytes와 completion/input retained 수

batch fill은 원인 분석용 관측값이다. P4 검증 기록에서도 fill 상승과 처리량 하락이 함께 나타났으므로 높은 fill을 건강 점수로 만들지 않는다. 처리량·TTFT·overlap과 같은 시각축에서만 비교한다.

`StageSpan`에서 계산할 수 있는 전송 관련 값은 `end→forward latency`와 `rows / (forward-end)`의 effective row rate다. bytes가 없으므로 이를 네트워크 대역폭 또는 MB/s로 표기하지 않는다.

### 요청 목록과 상세 modal

목록 한 행에는 상태, TTFT, TPOT, E2E, 출력 token, stop/error, issue 수, 관측된 prefill/decode rows, 참여 stage 수, 관측 coverage를 둔다. 긴 출력은 별도 출력 modal을 유지하고 모니터링 modal은 다음 waterfall을 보여준다.

1. client send → 첫 OUTPUT → 마지막 OUTPUT
2. 요청이 소유한 issue를 `request_issue_index` 순서로 배치
3. 각 issue의 physical execution과 함께 탄 요청 수, phase/row, batch fill
4. execution별 모든 stage의 ingress/start/end/forward 구간
5. 같은 시각의 GPU·memory·receipt 표본
6. source event identity와 누락/불일치 진단

여기서 stage span 시간은 요청이 참여한 batch의 공유 시간이라고 명시한다. 여러 요청에 같은 stage 시간을 더해 request compute total로 만들지 않는다.

## 관련 서비스가 제공하는 기준

- vLLM은 service 지표로 running/waiting과 waiting reason, KV cache usage, preemption, prompt/generation token, TTFT·ITL·queue·prefill·decode·E2E histogram을 제공한다. 별도로 per-request 응답에는 TTFT, generation time, queue time, mean ITL, tokens/s를 제공하며 고동시성에서의 CPU 비용과 귀속 불가능한 요청의 null 처리를 명시한다. [vLLM production metrics](https://docs.vllm.ai/en/v0.21.0/usage/metrics/), [vLLM per-request metrics](https://github.com/vllm-project/vllm/blob/main/docs/features/per_request_metrics.md)
- Triton은 request success/failure, pending, request/queue/compute input/infer/output duration과 GPU·CPU·pinned memory를 Prometheus로 제공한다. first response histogram도 제공하며 model 단위 bucket을 구성할 수 있다. [Triton metrics](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/metrics.html)
- TensorRT-LLM backend는 waiting/context/scheduled/active/max request, GPU·CPU·pinned memory, KV block fraction/used/free/tokens-per와 inflight batch 통계를 제공한다. collector는 요청별 E2E/TTFT/TPOT/queue/prefill/decode/inference 및 iteration별 active/queued/latency/memory/KV를 구분한다. [Triton TensorRT-LLM metrics](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/tensorrtllm_backend/README.html), [TensorRT-LLM collector](https://github.com/NVIDIA/TensorRT-LLM/blob/main/tensorrt_llm/metrics/collector.py)

P4 Studio도 요청별 상세는 trace/history에 저장하고, 서비스 집계는 histogram/counter/gauge로 분리한다. request ID를 Prometheus label로 넣지 않는다. Prometheus는 온라인 서비스의 기본 지표를 query/error/latency로 보고 queue 길이·사용량은 gauge, bytes·event는 counter로 다루며 높은 cardinality label을 피하라고 권고한다. 분산 instance의 percentile은 평균내지 않고 합칠 수 있는 histogram을 사용한다. [Prometheus instrumentation](https://prometheus.io/docs/practices/instrumentation/), [histograms and summaries](https://prometheus.io/docs/practices/histograms/)

## P4에 추가할 telemetry 제안

| 우선순위 | 계약 | 필드·이벤트 | 소유 계층 | 열리는 운영 질문 |
| --- | --- | --- | --- | --- |
| P0 | request lifecycle trace | admitted, eligible, queued, first-issued, first-native-start, first-output, terminal timestamp; wait-reason transition | P4 core는 공통 lifecycle/transport, adapter는 engine-ready 이유 | TTFT가 queue, pipeline dependency, prefill 중 어디서 늘었나 |
| P0 | reason-coded scheduler state | admitted/eligible/in-flight/unissuable gauge와 capacity, outstanding, no-input, coalescing, downstream-backpressure 사유 | llama.cpp adapter | 왜 batch가 작거나 node가 idle했나 |
| P0 | KV cache telemetry | total/used/free/evicted/reused blocks 또는 tokens, preemption/recompute/spill | llama.cpp adapter | 대기가 KV 부족인가, cache hit가 실제로 도움이 됐나 |
| P0 | edge transport telemetry | execution/edge별 payload bytes, enqueue/send/receive timestamp, queue depth, retry/error/backpressure | P4 transport/agent | end→ingress 지연이 network인지 queue인지, 실제 B/s는 얼마인가 |
| P1 | native phase timing | parse, H2D, compute, D2H, decode, sampler, encode와 고해상도 monotonic duration | llama.cpp staged server/adapter | stage 시간 안에서 실제 병목은 어디인가 |
| P1 | clock quality | agent clock offset/uncertainty/source와 span monotonic duration | P4 agent | 다중 머신 wall-clock waterfall을 얼마까지 신뢰할 수 있나 |
| P1 | telemetry health | emitted/dropped/sampled/parse-failed counter, last-success timestamp, schema/build identity | 각 생산자와 Studio consumer | 빈 그래프가 무부하인지 관측 손실인지 |
| P2 | metrics export | stable cumulative counter, gauge, aggregatable histogram endpoint; bounded labels와 trace exemplar | P4/Studio 운영 경계 | 장기 SLO·alert·Grafana를 실행 이력과 연결할 수 있나 |

P4 공통 계층에는 request lifecycle, transport, broker, telemetry health처럼 backend-neutral한 의미만 둔다. KV, llama scheduler와 native phase는 llama.cpp adapter가 공개 payload 또는 metrics로 제공한다. Studio는 샘플 보존, window 계산, SLO, 그래프와 request trace 결합을 소유한다.

## 구현 순서

1. **Studio-only, 구현됨:** raw telemetry 전부를 저장하지 않고 run time-series와 request-owned aggregate를 수신 시 생성한다. owner issue, execution span, 1초 output bucket, INSPECT 자원·delivery·broker 표본과 coverage를 새 schema에 보존한다.
2. **화면, 구현됨:** 요청별 모니터링 modal, batch/throughput/stage/resource/delivery/receipt 그래프, 보조 stage 회계표를 제공한다. 이전 기록에는 소급 불가 표시를 한다.
3. **P4 P0 계약:** lifecycle/wait reason, KV, edge bytes를 adapter/core 경계에 맞춰 추가하고 versioned strict schema와 producer/consumer fixture를 함께 갱신한다.
4. **운영 export:** request ID 없는 Prometheus histogram/counter/gauge와 trace exemplar를 추가하고 SLO·alert를 연결한다.

각 단계의 수용 조건은 값의 분모·시간창·topology·정상 종료 조건·telemetry coverage를 함께 표시하고, graph의 point를 request/execution 원증거로 내려갈 수 있는 것이다.
