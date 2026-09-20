import { parseLifecycleResult, type LifecycleResultMetadata } from "./lifecycle.js";
const EVENT_MAGIC = new Uint8Array([0x50, 0x34, 0x45, 0x33]);
const EVENT_CLASS_CONTROL = 0;
const ENDPOINT_AGENT = 0;
const ENDPOINT_OUTER = 2;
const OPTIONAL_NONE = 0;
const OPTIONAL_SOME = 1;

export const P4_EVENT_VERSION = 3;
export const P4_AGENT_INSPECTION_SCHEMA_VERSION = 1;
export const P4_AGENT_INSPECT_CONTENT_TYPE =
  "application/vnd.p4.agent.inspect-v1+json";
export const P4_AGENT_SNAPSHOT_CONTENT_TYPE =
  "application/vnd.p4.agent.snapshot-v1+json";
export const P4_RESULT_CONTENT_TYPE = "application/vnd.p4.node.result-v3+json";
export const MAX_P4_AGENT_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export interface P4CpuCapability {
  physicalCores: number;
  logicalCores: number;
}

export interface P4MemoryCapability {
  totalBytes: number | null;
}

export interface P4GpuCapability {
  index: number;
  uuid: string;
  vendor: string;
  name: string;
  pciBusId: string;
  driverVersion: string;
  vramTotalBytes: number;
}

export interface P4MachineCapability {
  os: string;
  arch: string;
  cpu: P4CpuCapability;
  memory: P4MemoryCapability;
  gpus: P4GpuCapability[];
  adapters: string[];
}

export interface P4MemoryOccupancy {
  availableBytes: number | null;
  usedBytes: number | null;
}

export interface P4GpuOccupancy {
  uuid: string;
  vramUsedBytes: number;
  vramFreeBytes: number;
  utilizationGpuPercent: number | null;
  temperatureC: number | null;
  powerDrawW: number | null;
}

export interface P4MachineOccupancy {
  memory: P4MemoryOccupancy;
  gpus: P4GpuOccupancy[];
}

export type P4ProbeState = "available" | "unavailable" | "error";

export interface P4ProbeStatus {
  source: string;
  state: P4ProbeState;
  detail: string | null;
}

export interface P4MachineSnapshot {
  capability: P4MachineCapability;
  occupancy: P4MachineOccupancy;
  probes: {
    memory: P4ProbeStatus;
    gpus: P4ProbeStatus;
  };
}

export interface P4RegisteredNodeSnapshot {
  nodeId: string;
  generation: number;
  adapterKind: string;
  state: unknown;
  lifecycleState?: "loading" | "loaded" | "unloading" | "failed";
  lifecycleResult?: LifecycleResultMetadata | null;
  delivery: P4NodeDeliverySnapshot | null;
}

export interface P4NodeDeliverySnapshot {
  stopped: boolean;
  inputRetained: number;
  completionRetained: number | null;
}

export interface P4ReceiptStorageSnapshot {
  events: number;
  eventBytes: number | null;
  payloadCapacityBytes: number | null;
  unmeasuredEvents: number;
}

export interface P4BrokerReceiptSnapshot {
  duplicateWindow: number;
  indexed: P4ReceiptStorageSnapshot;
  retired: P4ReceiptStorageSnapshot;
  allocated: P4ReceiptStorageSnapshot;
  peakAllocatedEventBytes: number | null;
  committedEvents: number | null;
  evictedEvents: number | null;
  freedEvents: number | null;
  eventIndexCapacity: number;
  orderCapacity: number;
  sequenceEntries: number;
  sequenceCapacity: number;
}

export interface P4BrokerSnapshot {
  sampledAtUnixMs: number;
  state: "ok" | "failed";
  receipts: P4BrokerReceiptSnapshot | null;
  detail: string | null;
}

/** Cumulative agent-wide P4 DATA hop sends observed by the runtime. */
export interface P4HopTransferSnapshot {
  hopDataWrites: number;
  hopDataBytes: number;
}

export interface P4TransportSnapshot {
  transfer: P4HopTransferSnapshot | null;
}

export interface P4AgentSnapshot {
  schema: number;
  protocolVersion: number;
  generatedAtUnixMs: number;
  machine: P4MachineSnapshot;
  nodes: P4RegisteredNodeSnapshot[];
  broker: P4BrokerSnapshot | null;
  transport: P4TransportSnapshot | null;
}

export interface AgentInspectionRequest {
  agentAddress: string;
  correlationId: string;
  eventId?: string;
  channel?: string;
  generation?: number;
}

class ByteWriter {
  private readonly bytes: number[] = [];

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u16(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  u32(value: number): void {
    this.bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
  }

  u64(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`invalid u64 value ${value}`);
    }
    const bigint = BigInt(value);
    for (let shift = 0n; shift < 64n; shift += 8n) {
      this.bytes.push(Number((bigint >> shift) & 0xffn));
    }
  }

  raw(value: Uint8Array): void {
    this.bytes.push(...value);
  }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.u32(encoded.byteLength);
    this.raw(encoded);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  u8(): number {
    return this.take(1)[0] ?? 0;
  }

  u16(): number {
    const value = this.take(2);
    return value[0]! | (value[1]! << 8);
  }

  u32(): number {
    const value = this.take(4);
    return (
      value[0]! |
      (value[1]! << 8) |
      (value[2]! << 16) |
      (value[3]! << 24)
    ) >>> 0;
  }

  u64(): number {
    const value = this.take(8);
    let decoded = 0n;
    for (let index = 0; index < value.byteLength; index += 1) {
      decoded |= BigInt(value[index]!) << BigInt(index * 8);
    }
    if (decoded > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("P4 event u64 exceeds JavaScript safe integer range");
    }
    return Number(decoded);
  }

  raw(length: number): Uint8Array {
    return this.take(length);
  }

  text(): string {
    const length = this.u32();
    return new TextDecoder("utf-8", { fatal: true }).decode(this.take(length));
  }

  done(): void {
    if (this.remaining() !== 0) {
      throw new Error(`unexpected ${this.remaining()} trailing P4 event bytes`);
    }
  }

  private take(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.bytes.byteLength) {
      throw new Error("truncated P4 event frame");
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

function writeOuterEndpoint(
  writer: ByteWriter,
  agentAddress: string,
  channel: string,
  generation: number,
): void {
  writer.u8(ENDPOINT_OUTER);
  writeOuter(writer, agentAddress, channel, generation);
}

function writeOuter(
  writer: ByteWriter,
  agentAddress: string,
  channel: string,
  generation: number,
): void {
  writer.text(agentAddress);
  writer.text(channel);
  writer.u64(generation);
}

function skipOuter(reader: ByteReader): void {
  reader.text();
  reader.text();
  reader.u64();
}

function skipEndpoint(reader: ByteReader): void {
  const kind = reader.u8();
  if (kind === ENDPOINT_AGENT) {
    reader.text();
    return;
  }
  if (kind === 1) {
    reader.text();
    reader.text();
    reader.u64();
    return;
  }
  if (kind === ENDPOINT_OUTER) {
    skipOuter(reader);
    return;
  }
  throw new Error(`unsupported P4 endpoint kind ${kind}`);
}

function skipOptionalText(reader: ByteReader): void {
  const tag = reader.u8();
  if (tag === OPTIONAL_SOME) {
    reader.text();
    return;
  }
  if (tag !== OPTIONAL_NONE) {
    throw new Error(`invalid optional text tag ${tag}`);
  }
}

function skipOptionalU64(reader: ByteReader): void {
  const tag = reader.u8();
  if (tag === OPTIONAL_SOME) {
    reader.u64();
    return;
  }
  if (tag !== OPTIONAL_NONE) {
    throw new Error(`invalid optional u64 tag ${tag}`);
  }
}

function frameEvent(envelope: Uint8Array, payload: Uint8Array): Uint8Array {
  const writer = new ByteWriter();
  writer.raw(EVENT_MAGIC);
  writer.u32(envelope.byteLength);
  writer.u32(payload.byteLength);
  writer.raw(envelope);
  writer.raw(payload);
  return writer.finish();
}

export function encodeAgentInspectionRequest(
  input: AgentInspectionRequest,
): Uint8Array {
  const generation = input.generation ?? 1;
  const channel = input.channel ?? "p4studio";
  const envelope = new ByteWriter();

  envelope.u16(P4_EVENT_VERSION);
  envelope.text(input.eventId ?? `${input.correlationId}:inspect`);
  envelope.text(input.correlationId);
  envelope.u8(OPTIONAL_NONE);
  writeOuterEndpoint(envelope, input.agentAddress, channel, generation);
  envelope.u8(ENDPOINT_AGENT);
  envelope.text(input.agentAddress);
  envelope.u8(OPTIONAL_SOME);
  writeOuter(envelope, input.agentAddress, channel, generation);
  envelope.u8(EVENT_CLASS_CONTROL);
  envelope.u64(1);
  envelope.u8(OPTIONAL_NONE);
  envelope.u8(OPTIONAL_NONE);
  envelope.text(P4_AGENT_INSPECT_CONTENT_TYPE);

  return frameEvent(envelope.finish(), new TextEncoder().encode("{}"));
}

interface DecodedEvent {
  protocolVersion: number;
  correlationId: string;
  payloadContentType: string;
  payload: unknown;
}

function decodeEvent(bytes: Uint8Array): DecodedEvent {
  if (bytes.byteLength > MAX_P4_AGENT_SNAPSHOT_BYTES) {
    throw new Error("P4 agent snapshot exceeds the Studio safety limit");
  }
  const frame = new ByteReader(bytes);
  for (const expected of EVENT_MAGIC) {
    if (frame.u8() !== expected) {
      throw new Error("invalid P4 event magic");
    }
  }
  const envelopeLength = frame.u32();
  const payloadLength = frame.u32();
  const envelope = new ByteReader(frame.raw(envelopeLength));
  const payloadBytes = frame.raw(payloadLength);
  frame.done();

  const protocolVersion = envelope.u16();
  envelope.text();
  const correlationId = envelope.text();
  skipOptionalText(envelope);
  skipEndpoint(envelope);
  skipEndpoint(envelope);
  const returnRouteTag = envelope.u8();
  if (returnRouteTag === OPTIONAL_SOME) {
    skipOuter(envelope);
  } else if (returnRouteTag !== OPTIONAL_NONE) {
    throw new Error(`invalid P4 return route tag ${returnRouteTag}`);
  }
  envelope.u8();
  envelope.u64();
  skipOptionalU64(envelope);
  skipOptionalText(envelope);
  const payloadContentType = envelope.text();
  envelope.done();

  const payloadText = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText) as unknown;
  } catch {
    throw new Error("P4 agent returned a non-JSON inspection payload");
  }
  return { protocolVersion, correlationId, payloadContentType, payload };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
  return value;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function nullableFiniteNumber(value: unknown, label: string): number | null {
  return value === null ? null : finiteNumber(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function receiptStorage(value: unknown, label: string): P4ReceiptStorageSnapshot {
  const storage = object(value, label);
  return {
    events: integer(storage.events, `${label}.events`),
    eventBytes: nullableInteger(storage.event_bytes, `${label}.event_bytes`),
    payloadCapacityBytes: nullableInteger(storage.payload_capacity_bytes, `${label}.payload_capacity_bytes`),
    unmeasuredEvents: integer(storage.unmeasured_events, `${label}.unmeasured_events`),
  };
}

function brokerSnapshot(value: unknown): P4BrokerSnapshot | null {
  if (value === undefined) return null;
  const broker = object(value, "snapshot.broker");
  const state = string(broker.state, "snapshot.broker.state");
  if (state !== "ok" && state !== "failed") throw new Error("snapshot.broker.state is unsupported");
  const detail = broker.detail === undefined || broker.detail === null ? null : string(broker.detail, "snapshot.broker.detail");
  if (broker.receipts === null) return { sampledAtUnixMs: integer(broker.sampled_at_unix_ms, "snapshot.broker.sampled_at_unix_ms"), state, receipts: null, detail };
  const receipts = object(broker.receipts, "snapshot.broker.receipts");
  return {
    sampledAtUnixMs: integer(broker.sampled_at_unix_ms, "snapshot.broker.sampled_at_unix_ms"),
    state,
    detail,
    receipts: {
      duplicateWindow: integer(receipts.duplicate_window, "snapshot.broker.receipts.duplicate_window"),
      indexed: receiptStorage(receipts.indexed, "snapshot.broker.receipts.indexed"),
      retired: receiptStorage(receipts.retired, "snapshot.broker.receipts.retired"),
      allocated: receiptStorage(receipts.allocated, "snapshot.broker.receipts.allocated"),
      peakAllocatedEventBytes: nullableInteger(receipts.peak_allocated_event_bytes, "snapshot.broker.receipts.peak_allocated_event_bytes"),
      committedEvents: nullableInteger(receipts.committed_events, "snapshot.broker.receipts.committed_events"),
      evictedEvents: nullableInteger(receipts.evicted_events, "snapshot.broker.receipts.evicted_events"),
      freedEvents: nullableInteger(receipts.freed_events, "snapshot.broker.receipts.freed_events"),
      eventIndexCapacity: integer(receipts.event_index_capacity, "snapshot.broker.receipts.event_index_capacity"),
      orderCapacity: integer(receipts.order_capacity, "snapshot.broker.receipts.order_capacity"),
      sequenceEntries: integer(receipts.sequence_entries, "snapshot.broker.receipts.sequence_entries"),
      sequenceCapacity: integer(receipts.sequence_capacity, "snapshot.broker.receipts.sequence_capacity"),
    },
  };
}

function transportSnapshot(value: unknown): P4TransportSnapshot | null {
  if (value === undefined) return null;
  const transport = object(value, "snapshot.transport");
  if (transport.transfer === undefined || transport.transfer === null) {
    return { transfer: null };
  }
  const transfer = object(transport.transfer, "snapshot.transport.transfer");
  return {
    transfer: {
      hopDataWrites: integer(
        transfer.hop_data_writes,
        "snapshot.transport.transfer.hop_data_writes",
      ),
      hopDataBytes: integer(
        transfer.hop_data_bytes,
        "snapshot.transport.transfer.hop_data_bytes",
      ),
    },
  };
}

function probeStatus(value: unknown, label: string): P4ProbeStatus {
  const probe = object(value, label);
  const state = string(probe.state, `${label}.state`);
  if (state !== "available" && state !== "unavailable" && state !== "error") {
    throw new Error(`${label}.state is unsupported`);
  }
  if (probe.detail !== null && typeof probe.detail !== "string") {
    throw new Error(`${label}.detail must be a string or null`);
  }
  return {
    source: string(probe.source, `${label}.source`),
    state,
    detail: probe.detail,
  };
}

function resultError(payload: unknown): string {
  const value = object(payload, "P4 result");
  return typeof value.detail === "string" && value.detail.length > 0
    ? value.detail
    : "P4 agent rejected the inspection request";
}

export function decodeAgentInspectionResponse(
  bytes: Uint8Array,
  expectedCorrelationId: string,
): P4AgentSnapshot {
  const event = decodeEvent(bytes);
  if (event.protocolVersion !== P4_EVENT_VERSION) {
    throw new Error(`unsupported P4 event version ${event.protocolVersion}`);
  }
  if (event.correlationId !== expectedCorrelationId) {
    throw new Error("P4 inspection correlation id mismatch");
  }
  if (event.payloadContentType === P4_RESULT_CONTENT_TYPE) {
    throw new Error(resultError(event.payload));
  }
  if (event.payloadContentType !== P4_AGENT_SNAPSHOT_CONTENT_TYPE) {
    throw new Error(
      `unexpected P4 inspection content type ${event.payloadContentType}`,
    );
  }

  const payload = object(event.payload, "P4 agent snapshot");
  const schema = integer(payload.schema, "snapshot.schema");
  const protocolVersion = integer(
    payload.protocol_version,
    "snapshot.protocol_version",
  );
  if (schema !== P4_AGENT_INSPECTION_SCHEMA_VERSION) {
    throw new Error(`unsupported P4 agent snapshot schema ${schema}`);
  }
  if (protocolVersion !== P4_EVENT_VERSION) {
    throw new Error(`snapshot declares P4 event version ${protocolVersion}`);
  }

  const machineValue = object(payload.machine, "snapshot.machine");
  const capability = object(
    machineValue.capability,
    "snapshot.machine.capability",
  );
  const cpu = object(capability.cpu, "snapshot.machine.capability.cpu");
  const memoryCapability = object(
    capability.memory,
    "snapshot.machine.capability.memory",
  );
  const occupancy = object(
    machineValue.occupancy,
    "snapshot.machine.occupancy",
  );
  const memoryOccupancy = object(
    occupancy.memory,
    "snapshot.machine.occupancy.memory",
  );
  const probes = object(machineValue.probes, "snapshot.machine.probes");
  if (!Array.isArray(capability.adapters)) {
    throw new Error("snapshot.machine.capability.adapters must be an array");
  }
  if (!Array.isArray(capability.gpus)) {
    throw new Error("snapshot.machine.capability.gpus must be an array");
  }
  if (!Array.isArray(occupancy.gpus)) {
    throw new Error("snapshot.machine.occupancy.gpus must be an array");
  }
  if (!Array.isArray(payload.nodes)) {
    throw new Error("snapshot.nodes must be an array");
  }

  return {
    schema,
    protocolVersion,
    generatedAtUnixMs: integer(
      payload.generated_at_unix_ms,
      "snapshot.generated_at_unix_ms",
    ),
    machine: {
      capability: {
        os: string(capability.os, "snapshot.machine.capability.os"),
        arch: string(capability.arch, "snapshot.machine.capability.arch"),
        cpu: {
          physicalCores: integer(
            cpu.physical_cores,
            "snapshot.machine.capability.cpu.physical_cores",
          ),
          logicalCores: integer(
            cpu.logical_cores,
            "snapshot.machine.capability.cpu.logical_cores",
          ),
        },
        memory: {
          totalBytes: nullableInteger(
            memoryCapability.total_bytes,
            "snapshot.machine.capability.memory.total_bytes",
          ),
        },
        gpus: capability.gpus.map((gpu, index) => {
          const value = object(
            gpu,
            `snapshot.machine.capability.gpus[${index}]`,
          );
          return {
            index: integer(value.index, `snapshot.machine.capability.gpus[${index}].index`),
            uuid: string(value.uuid, `snapshot.machine.capability.gpus[${index}].uuid`),
            vendor: string(value.vendor, `snapshot.machine.capability.gpus[${index}].vendor`),
            name: string(value.name, `snapshot.machine.capability.gpus[${index}].name`),
            pciBusId: string(value.pci_bus_id, `snapshot.machine.capability.gpus[${index}].pci_bus_id`),
            driverVersion: string(value.driver_version, `snapshot.machine.capability.gpus[${index}].driver_version`),
            vramTotalBytes: integer(value.vram_total_bytes, `snapshot.machine.capability.gpus[${index}].vram_total_bytes`),
          };
        }),
        adapters: capability.adapters.map((adapter, index) =>
          string(adapter, `snapshot.machine.capability.adapters[${index}]`),
        ),
      },
      occupancy: {
        memory: {
          availableBytes: nullableInteger(
            memoryOccupancy.available_bytes,
            "snapshot.machine.occupancy.memory.available_bytes",
          ),
          usedBytes: nullableInteger(
            memoryOccupancy.used_bytes,
            "snapshot.machine.occupancy.memory.used_bytes",
          ),
        },
        gpus: occupancy.gpus.map((gpu, index) => {
          const value = object(gpu, `snapshot.machine.occupancy.gpus[${index}]`);
          return {
            uuid: string(value.uuid, `snapshot.machine.occupancy.gpus[${index}].uuid`),
            vramUsedBytes: integer(value.vram_used_bytes, `snapshot.machine.occupancy.gpus[${index}].vram_used_bytes`),
            vramFreeBytes: integer(value.vram_free_bytes, `snapshot.machine.occupancy.gpus[${index}].vram_free_bytes`),
            utilizationGpuPercent: nullableInteger(value.utilization_gpu_percent, `snapshot.machine.occupancy.gpus[${index}].utilization_gpu_percent`),
            temperatureC: nullableInteger(value.temperature_c, `snapshot.machine.occupancy.gpus[${index}].temperature_c`),
            powerDrawW: nullableFiniteNumber(value.power_draw_w, `snapshot.machine.occupancy.gpus[${index}].power_draw_w`),
          };
        }),
      },
      probes: {
        memory: probeStatus(probes.memory, "snapshot.machine.probes.memory"),
        gpus: probeStatus(probes.gpus, "snapshot.machine.probes.gpus"),
      },
    },
    nodes: payload.nodes.map((node, index) => {
      const value = object(node, `snapshot.nodes[${index}]`);
      const deliveryValue = value.delivery === undefined ? null : object(value.delivery, `snapshot.nodes[${index}].delivery`);
      return {
        nodeId: string(value.node_id, `snapshot.nodes[${index}].node_id`),
        generation: integer(
          value.generation,
          `snapshot.nodes[${index}].generation`,
        ),
        adapterKind: string(
          value.adapter_kind,
          `snapshot.nodes[${index}].adapter_kind`,
        ),
        state: value.state,
        ...(value.lifecycle_state === undefined ? {} : { lifecycleState: lifecycleState(value.lifecycle_state) }),
        ...(value.lifecycle_result === undefined ? {} : { lifecycleResult: value.lifecycle_result === null ? null : parseLifecycleResult(value.lifecycle_result) }),
        delivery: deliveryValue === null ? null : {
          stopped: boolean(deliveryValue.stopped, `snapshot.nodes[${index}].delivery.stopped`),
          inputRetained: integer(deliveryValue.input_retained, `snapshot.nodes[${index}].delivery.input_retained`),
          completionRetained: nullableInteger(deliveryValue.completion_retained, `snapshot.nodes[${index}].delivery.completion_retained`),
        },
      };
    }),
    broker: brokerSnapshot(payload.broker),
    transport: transportSnapshot(payload.transport),
  };
}

function lifecycleState(value: unknown): NonNullable<P4RegisteredNodeSnapshot["lifecycleState"]> {
  if (value !== "loading" && value !== "loaded" && value !== "unloading" && value !== "failed") throw new Error("Invalid node lifecycle state");
  return value;
}
