// 기록된 P4 config와 결과에서 추출. scripts/import-deployment-preset.mjs 참조.
export default {
  "id": "qwen38-mtp-nmax2",
  "name": "Qwen3.8-27B Q4_K_M · hikaTR 3090+4080 · MTP n_max 2",
  "insightNotes": "hikaTR RTX 3090 head [0,44) + RTX 4080 tail [44,64), MTP n_max 2 / n_seq_max 5. 동시 5 useful TPS 32.53639, 정상 출력·정산 5/5, 1663 generated tokens / 51112 ms(첫 예정 송신~마지막 terminal, EOS 제외). 측정한 MTP 설정 중 최고지만 비스페큘러티브보다 느림(현 P4 구조). 채택률 0.703892, replay 40.948%(242/591). 지시 표의 replay 64%와 달리 이 run은 40.95%; 약65%는 기준 MTP 관찰이다. 지연 한도 미통과(중앙 생성 TPS <8). 창1과 min rows5는 깨끗한 MTP 반복 대비 절반 이하; 창1에는 CPU 경쟁도 섞임. 출처: S-D-nmax2-20261012-033318; 20261012_screening.md.",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://192.168.0.6:52000",
  "totalLayers": 64,
  "timeoutMs": 3600000,
  "source": {
    "directory": "F:\\dev\\p4\\tests\\reports\\verify-round-batching-20261012\\runs\\S-D-nmax2-20261012-033318",
    "configSha256": "68adaa39fe8e2b1cb99223a3f7ff9f2e5a5423d09ca6414bdd19b2135f708a2d",
    "artifactSha256": "6fe9ca3a6a77ee0747d2581a19cf247757f538878cc61c28d2c7e1a8c0182c5a",
    "artifactFile": "inference.json.gz",
    "measurements": [
      {
        "run": "S-D-nmax2-20261012-033318",
        "requests": 5,
        "totalRequests": 5,
        "completed": 5,
        "released": 5,
        "tokens": 1663,
        "sampledTokens": 1667,
        "sampledTps": 32.61465017999687,
        "windowMs": 51112,
        "usefulTps": 32.536390671466584,
        "acceptanceRate": 0.7038917089678511,
        "replayRatio": 0.40947546531302875,
        "rounds": 591,
        "slo": {
          "sched_to_first_p95_ms": 3233.3999999999996,
          "gen_tps_median": 7.056173577273145,
          "limits": {
            "sched_to_first_p95_ms": 5000,
            "gen_tps_median": 8
          },
          "pass": false
        }
      }
    ],
    "evidenceFiles": [
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/S-D-nmax2-20261012-033318/config.json",
        "sha256": "68adaa39fe8e2b1cb99223a3f7ff9f2e5a5423d09ca6414bdd19b2135f708a2d"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/S-D-nmax2-20261012-033318/summary.json",
        "sha256": "0cc42b35bf17a20058ea7e10ca4212c35ba1feb6d84d6c69496ec69edc7551d6"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/S-D-nmax2-20261012-033318/analysis.json",
        "sha256": "c25d2393fbd34d1b5dcdf883e60529ceae5cd608061fbeb3468c9023b79d9e43"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/S-D-nmax2-20261012-033318/inference.json.gz",
        "sha256": "6fe9ca3a6a77ee0747d2581a19cf247757f538878cc61c28d2c7e1a8c0182c5a"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/S-D-nmax2-20261012-033318/binding.json",
        "sha256": "6b0fe3812681b08612bccb1f215e7f4f57cf4fff43464aaba2678e439a253421"
      }
    ],
    "build": {
      "upstream_commit": "23b0202a189c44a54625aadcb37a946dd1d6278d",
      "patch_set": "0bc4a189f67141b0ec79082a44ec7563b5e5e96b253f5313d5e672dfaa703af0",
      "backend_inventory": "CPU[CPU]|CUDA[CUDA0]",
      "stage_wire_abi": "p4pb5le64:afa342585bf94f9529b11d3ab337aa41dd06ddf77023cad0a1826dd6c1a4459a:types=0/1/4,1/1/2,2/32/18,3/32/20,4/0/0,5/0/0,6/32/22,7/32/24,8/32/34,9/32/36,10/256/84,11/256/110,12/256/144,13/256/176,14/256/210,15/256/292,16/256/66,17/256/74,18/256/98,19/256/50,20/32/18,21/256/110,22/256/82,23/256/136,24/1/1,25/1/2,26/1/4,27/1/8,28/1/8,29/256/56,30/1/2,31/0/0,32/0/0,33/0/0,34/256/54,35/256/66,36/0/0,37/0/0,38/0/0,39/32/17,40/64/36,41/128/18,42/64/18"
    },
    "pipelineCompatibility": "physical-wire-v4",
    "passed": true,
    "requests": 5,
    "completed": 5,
    "released": 5,
    "error": null,
    "evidenceMissing": null,
    "cleanupError": null
  },
  "stages": [
    {
      "referenceAgent": "tcp://192.168.0.6:52000",
      "referenceNode": "qwen-local-head",
      "artifact": "S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
      "layerStart": 0,
      "layerEnd": 44,
      "device": "CUDA0",
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 0 --layer-end 44 --kv-layer-begin 0 --kv-layer-end 44 --n-seq-max 5 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63)\\..*=CPU\" --expect-layer-device 0:44:CUDA0 --spec-type draft-mtp --spec-draft-model S:/models/hika0/Qwen3.8-27B-Local-GGUF/mtp-Qwen3.8-27B-Q4_0.gguf --spec-draft-ngl 999 --spec-draft-type-k f16 --spec-draft-type-v f16 --spec-draft-n-max 2",
      "loadOptionsJson": "{\n  \"binary\": \"F:\\\\desktop\\\\p4\\\\bin\\\\p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:24220\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-38e6dbac-fee5-ac16-62d4-cfacbe02f8ed\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 8192,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 5,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 86786124,\n    \"max_completion_payload_bytes\": 87834700,\n    \"max_completion_retained_bytes\": 88883276\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.6:52000",
      "referenceNode": "qwen-local-tail",
      "artifact": "S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
      "layerStart": 44,
      "layerEnd": 64,
      "device": "CUDA0",
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 44 --layer-end 64 --kv-layer-begin 44 --kv-layer-end 64 --n-seq-max 5 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43)\\..*=CPU\" --expect-layer-device 44:64:CUDA0 --spec-type draft-mtp --spec-draft-model S:/models/hika0/Qwen3.8-27B-Local-GGUF/mtp-Qwen3.8-27B-Q4_0.gguf --spec-draft-ngl 999 --spec-draft-type-k f16 --spec-draft-type-v f16 --spec-draft-n-max 2 --tensor-split 1",
      "loadOptionsJson": "{\n  \"binary\": \"F:\\\\desktop\\\\p4\\\\bin\\\\p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:24221\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-79caabbe-c843-631f-3cea-9c01e652c78c\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 8192,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 5,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 34958540,\n    \"max_completion_payload_bytes\": 36007116,\n    \"max_completion_retained_bytes\": 37055692\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    }
  ]
};
