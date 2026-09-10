import { describe, expect, it } from "vitest";
import {
  P4_AGENT_INSPECT_CONTENT_TYPE,
  P4_AGENT_SNAPSHOT_CONTENT_TYPE,
  P4_RESULT_CONTENT_TYPE,
  decodeAgentInspectionResponse,
  encodeAgentInspectionRequest,
} from "./agent-inspection.js";

class FixtureWriter {
  private readonly bytes: number[] = [];

  u8(value: number) { this.bytes.push(value); }
  u16(value: number) { this.bytes.push(value & 255, (value >>> 8) & 255); }
  u32(value: number) { this.bytes.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
  u64(value: number) { for (let shift = 0; shift < 8; shift += 1) this.bytes.push(Math.floor(value / (2 ** (shift * 8))) & 255); }
  raw(value: Uint8Array) { this.bytes.push(...value); }
  text(value: string) { const bytes = new TextEncoder().encode(value); this.u32(bytes.length); this.raw(bytes); }
  finish() { return Uint8Array.from(this.bytes); }
}

const responseEvent = (
  correlationId: string,
  contentType: string,
  payload: unknown,
) => {
  const envelope = new FixtureWriter();
  envelope.u16(3);
  envelope.text("response-event");
  envelope.text(correlationId);
  envelope.u8(0);
  envelope.u8(0); envelope.text("tcp://127.0.0.1:51055");
  envelope.u8(2); envelope.text("tcp://127.0.0.1:51055"); envelope.text("p4studio"); envelope.u64(1);
  envelope.u8(1); envelope.text("tcp://127.0.0.1:51055"); envelope.text("p4studio"); envelope.u64(1);
  envelope.u8(0);
  envelope.u64(1);
  envelope.u8(0);
  envelope.u8(0);
  envelope.text(contentType);

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const event = new FixtureWriter();
  event.raw(new Uint8Array([0x50, 0x34, 0x45, 0x33]));
  event.u32(envelope.finish().byteLength);
  event.u32(payloadBytes.byteLength);
  event.raw(envelope.finish());
  event.raw(payloadBytes);
  return event.finish();
};

describe("P4 event-v3 agent inspection", () => {
  it("encodes the versioned inspection request", () => {
    const encoded = encodeAgentInspectionRequest({
      agentAddress: "tcp://127.0.0.1:51055",
      correlationId: "inspect-1",
    });
    expect(Array.from(encoded.subarray(0, 4))).toEqual([0x50, 0x34, 0x45, 0x33]);
    expect(new TextDecoder().decode(encoded)).toContain(P4_AGENT_INSPECT_CONTENT_TYPE);
  });

  it("decodes machine facts and the live node registry", () => {
    const decoded = decodeAgentInspectionResponse(
      responseEvent("inspect-2", P4_AGENT_SNAPSHOT_CONTENT_TYPE, {
        schema: 1,
        protocol_version: 3,
        generated_at_unix_ms: 1_789_000_000_000,
        machine: {
          capability: {
            os: "windows", arch: "x86_64",
            cpu: { physical_cores: 8, logical_cores: 16 },
            memory: { total_bytes: 34_359_738_368 },
            gpus: [{ index: 0, uuid: "GPU-a", vendor: "NVIDIA", name: "RTX 3090", pci_bus_id: "0000:21:00.0", driver_version: "596.21", vram_total_bytes: 25_769_803_776 }],
            adapters: ["llamacpp"],
          },
          occupancy: {
            memory: { available_bytes: 17_179_869_184, used_bytes: 17_179_869_184 },
            gpus: [{ uuid: "GPU-a", vram_used_bytes: 1_073_741_824, vram_free_bytes: 24_696_061_952, utilization_gpu_percent: 73, temperature_c: 58, power_draw_w: 312.5 }],
          },
          probes: {
            memory: { source: "os", state: "available", detail: null },
            gpus: { source: "nvidia-smi", state: "available", detail: null },
          },
        },
        nodes: [{ node_id: "node-a", generation: 4, adapter_kind: "llamacpp", state: { lifecycle: "ready" } }],
      }),
      "inspect-2",
    );
    expect(decoded).toEqual({
      schema: 1,
      protocolVersion: 3,
      generatedAtUnixMs: 1_789_000_000_000,
      machine: {
        capability: {
          os: "windows", arch: "x86_64",
          cpu: { physicalCores: 8, logicalCores: 16 },
          memory: { totalBytes: 34_359_738_368 },
          gpus: [{ index: 0, uuid: "GPU-a", vendor: "NVIDIA", name: "RTX 3090", pciBusId: "0000:21:00.0", driverVersion: "596.21", vramTotalBytes: 25_769_803_776 }],
          adapters: ["llamacpp"],
        },
        occupancy: {
          memory: { availableBytes: 17_179_869_184, usedBytes: 17_179_869_184 },
          gpus: [{ uuid: "GPU-a", vramUsedBytes: 1_073_741_824, vramFreeBytes: 24_696_061_952, utilizationGpuPercent: 73, temperatureC: 58, powerDrawW: 312.5 }],
        },
        probes: {
          memory: { source: "os", state: "available", detail: null },
          gpus: { source: "nvidia-smi", state: "available", detail: null },
        },
      },
      nodes: [{ nodeId: "node-a", generation: 4, adapterKind: "llamacpp", state: { lifecycle: "ready" } }],
    });
  });

  it("surfaces a standard P4 rejection detail", () => {
    expect(() => decodeAgentInspectionResponse(
      responseEvent("inspect-3", P4_RESULT_CONTENT_TYPE, { ok: false, detail: "inspection is unsupported" }),
      "inspect-3",
    )).toThrow("inspection is unsupported");
  });
});
