// 기록된 P4 config와 결과에서 추출. scripts/import-deployment-preset.mjs 참조.
export default {
  "id": "qwen38-none-seq16",
  "name": "Qwen3.8-27B Q4_K_M · hikaTR 3090+4080 · 비스페큘러티브 n_seq_max 16",
  "insightNotes": "hikaTR RTX 3090 head [0,44) + RTX 4080 tail [44,64), 비스페큘러티브 n_seq_max 16. 동시 16 useful TPS 111.14560 / 110.86220(2회 차이 0.255%, 평균 대비); 정상 출력·정산 17/17(워밍업 1 제외 후 16 측정), 지연 한도 통과. 단일 useful TPS 27.15217(16요청 순차, 워밍업 제외). 분모는 첫 예정 송신~마지막 terminal, 출력 generated token 수(EOS 제외). n_seq_max 5→16은 요청 5개 기준 처리량 무변이라는 결합 실험 관찰이며 동등성 증명은 아니다. agent 배칭 knob 개선 미확인. 높은 동시성의 이득은 이 모델·짧은 corpus·장치 조건에 한정. 출처: K2-B-c16-20261012-102200, K2-B-c16-20261012-105045, K2-B-c1-20261012-084734; 20261012_screening.md.",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://192.168.0.6:52000",
  "totalLayers": 64,
  "timeoutMs": 3600000,
  "source": {
    "directory": "F:\\dev\\p4\\tests\\reports\\verify-round-batching-20261012\\runs\\K2-B-c16-20261012-102200",
    "configSha256": "363a8f2ba5111e4e7672463032b51fc6abf3542f37b257cc9ae68251dd69c9b4",
    "artifactSha256": "46485d61689d19579bf4a38095552d541c5b992bc99be73a0a01eb18d784733b",
    "artifactFile": "inference.json.gz",
    "measurements": [
      {
        "run": "K2-B-c16-20261012-102200",
        "requests": 16,
        "totalRequests": 17,
        "completed": 17,
        "released": 17,
        "tokens": 6087,
        "sampledTokens": 6103,
        "sampledTps": 111.43775335061899,
        "windowMs": 54766,
        "usefulTps": 111.14560128546908,
        "acceptanceRate": null,
        "replayRatio": null,
        "rounds": 0,
        "slo": {
          "sched_to_first_p95_ms": 3144.75,
          "gen_tps_median": 9.095079966405512,
          "limits": {
            "sched_to_first_p95_ms": 5000,
            "gen_tps_median": 8
          },
          "pass": true
        }
      },
      {
        "run": "K2-B-c16-20261012-105045",
        "requests": 16,
        "totalRequests": 17,
        "completed": 17,
        "released": 17,
        "tokens": 6087,
        "sampledTokens": 6103,
        "sampledTps": 111.15360798455542,
        "windowMs": 54906,
        "usefulTps": 110.86220085236586,
        "acceptanceRate": null,
        "replayRatio": null,
        "rounds": 0,
        "slo": {
          "sched_to_first_p95_ms": 3142.25,
          "gen_tps_median": 9.044132845093912,
          "limits": {
            "sched_to_first_p95_ms": 5000,
            "gen_tps_median": 8
          },
          "pass": true
        }
      },
      {
        "run": "K2-B-c1-20261012-084734",
        "requests": 16,
        "totalRequests": 17,
        "completed": 17,
        "released": 17,
        "tokens": 6128,
        "sampledTokens": 6144,
        "sampledTps": 27.223061619648103,
        "windowMs": 225691,
        "usefulTps": 27.152168230013604,
        "acceptanceRate": null,
        "replayRatio": null,
        "rounds": 0,
        "slo": {
          "sched_to_first_p95_ms": 209.25,
          "gen_tps_median": 27.12976592198136,
          "limits": {
            "sched_to_first_p95_ms": 5000,
            "gen_tps_median": 8
          },
          "pass": true
        }
      }
    ],
    "evidenceFiles": [
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-102200/config.json",
        "sha256": "363a8f2ba5111e4e7672463032b51fc6abf3542f37b257cc9ae68251dd69c9b4"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-102200/summary.json",
        "sha256": "b217ca4eb3850aebe8da71306854ee7b7a817de40847bbca81b1e3fe17734fee"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-102200/analysis.json",
        "sha256": "c7c579389a03dbacee4bcc643d6f33e25a2082b0869d14d8f66ae3f194894cca"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-102200/inference.json.gz",
        "sha256": "46485d61689d19579bf4a38095552d541c5b992bc99be73a0a01eb18d784733b"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-102200/binding.json",
        "sha256": "04d37cb7268428266e9a3ab63e66fea40a47a220fece82f279dd7b509a30b2ee"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-105045/config.json",
        "sha256": "14049e146e4d719401ce7c55cc8ba70b47075ad5f590fda59a53b93cc0d2fe17"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-105045/summary.json",
        "sha256": "816d5f98580f67aa98dad9b4b5c0def300163996eb9a2a980df3ba6aa856e512"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-105045/analysis.json",
        "sha256": "d04df5b221f6033b2bc7a0cb9227d5d3499b6b63bcd89d145ff236312c1a8edc"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-105045/inference.json.gz",
        "sha256": "04cd55b25d245e5834f711e6dfa84c13ec643ab0704fbfb2ee4f1e58d86d8a21"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c16-20261012-105045/binding.json",
        "sha256": "04d99524e7867247b8e99c3a10efcf9c0bb58ab06a3f473768b95c30ec73dd9e"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c1-20261012-084734/config.json",
        "sha256": "df205ea209ba507845973d77d94ab8219194d2fa128eb89b004718dedb004e05"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c1-20261012-084734/summary.json",
        "sha256": "3551fec300ca14263a72a1e91d4a12b8733693f89c568554954b41ff8966bb4f"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c1-20261012-084734/analysis.json",
        "sha256": "380f214a7aec09f9d9a7226dcdd24154b27933d096f1e68abb1b9bf59654d17e"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c1-20261012-084734/inference.json.gz",
        "sha256": "ef761e225792ccb667e02e2b9b06d9e53d7b4367e4ff64e6cef1e5c8570705ba"
      },
      {
        "file": "F:/dev/p4/tests/reports/verify-round-batching-20261012/runs/K2-B-c1-20261012-084734/binding.json",
        "sha256": "9b28eae7da5b7344024e951ac7b058577544e9416ec54d2ff41ba8dc179f8b5c"
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
    "requests": 17,
    "completed": 17,
    "released": 17,
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
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 0 --layer-end 44 --kv-layer-begin 0 --kv-layer-end 44 --n-seq-max 16 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63)\\..*=CPU\" --expect-layer-device 0:44:CUDA0 --spec-type none",
      "loadOptionsJson": "{\n  \"binary\": \"F:\\\\desktop\\\\p4\\\\bin\\\\p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:24220\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-38e6dbac-fee5-ac16-62d4-cfacbe02f8ed\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 4096,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 16,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 85478220,\n    \"max_completion_payload_bytes\": 86526796,\n    \"max_completion_retained_bytes\": 87575372\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.6:52000",
      "referenceNode": "qwen-local-tail",
      "artifact": "S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
      "layerStart": 44,
      "layerEnd": 64,
      "device": "CUDA0",
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 44 --layer-end 64 --kv-layer-begin 44 --kv-layer-end 64 --n-seq-max 16 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43)\\..*=CPU\" --expect-layer-device 44:64:CUDA0 --spec-type none --tensor-split 1",
      "loadOptionsJson": "{\n  \"binary\": \"F:\\\\desktop\\\\p4\\\\bin\\\\p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:24221\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-79caabbe-c843-631f-3cea-9c01e652c78c\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 4096,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 16,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 1850060,\n    \"max_completion_payload_bytes\": 2898636,\n    \"max_completion_retained_bytes\": 3947212\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    }
  ]
};
