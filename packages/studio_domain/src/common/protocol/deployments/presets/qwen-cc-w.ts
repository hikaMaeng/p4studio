// P4 batch-width harness config/summary에서 추출. scripts/import-deployment-preset.mjs 규칙 참조.
export default {
  "id": "qwen38-mtp-cc-w3-nseq16",
  "name": "Qwen3.8-27B Q4_K_M · hikaTR 3090+4080 · MTP CC+W3 n_max 2 (비통합 KV)",
  "insightNotes": "hikaTR RTX 3090 head [0,44) + RTX 4080 tail [44,64), MTP n_max 2 / n_seq_max 16, 비통합 KV. 전 stage LOAD environment P4_STAGED_CC_FIXED_WIDTH=1(LOAD 시점 판독, CC에서만 유효)이며 stderr에 P4_STAGED_CC_FIXED_WIDTH width=3 tail=0/1이 남았다. harness 통과(driver_exit 0, acceptance 통과, 17/17 완료·정산). 출처: AB-mtp-cc-w3-c1-20261013-011606; inference artifact가 없어 artifact 근거는 summary.json이다. W 실제 적용은 LOAD 보고가 아니라 harness stderr 줄로만 확인되며 Studio 실행 기록에서는 증거 있음/없음으로만 구분한다.",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://192.168.0.6:52001",
  "totalLayers": 64,
  "timeoutMs": 3600000,
  "source": {
    "directory": "F:/dev/p4/tests/reports/batch-width-20261012/runs/AB-mtp-cc-w3-c1-20261013-011606",
    "configSha256": "e14368b5693f4459cbc7bca25a39b398ef8503f9a184978a28ca11638d819be6",
    "artifactSha256": "7f9727713a4cfc9e898ec25a502778e806b0ec36af88f680d7e3caabe1a86a58",
    "artifactFile": "summary.json",
    "measurements": [
      {
        "run": "AB-mtp-cc-w3-c1",
        "spec": "mtp-cc-w3",
        "driverExit": 0,
        "requests": 16,
        "requestCount": 17,
        "completed": 17,
        "released": 17,
        "elapsedMs": 266421,
        "acceptancePassed": true,
        "speculative": {
          "rounds": 3459,
          "drafted": 4109,
          "accepted": 2831,
          "acceptance_rate": 0.6889754198101727,
          "emitted_tokens": 6283,
          "full": 2485,
          "direct": 974,
          "replay": 0
        },
        "fixedWidthLines": {
          "head": [
            [
              "P4_STAGED_CC_FIXED_WIDTH width=3 tail=0"
            ]
          ],
          "tail": [
            [
              "P4_STAGED_CC_FIXED_WIDTH width=3 tail=1"
            ]
          ]
        }
      }
    ],
    "evidenceFiles": [
      {
        "file": "F:/dev/p4/tests/reports/batch-width-20261012/runs/AB-mtp-cc-w3-c1-20261013-011606/config.json",
        "sha256": "e14368b5693f4459cbc7bca25a39b398ef8503f9a184978a28ca11638d819be6"
      },
      {
        "file": "F:/dev/p4/tests/reports/batch-width-20261012/runs/AB-mtp-cc-w3-c1-20261013-011606/summary.json",
        "sha256": "7f9727713a4cfc9e898ec25a502778e806b0ec36af88f680d7e3caabe1a86a58"
      },
      {
        "file": "F:/dev/p4/tests/reports/batch-width-20261012/runs/AB-mtp-cc-w3-c1-20261013-011606/binding.json",
        "sha256": "a926764584c395348538e60c8deaa1ee32d079736cd0238d6a8b51a06cf36a40"
      }
    ],
    "build": {
      "upstream_commit": "23b0202a189c44a54625aadcb37a946dd1d6278d",
      "patch_set": "0bc4a189f67141b0ec79082a44ec7563b5e5e96b253f5313d5e672dfaa703af0",
      "backend_inventory": "CPU[CPU]|CUDA[CUDA0]",
      "stage_wire_abi": "p4pb6le64:08fe760b1658874676cc28783ad5cfec65dda9c4a40e406697dc5babc9fe0afd:types=0/1/4,1/1/2,2/32/18,3/32/20,4/0/0,5/0/0,6/32/22,7/32/24,8/32/34,9/32/36,10/256/84,11/256/110,12/256/144,13/256/176,14/256/210,15/256/292,16/256/66,17/256/74,18/256/98,19/256/50,20/32/18,21/256/110,22/256/82,23/256/136,24/1/1,25/1/2,26/1/4,27/1/8,28/1/8,29/256/56,30/1/2,31/0/0,32/0/0,33/0/0,34/256/54,35/256/66,36/0/0,37/0/0,38/0/0,39/32/17,40/64/36,41/128/18,42/64/18"
    },
    "pipelineCompatibility": "physical-wire-v4",
    "passed": true,
    "requests": 17,
    "completed": 17,
    "released": 17,
    "error": null,
    "evidenceMissing": "harness run has no inference.json artifact; artifact fields cite summary.json",
    "cleanupError": null
  },
  "stages": [
    {
      "referenceAgent": "tcp://192.168.0.6:52001",
      "referenceNode": "qwen-local-head",
      "artifact": "S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
      "layerStart": 0,
      "layerEnd": 44,
      "device": "CUDA0",
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 0 --layer-end 44 --kv-layer-begin 0 --kv-layer-end 44 --n-seq-max 16 --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63)\\..*=CPU\" --expect-layer-device 0:44:CUDA0 --spec-type draft-mtp --spec-draft-model S:/models/hika0/Qwen3.8-27B-Local-GGUF/mtp-Qwen3.8-27B-Q4_0.gguf --spec-draft-ngl 999 --spec-draft-type-k f16 --spec-draft-type-v f16 --spec-draft-n-max 2",
      "loadOptionsJson": "{\n  \"endpoint\": \"127.0.0.1:24220\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-38e6dbac-fee5-ac16-62d4-cfacbe02f8ed\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ],\n    [\n      \"P4_STAGED_CC_FIXED_WIDTH\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 4096,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 16,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 85478220,\n    \"max_completion_payload_bytes\": 86526796,\n    \"max_completion_retained_bytes\": 87575372\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.6:52001",
      "referenceNode": "qwen-local-tail",
      "artifact": "S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
      "layerStart": 44,
      "layerEnd": 64,
      "device": "CUDA0",
      "planText": "--model S:/models/hika0/Qwen3.8-27B-Local-GGUF/Qwen3.8-27B-Q4_K_M.gguf --memory-topology discrete --layer-begin 44 --layer-end 64 --kv-layer-begin 44 --kv-layer-end 64 --n-seq-max 16 --batch-size 64 --ubatch-size 64 --ctx-size 65536 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --threads 24 --threads-batch 24 --n-gpu-layers 999 --device CUDA0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43)\\..*=CPU\" --expect-layer-device 44:64:CUDA0 --spec-type draft-mtp --spec-draft-model S:/models/hika0/Qwen3.8-27B-Local-GGUF/mtp-Qwen3.8-27B-Q4_0.gguf --spec-draft-ngl 999 --spec-draft-type-k f16 --spec-draft-type-v f16 --spec-draft-n-max 2 --tensor-split 1",
      "loadOptionsJson": "{\n  \"endpoint\": \"127.0.0.1:24221\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"CUDA_VISIBLE_DEVICES\",\n      \"GPU-79caabbe-c843-631f-3cea-9c01e652c78c\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ],\n    [\n      \"P4_STAGED_CC_FIXED_WIDTH\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 4096,\n  \"total_context_size\": 65536,\n  \"sequence_capacity\": 16,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 100,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 262144,\n    \"max_request_bytes\": 16777216,\n    \"max_output_tokens_per_request\": 2000,\n    \"max_output_tokens\": 200000,\n    \"max_edge_retained_bytes\": 536870912,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 64,\n    \"max_physical_result_bytes\": 34961356,\n    \"max_completion_payload_bytes\": 36009932,\n    \"max_completion_retained_bytes\": 37058508\n  },\n  \"ready_timeout_ms\": 3600000,\n  \"io_timeout_ms\": 3600000\n}"
    }
  ]
};
