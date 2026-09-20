# Chrome Studio / local gateway / MI250 x2

2026-09-15 KST. Requested cluster setup, model loading, and inference completed.

## Result

- Chrome tab 1233213134, Studio http://localhost:43120.
- Gateway group: http://localhost:43120/agent-groups/9c0e5df8-48a6-4bcc-b801-9079f4c1ae43
- Model: http://localhost:43120/models/36287599-a944-45d6-a211-664b7f9c1aa4
- Inference run: `de2aabdc-c0e6-4c61-9647-b2b3ffb41905`, request suffix `-1-1`.
- All four LOAD completions use generation `1789457809685`; Studio shows 4/4 ready.
- Chrome received a terminal output after successful SESSION preparation. One request, concurrency 1, repetition 1, limit 256, output 39 tokens.

## Runtime topology

| Role | Managed ID | Advertised address | Execution |
|---|---|---|---|
| Local MI250 Gateway | 2edb080f-f782-438c-bfaf-019fc079a2a2 | tcp://127.0.0.1:42010 | Windows PID 48500; no model nodes |
| MI250-01 | b7f72f7d-7c58-48cc-b23f-2252ec6e790a | tcp://127.0.0.1:42011 | banya, remote agent PID 1519557 |
| MI250-02 | a87fb097-b1e1-46f0-8c8c-668740c38b6e | tcp://127.0.0.1:42012 | banya2, remote agent PID 896379 |

The Windows-owned SSH processes (33228, 37072) use Ubuntu 192.168.0.19 as the SSH jump. Each MI has a local forward plus reverse forwards for gateway and peer. The Studio container has an additional opaque TCP dial process: container 127.0.0.1:42010 -> host.docker.internal:42010. P4 envelopes are unchanged.

Agents, SSH tunnels, and loaded models remain running. These are current processes, not an installed restart/reconnection service. Restarting the PC or recreating the Studio container requires restoring this network setup. Do not blindly rerun the initial startup script while these ports/processes are active.

## Model

Actual GGUF metadata confirms `Step-3.7-Flash`, architecture `step35`, 45 layers. Both files are 122218291488 bytes. A full model-file checksum comparison was not run.

| Agent | Node generation 1 | Layers | Native endpoint | ROCR_VISIBLE_DEVICES |
|---|---|---|---|---|
| MI250-01 | step37-s0 | [0,12) | 127.0.0.1:42100 | 0 |
| MI250-01 | step37-s1 | [12,24) | 127.0.0.1:42101 | 1 |
| MI250-02 | step37-s2 | [24,36) | 127.0.0.1:42102 | 0 |
| MI250-02 | step37-s3 | [36,45) | 127.0.0.1:42103 | 1 |

Each process sees `ROCm0`. Actual rocm-smi enumeration shows allocation on hardware indices 2 and 3 on each host; the process-visible ordinals are not rocm-smi indices. Post-inference VRAM totals: MI-A GPU2/3 about 26.1/33.4 GiB, MI-B GPU2/3 about 32.6/25.1 GiB. These snapshots are not a sustained GPU utilization measurement.

Native binaries: `/home/<user>/.local/p4/f3658f1b/bin/p4_staged_server`, with the existing ROCm library directory in the saved LOAD options. All four Loaded replies identify upstream `0eadefebd3f8f92a86d634a0e5b8fffc9dc792c0` and patch set `f37f181c9d38afed04993921b30470dd69d8cfd5d232d05405f384a01439e738`. `stage_wire_abi` is `unknown`; this run proves this concrete combination, not general ABI compatibility.

## Inference

Prompt used the GGUF's ChatML markers and an empty closed think prefix, asking: `What is 17 + 25? Then explain pipeline parallelism in one short sentence.`

Actual returned text:

> 17 + 25 is **42**.
>
> Pipeline parallelism is a technique where a model's layers are split across different devices to process different parts of a sequence simultaneously, much like an assembly line.

Arithmetic is correct and output is nonempty natural language. This single smoke prompt is not broad model-quality acceptance.

| Browser measurement | Result |
|---|---:|
| TTFT, actual WebSocket dispatch to first output | 1496 ms |
| Full request response time | 3311 ms |
| Output | 39 tokens |
| Generation TPS, (39-1)/(last-first) | 20.94 tok/s |
| End-to-end output throughput, 39/3.311 | 11.78 tok/s |
| Observed prefill / decode rows | 49 / 38 |
| Execution count per stage | 39 each |

The request monitoring UI shows stage execution evidence for all four nodes. Shared stage processing totals were 666/594/553/479 ms; these are not independent request-only CPU/GPU durations.

## Operation boundary and artifacts

Agent registration, gateway group, node declarations, graph edges, native plans, LOAD, and inference submission were performed in Chrome. Current Studio node-add UI only saves declarations; its model graph requires already-observed P4 nodes. The four actual nodes were therefore prepared using the public CREATE contract in `create-nodes.mjs`, with verified endpoint/correlation/result receipts in `create-receipts.json`. LOAD and inference were not substituted with a CLI driver.

`model-loaded.json` holds saved plans and four actual Loaded payloads. `owners.json`, gateway/SSH logs, `gguf-metadata.json`, and MI-A/B GPU snapshots preserve runtime evidence. The Chrome tab remains open on this request's monitoring detail.

No product sources, persistent service deployment, commits, or P4 source changes were made. Studio HEAD was `b510af9fc06c893f247f26156c9f2a727b022092`, with extensive pre-existing dirty changes. P4 HEAD advanced from `0fe51f4c9f8b79bc4573497d5ce7d547b8e73168` to `77679ae4f176b031912e8ff7b2b605aca1ddeada` in another task. This run used the previously verified envelope-test agent binaries, not a build of those changing HEADs. Native and agent hashes are recorded in owners and setup output. No overall P4 release acceptance is claimed.
