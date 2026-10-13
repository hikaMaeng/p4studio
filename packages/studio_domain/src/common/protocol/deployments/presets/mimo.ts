// 기록된 P4 config와 결과에서 추출. scripts/import-deployment-preset.mjs 참조.
export default {
  "id": "mimo-dflash-nmax4",
  "name": "MiMo-V2.6-Flash-RL MXFP4 · Mac20→Mac21→GB10 · DFlash n_max 4",
  "insightNotes": "Mac20 [0,12) → Mac21 [12,24) → GB10 [24,48), DFlash n_max 4. 120요청 강한 웨이브 정상 출력·정산 120/120, 전체 sampled TPS 13.64442(EOS 포함); useful TPS 13.45214(EOS 제외), 7556 generated tokens / 561695 ms(첫 예정 송신~마지막 terminal, EOS 제외). 채택률 0.529165(5171/9772), replay 0/2449. cold8은 정상8/8, useful TPS 16.32700. 이전 핀과 비회귀는 당시 보고의 한정 판정이며 새 CC 구현·Studio 실기 수용을 뜻하지 않는다. 출처: strongpin23-20261011-221013, cold8pin23-20261011-220018. 대상 머신의 경로와 장치를 보존한다.",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://192.168.0.20:52000",
  "totalLayers": 48,
  "timeoutMs": 7200000,
  "source": {
    "directory": "F:\\dev\\p4\\tests\\reports\\mimo-4stage-20261010\\runs\\strongpin23-20261011-221013",
    "configSha256": "8dc03009dc49dcc9e36d020f33f3249416b82096d77ba388028969d55d926899",
    "artifactSha256": "aacd38e92742d4af9bdb2a7627954bf1f2da73abc16243443484a4a7a4d4258e",
    "artifactFile": "inference.json.gz",
    "measurements": [
      {
        "run": "strongpin23-20261011-221013",
        "requests": 120,
        "totalRequests": 120,
        "completed": 120,
        "released": 120,
        "tokens": 7556,
        "sampledTokens": 7664,
        "sampledTps": 13.644415563606584,
        "windowMs": 561695,
        "usefulTps": 13.452140396478516,
        "acceptanceRate": 0.5291649611133852,
        "replayRatio": 0,
        "rounds": 2449,
        "slo": null
      },
      {
        "run": "cold8pin23-20261011-220018",
        "requests": 8,
        "totalRequests": 8,
        "completed": 8,
        "released": 8,
        "tokens": 568,
        "sampledTokens": 575,
        "sampledTps": 16.528212940872116,
        "windowMs": 34789,
        "usefulTps": 16.326999913765846,
        "acceptanceRate": 0.5663338088445078,
        "replayRatio": 0,
        "rounds": 176,
        "slo": null
      }
    ],
    "evidenceFiles": [
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/strongpin23-20261011-221013/config.json",
        "sha256": "8dc03009dc49dcc9e36d020f33f3249416b82096d77ba388028969d55d926899"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/strongpin23-20261011-221013/summary.json",
        "sha256": "b5454e383ad5349960051687fc18dfa4d40ca83b167f51b3f63bc5f9373ee5be"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/strongpin23-20261011-221013/inference.json.gz",
        "sha256": "aacd38e92742d4af9bdb2a7627954bf1f2da73abc16243443484a4a7a4d4258e"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/strongpin23-20261011-221013/binding.json",
        "sha256": "244bd7d60c75d3a445c527fc4f1eb619e7978922da576423df1fdcc40d56fe5d"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/cold8pin23-20261011-220018/config.json",
        "sha256": "408aca8dda42387427d02a7669020de6fc8d92f36ab1c5b3d1fe8048592bbfdc"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/cold8pin23-20261011-220018/summary.json",
        "sha256": "e1bf1d838f324b581a03b841948deb3465bba628367616f34e6a638acb11926a"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/cold8pin23-20261011-220018/inference.json.gz",
        "sha256": "b7f7a3046c423c75eb8b1230c6142b2978f9bcc99cbbf6bf96015848ba53f32b"
      },
      {
        "file": "F:/dev/p4/tests/reports/mimo-4stage-20261010/runs/cold8pin23-20261011-220018/binding.json",
        "sha256": "fcbf6e50aa8d3601c538fb356cc9e8bcc215ac3bfd08e7c74b5e472165f6e462"
      }
    ],
    "build": {
      "upstream_commit": "23b0202a189c44a54625aadcb37a946dd1d6278d",
      "patch_set": "0bc4a189f67141b0ec79082a44ec7563b5e5e96b253f5313d5e672dfaa703af0",
      "backend_inventory": "BLAS[BLAS]|CPU[CPU]|MTL[MTL0]",
      "stage_wire_abi": "p4pb5le64:afa342585bf94f9529b11d3ab337aa41dd06ddf77023cad0a1826dd6c1a4459a:types=0/1/4,1/1/2,2/32/18,3/32/20,4/0/0,5/0/0,6/32/22,7/32/24,8/32/34,9/32/36,10/256/84,11/256/110,12/256/144,13/256/176,14/256/210,15/256/292,16/256/66,17/256/74,18/256/98,19/256/50,20/32/18,21/256/110,22/256/82,23/256/136,24/1/1,25/1/2,26/1/4,27/1/8,28/1/8,29/256/56,30/1/2,31/0/0,32/0/0,33/0/0,34/256/54,35/256/66,36/0/0,37/0/0,38/0/0,39/32/17,40/64/36,41/128/18,42/64/18"
    },
    "pipelineCompatibility": "physical-wire-v4",
    "passed": true,
    "requests": 120,
    "completed": 120,
    "released": 120,
    "error": null,
    "evidenceMissing": null,
    "cleanupError": null
  },
  "stages": [
    {
      "referenceAgent": "tcp://192.168.0.20:52000",
      "referenceNode": "mimo4-0",
      "artifact": "/Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf",
      "layerStart": 0,
      "layerEnd": 12,
      "device": "MTL0",
      "planText": "--model /Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf --memory-topology discrete --layer-begin 0 --layer-end 12 --kv-layer-begin 0 --kv-layer-end 12 --n-seq-max 64 --spec-type draft-dflash --spec-draft-model /Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/dflash-MiMo-V2.6-Flash-RL-BF16-p29650.gguf --spec-draft-n-max 4 --spec-draft-ngl 99 --spec-draft-device MTL0 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 131072 --n-gpu-layers 49 --device MTL0 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47)\\..*=CPU\" --expect-layer-device 0:12:MTL0",
      "loadOptionsJson": "{\n  \"endpoint\": \"127.0.0.1:24110\",\n  \"args\": [],\n  \"environment\": [],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 2048,\n  \"total_context_size\": 131072,\n  \"sequence_capacity\": 64,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 64,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 131072,\n    \"max_request_bytes\": 1048576,\n    \"max_output_tokens_per_request\": 160,\n    \"max_output_tokens\": 10240,\n    \"max_physical_result_bytes\": 70811724,\n    \"max_completion_payload_bytes\": 71860300,\n    \"max_completion_retained_bytes\": 72908876,\n    \"max_edge_retained_bytes\": 287443248,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 4096\n  },\n  \"ready_timeout_ms\": 7200000,\n  \"io_timeout_ms\": 7200000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.21:52000",
      "referenceNode": "mimo4-1",
      "artifact": "/Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf",
      "layerStart": 12,
      "layerEnd": 24,
      "device": "MTL0",
      "planText": "--model /Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf --memory-topology discrete --layer-begin 12 --layer-end 24 --kv-layer-begin 12 --kv-layer-end 24 --n-seq-max 64 --spec-type draft-dflash --spec-draft-model /Volumes/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/dflash-MiMo-V2.6-Flash-RL-BF16-p29650.gguf --spec-draft-n-max 4 --spec-draft-ngl 99 --spec-draft-device MTL0 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 131072 --n-gpu-layers 49 --device MTL0 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47)\\..*=CPU\" --expect-layer-device 12:24:MTL0",
      "loadOptionsJson": "{\n  \"endpoint\": \"127.0.0.1:24110\",\n  \"args\": [],\n  \"environment\": [],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 2048,\n  \"total_context_size\": 131072,\n  \"sequence_capacity\": 64,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 64,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 131072,\n    \"max_request_bytes\": 1048576,\n    \"max_output_tokens_per_request\": 160,\n    \"max_output_tokens\": 10240,\n    \"max_physical_result_bytes\": 71860812,\n    \"max_completion_payload_bytes\": 72909388,\n    \"max_completion_retained_bytes\": 73957964,\n    \"max_edge_retained_bytes\": 287443248,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 4096\n  },\n  \"ready_timeout_ms\": 7200000,\n  \"io_timeout_ms\": 7200000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.26:52000",
      "referenceNode": "mimo4-2",
      "artifact": "/home/m42/p4-studio-models/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf",
      "layerStart": 24,
      "layerEnd": 48,
      "device": "CUDA0",
      "planText": "--model /home/m42/p4-studio-models/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf --memory-topology discrete --layer-begin 24 --layer-end 48 --kv-layer-begin 24 --kv-layer-end 48 --n-seq-max 64 --spec-type draft-dflash --spec-draft-model /mnt/file-station/models/ggml-org/MiMo-V2.6-Flash-RL-GGUF/dflash-MiMo-V2.6-Flash-RL-BF16-p29650.gguf --spec-draft-n-max 4 --spec-draft-ngl 99 --spec-draft-device CUDA0 --kv-unified --batch-size 64 --ubatch-size 64 --ctx-size 131072 --n-gpu-layers 49 --device CUDA0 --flash-attn on --kv-offload --no-mmap --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23)\\..*=CPU\" --expect-layer-device 24:48:CUDA0",
      "loadOptionsJson": "{\n  \"endpoint\": \"127.0.0.1:24110\",\n  \"args\": [],\n  \"environment\": [],\n  \"n_batch\": 64,\n  \"n_ubatch\": 64,\n  \"context_size\": 2048,\n  \"total_context_size\": 131072,\n  \"sequence_capacity\": 64,\n  \"resource_profile\": {\n    \"version\": 2,\n    \"max_requests\": 64,\n    \"max_request_retained_bytes\": 67108864,\n    \"max_input_tokens\": 131072,\n    \"max_request_bytes\": 1048576,\n    \"max_output_tokens_per_request\": 160,\n    \"max_output_tokens\": 10240,\n    \"max_physical_result_bytes\": 34973644,\n    \"max_completion_payload_bytes\": 36022220,\n    \"max_completion_retained_bytes\": 37070796,\n    \"max_edge_retained_bytes\": 287443248,\n    \"max_receipt_retained_bytes\": 33554432,\n    \"max_output_token_bytes\": 4096,\n    \"max_output_terminal_bytes\": 8192,\n    \"max_release_receipt_bytes\": 8192,\n    \"outer_token_issue_window\": 4096\n  },\n  \"ready_timeout_ms\": 7200000,\n  \"io_timeout_ms\": 7200000\n}"
    }
  ]
};
