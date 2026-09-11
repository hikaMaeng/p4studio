// Extracted from recorded P4 config + artifact; see scripts/import-deployment-preset.mjs.
export default {
  "id": "hy3-100k-r8",
  "name": "Hy3 Q5_K_S · 100K / 8",
  "adapter": "llamacpp",
  "ingressAddress": "tcp://192.168.0.6:51054",
  "totalLayers": 80,
  "timeoutMs": 21600000,
  "source": {
    "directory": "F:/dev/p4-fleet-20260910/target/hy3-100k-20260910/hy3-100k-wave-headroom-1789035735558",
    "configSha256": "f28107d87772bf078287241e24d5e2be65947b4aed3fe6193d589e1b10f3a410",
    "artifactSha256": "0abc7aa4af40d01389baa2bb20cea0481fd666485f8d7225029db654d674ecc3",
    "build": {
      "upstream_commit": "434ddbbc0e30522e897670681e503b797c12b7c1",
      "patch_set": "ff1468f6187f0e70e2970f73c0d0ca489d7b8bd4465b583ec1b6305cbee56f3b",
      "backend_inventory": "CPU[CPU]|CUDA[CUDA0,CUDA1]",
      "stage_wire_abi": "p4pb4le64:e691ace7f2c7eef550c8c8c6b455b1de9038307819baf39eb7a939038ae8abd5:types=0/1/4,1/1/2,2/32/18,3/32/20,4/0/0,5/0/0,6/32/22,7/32/24,8/32/34,9/32/36,10/256/84,11/256/110,12/256/144,13/256/176,14/256/210,15/256/292,16/256/66,17/256/74,18/256/98,19/256/50,20/32/18,21/256/110,22/256/82,23/256/136,24/1/1,25/1/2,26/1/4,27/1/8,28/1/8,29/256/56,30/1/2,31/0/0,32/0/0,33/0/0,34/256/54,35/256/66,36/0/0,37/0/0,38/0/0,39/32/17,40/64/36,41/128/18,42/64/18"
    },
    "pipelineCompatibility": "physical-wire-v4",
    "passed": false,
    "requests": 16,
    "completed": 4,
    "released": 4,
    "error": "inference overall deadline expired with observation evidence Missing { requests: 12, stage_executions: 16 }",
    "evidenceMissing": {
      "requests": 12,
      "stage_executions": 16
    },
    "cleanupError": "node event error source=Node { agent: Address { scheme: Tcp, host: \"192.168.0.29\", port: 52004 }, node: \"hy3-100k-wave-headroom-1789035735558-0\", generation: 1789035735559 } target=Outer(OuterEndpoint { ingress_agent: Address { scheme: Tcp, host: \"192.168.0.6\", port: 51054 }, channel: \"hy3-100k-wave-headroom-1789035735558\", connection_generation: 1789035735558 }) event_id=outer:tcp://192.168.0.6:51054:hy3-100k-wave-headroom-1789035735558:1789035735558:35:llamacpp:31500 correlation_id=unload causation_id=Some(\"outer:tcp://192.168.0.6:51054:hy3-100k-wave-headroom-1789035735558:1789035735558:35\") payload={\"code\":\"LLAMA_ADAPTER_EVENT_REJECTED\",\"detail\":\"unload is busy;work={\\\"requests\\\":12,\\\"pending\\\":4,\\\"pending_releases\\\":0,\\\"pending_settlements\\\":0,\\\"prepared_issue\\\":null,\\\"verify_fenced\\\":false,\\\"flight_batches\\\":3,\\\"flight_executions\\\":6,\\\"open_batch_view\\\":3,\\\"effects\\\":0,\\\"effects_fenced\\\":false,\\\"active_publications\\\":0,\\\"held_input\\\":false,\\\"deferred_ack_error\\\":false,\\\"active_owners\\\":8,\\\"active_frontiers\\\":8,\\\"receive\\\":{\\\"running\\\":0,\\\"uncertain\\\":0,\\\"active_attempt\\\":false,\\\"fenced\\\":false}}\"}"
  },
  "stages": [
    {
      "referenceAgent": "tcp://192.168.0.29:52004",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-0",
      "artifact": "S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 0,
      "layerEnd": 16,
      "device": "CUDA0",
      "planText": "--model \"S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology discrete --layer-begin 0 --layer-end 16 --kv-layer-begin 0 --kv-layer-end 16 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device CUDA0 --flash-attn on --no-mmap --cache-type-k q4_0 --cache-type-v q4_0 --override-tensor \"blk\\.(16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)\\..*=CPU,blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14)\\.ffn_(up|down|gate)_exps.*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"C:/Users/42mob/p4-remote/releases/fleet-wire-9ad366f90/windows-runtime/p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:23021\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.29:52004",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-1",
      "artifact": "S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 16,
      "layerEnd": 32,
      "device": "CUDA1",
      "planText": "--model \"S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology discrete --layer-begin 16 --layer-end 32 --kv-layer-begin 16 --kv-layer-end 32 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device CUDA1 --flash-attn on --no-mmap --cache-type-k q4_0 --cache-type-v q4_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)\\..*=CPU,blk\\.(16|17|18|19|20|21|22|23|24|25|26|27|28|29|30)\\.ffn_(up|down|gate)_exps.*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"C:/Users/42mob/p4-remote/releases/fleet-wire-9ad366f90/windows-runtime/p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:23022\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.26:52004",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-2",
      "artifact": "/mnt/file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 32,
      "layerEnd": 59,
      "device": "CUDA0",
      "planText": "--model \"/mnt/file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology host-shared:0 --layer-begin 32 --layer-end 59 --kv-layer-begin 32 --kv-layer-end 59 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device CUDA0 --flash-attn on --no-mmap --cache-type-k q4_0 --cache-type-v q4_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/m42/p4-fleet-20260910/wire-candidate/target/native/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:23021\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.21:52004",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-3",
      "artifact": "/Volumes/file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 59,
      "layerEnd": 62,
      "device": "MTL0",
      "planText": "--model \"/Volumes/file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology host-shared:0 --layer-begin 59 --layer-end 62 --kv-layer-begin 59 --kv-layer-end 62 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device MTL0 --flash-attn on --no-mmap --cache-type-k f16 --cache-type-v f16 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)\\..*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/Users/mobimac/p4-fleet-20260910/wire-candidate/target/native/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:23021\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.6:51054",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-4",
      "artifact": "S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 62,
      "layerEnd": 78,
      "device": "CUDA0",
      "planText": "--model \"S:/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology discrete --layer-begin 62 --layer-end 78 --kv-layer-begin 62 --kv-layer-end 78 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device CUDA0 --flash-attn on --no-mmap --cache-type-k q4_0 --cache-type-v q4_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|78|79|80)\\..*=CPU,blk\\.(62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77)\\.ffn_(up|down|gate)_exps.*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"F:/dev/p4-releases/fleet-20260910-wire-candidate/windows-runtime/p4_staged_server.exe\",\n  \"endpoint\": \"127.0.0.1:23021\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    },
    {
      "referenceAgent": "tcp://192.168.0.19:52004",
      "referenceNode": "hy3-100k-wave-headroom-1789035735558-5",
      "artifact": "/mnt/nas-file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf",
      "layerStart": 78,
      "layerEnd": 80,
      "device": "CUDA0",
      "planText": "--model \"/mnt/nas-file-station/models/bartowski/Hy3-GGUF/Hy3-Q5_K_S-00001-of-00006.gguf\" --memory-topology discrete --layer-begin 78 --layer-end 80 --kv-layer-begin 78 --kv-layer-end 80 --n-seq-max 8 --spec-type none --kv-unified --batch-size 512 --ubatch-size 256 --ctx-size 819200 --n-gpu-layers 999 --device CUDA0 --flash-attn on --no-mmap --cache-type-k q4_0 --cache-type-v q4_0 --override-tensor \"blk\\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|80)\\..*=CPU,blk\\.(78|79)\\.ffn_(up|down|gate)_exps.*=CPU\"",
      "loadOptionsJson": "{\n  \"binary\": \"/home/hika/p4-fleet-20260910/wire-candidate/target/native-identified/p4_staged_server\",\n  \"endpoint\": \"127.0.0.1:23021\",\n  \"args\": [],\n  \"environment\": [\n    [\n      \"P4_STAGED_TRACE_HELLO\",\n      \"1\"\n    ],\n    [\n      \"CUDA_DEVICE_ORDER\",\n      \"PCI_BUS_ID\"\n    ]\n  ],\n  \"n_batch\": 512,\n  \"n_ubatch\": 256,\n  \"context_size\": 102400,\n  \"total_context_size\": 819200,\n  \"sequence_capacity\": 8,\n  \"ready_timeout_ms\": 21600000,\n  \"io_timeout_ms\": 21600000\n}"
    }
  ]
};
