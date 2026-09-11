// Extracted from recorded P4 config + artifact; see scripts/import-deployment-preset.mjs.
export default {
  "id": "step37-mi250-r16",
  "name": "Step-3.7-Flash Q4_K_XL · MI250 / 16",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://10.10.10.111:43013",
  "totalLayers": 45,
  "timeoutMs": 10800000,
  "source": {
    "directory": "F:/dev/p4/target/mi250-deploy/evidence-16/2026-09-11T00-15-00Z-r16-mixed-p100k-t512",
    "configSha256": "1ef6723b28fb51576d3f1a274c5d5c91ea356367254bba2dc26aaecd95d31437",
    "artifactSha256": "0f340cfe686ac3a8c6f3b6e3360353250939411d5df7a47bc2348f58cfcaae38",
    "build": {
      "upstream_commit": "0eadefebd3f8f92a86d634a0e5b8fffc9dc792c0",
      "patch_set": "f37f181c9d38afed04993921b30470dd69d8cfd5d232d05405f384a01439e738",
      "backend_inventory": "CPU[CPU]|ROCm[ROCm0]"
    },
    "pipelineCompatibility": null,
    "passed": true,
    "requests": 16,
    "completed": 16,
    "released": 16,
    "error": null,
    "evidenceMissing": null,
    "cleanupError": null
  },
  "stages": [
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-0",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 0,
      "layerEnd": 4,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 0 --layer-end 4 --kv-layer-begin 0 --kv-layer-end 4 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 45 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43200\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"0\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-1",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 4,
      "layerEnd": 8,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 4 --layer-end 8 --kv-layer-begin 4 --kv-layer-end 8 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 41 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43201\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-2",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 8,
      "layerEnd": 11,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 8 --layer-end 11 --kv-layer-begin 8 --kv-layer-end 11 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 37 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43202\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"2\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-3",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 11,
      "layerEnd": 13,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 11 --layer-end 13 --kv-layer-begin 11 --kv-layer-end 13 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 34 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43203\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"3\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-4",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 13,
      "layerEnd": 16,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 13 --layer-end 16 --kv-layer-begin 13 --kv-layer-end 16 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 32 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43204\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"4\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-5",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 16,
      "layerEnd": 18,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 16 --layer-end 18 --kv-layer-begin 16 --kv-layer-end 18 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 29 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43205\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"5\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-6",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 18,
      "layerEnd": 21,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 18 --layer-end 21 --kv-layer-begin 18 --kv-layer-end 21 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 27 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43206\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"6\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.111:43013",
      "referenceNode": "node-7",
      "artifact": "/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 21,
      "layerEnd": 23,
      "device": "ROCm0",
      "planText": "--model \"/home/banya/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 21 --layer-end 23 --kv-layer-begin 21 --kv-layer-end 23 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 24 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43207\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"7\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-8",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 23,
      "layerEnd": 26,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 23 --layer-end 26 --kv-layer-begin 23 --kv-layer-end 26 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 22 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43200\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"0\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-9",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 26,
      "layerEnd": 29,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 26 --layer-end 29 --kv-layer-begin 26 --kv-layer-end 29 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 19 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43201\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-10",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 29,
      "layerEnd": 32,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 29 --layer-end 32 --kv-layer-begin 29 --kv-layer-end 32 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 16 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|32|33|34|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43202\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"2\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-11",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 32,
      "layerEnd": 35,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 32 --layer-end 35 --kv-layer-begin 32 --kv-layer-end 35 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 13 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|35|36|37|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43203\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"3\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-12",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 35,
      "layerEnd": 38,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 35 --layer-end 38 --kv-layer-begin 35 --kv-layer-end 38 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 10 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|38|39|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43204\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"4\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-13",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 38,
      "layerEnd": 40,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 38 --layer-end 40 --kv-layer-begin 38 --kv-layer-end 40 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 7 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|40|41|42|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43205\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"5\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-14",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 40,
      "layerEnd": 43,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 40 --layer-end 43 --kv-layer-begin 40 --kv-layer-end 43 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 5 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|43|44)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43206\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"6\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    },
    {
      "referenceAgent": "tcp://10.10.10.2:43013",
      "referenceNode": "node-15",
      "artifact": "/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf",
      "layerStart": 43,
      "layerEnd": 45,
      "device": "ROCm0",
      "planText": "--model \"/home/banya2/models/step37-merged/Step-3.7-Flash-Q4_K_XL.gguf\" --memory-topology discrete --layer-begin 43 --layer-end 45 --kv-layer-begin 43 --kv-layer-end 45 --n-seq-max 16 --spec-type none --kv-unified --batch-size 512 --ubatch-size 512 --ctx-size 1608192 --n-gpu-layers 2 --device ROCm0 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/banya2/.local/p4/f3658f1b/bin/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:43207\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"ROCR_VISIBLE_DEVICES\",\n      \"7\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"P4_STAGED_TRACE_HOP\",\n      \"1\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 512,\n  \"context_size\": 100512,\n  \"total_context_size\": 1608192,\n  \"sequence_capacity\": 16,\n  \"ready_timeout_ms\": 10800000,\n  \"io_timeout_ms\": 10800000\n}"
    }
  ]
};
