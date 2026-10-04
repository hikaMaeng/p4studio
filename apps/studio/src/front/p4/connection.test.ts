import { afterEach, expect, it, vi } from "vitest";
import { decodeP4Event, encodeP4Event, frameP4Event, NODE_LOAD_CONTENT_TYPE, NODE_LIFECYCLE_RESULT_CONTENT_TYPE, P4_DELIVERY_FAILURE_CONTENT_TYPE, type P4Event } from "@p4studio/p4-protocol";
import { BrowserP4Connection } from "./connection.js";

class Socket extends EventTarget {
  static OPEN = 1;
  static latest: Socket;
  readyState = 1;
  sent: unknown[] = [];
  respondFinish = true;
  closed = false;
  constructor() { super(); Socket.latest = this; }
  send(value: unknown) {
    this.sent.push(value);
    if (this.respondFinish && value instanceof ArrayBuffer && value.byteLength === 4 && new DataView(value).getUint32(0, true) === 0)
      queueMicrotask(() => this.message(value));
  }
  close() { this.closed = true; this.readyState = 3; }
  message(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data })); }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("waits for a framed FINISH ACK, including split and coalesced bytes, before closing", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agentId = crypto.randomUUID();
  const opening = BrowserP4Connection.open(agentId, "tcp://agent:12345");
  const socket = Socket.latest; socket.respondFinish = false; socket.dispatchEvent(new Event("open"));
  const control = JSON.parse(socket.sent[0] as string);
  socket.message(JSON.stringify({ type: "opened", connectionId: control.connectionId, agentId }));
  const connection = await opening;
  const closing = connection.close();
  expect(socket.closed).toBe(false);
  expect(Array.from(new Uint8Array(socket.sent.at(-1) as ArrayBuffer))).toEqual([0, 0, 0, 0]);
  const queued = frameP4Event(new Uint8Array([9, 0, 0, 0, 0]));
  socket.message(queued.buffer);
  expect(socket.closed).toBe(false); // zeros in the payload are not an ACK.
  socket.message(new Uint8Array([0, 0]).buffer);
  expect(socket.closed).toBe(false);
  socket.message(new Uint8Array([0, 0]).buffer);
  expect(await closing).toBe(true);
  expect(socket.closed).toBe(true);
  expect(connection.close()).toBe(closing);
});

it("bounds missing FINISH ACK without claiming retirement and rejects a pending exchange", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const agentId = crypto.randomUUID(); const opening = BrowserP4Connection.open(agentId, "tcp://agent:12345");
  const socket = Socket.latest; socket.respondFinish = false; socket.dispatchEvent(new Event("open"));
  const control = JSON.parse(socket.sent[0] as string); socket.message(JSON.stringify({ type: "opened", connectionId: control.connectionId, agentId }));
  const connection = await opening;
  const pending = connection.exchange({ kind: "agent", address: "tcp://agent:12345" }, null, "application/json", {}, ["application/json"], 1000);
  const rejected = expect(pending).rejects.toMatchObject({ name: "UncertainP4Delivery" });
  const closing = connection.close(); await rejected;
  await vi.advanceTimersByTimeAsync(29_999); expect(socket.closed).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(await closing).toBe(false); expect(socket.closed).toBe(true);
});

it("timestamps coalesced frames before decoding and consumer work, and retains partial frames", async () => {
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  let clock = 100.25;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const agentId = crypto.randomUUID();
  const opening = BrowserP4Connection.open(agentId, "tcp://agent:12345");
  const socket = Socket.latest;
  socket.dispatchEvent(new Event("open"));
  const control = JSON.parse(socket.sent[0] as string);
  socket.message(JSON.stringify({ type: "opened", connectionId: control.connectionId, agentId }));
  const connection = await opening;
  const event: P4Event = { eventId: "output", correlationId: "run", causationId: null, source: { kind: "node", address: "tcp://agent:12345", nodeId: "node", generation: 1 }, target: connection.outer, returnRoute: connection.outer, class: 1, sequence: 1, deadline: null, adapterKind: "llamacpp", contentType: "application/vnd.p4.llamacpp.output-v6+json", payload: new TextEncoder().encode("{}") };
  // Same byte length, distinct identity: P4 event IDs are unique per event.
  const frame = frameP4Event(encodeP4Event(event)), second = frameP4Event(encodeP4Event({ ...event, eventId: "second" })), third = frameP4Event(encodeP4Event({ ...event, eventId: "third!" }));
  const joined = new Uint8Array(frame.length + second.length); joined.set(frame); joined.set(second, frame.length);
  const times: number[] = [];
  connection.onEvent((_event, receivedAtMs) => { times.push(receivedAtMs); clock += 500; });
  socket.message(joined.buffer);
  expect(times).toEqual([100.25, 100.25]);
  socket.message(third.slice(0, 8).buffer);
  expect(times).toHaveLength(2);
  clock = 1500.75;
  socket.message(third.slice(8).buffer);
  expect(times).toEqual([100.25, 100.25, 1500.75]);
  // The broker relays a repeat as often as it arrives; an already consumed event ID is dropped here.
  socket.message(frame.buffer); socket.message(third.buffer);
  expect(times).toHaveLength(3);
  clock = 2000.5;
  const receipt = connection.dispatch({ kind: "agent", address: "tcp://agent:12345" }, "llamacpp", "application/json", {});
  expect(receipt.sentAtMs).toBe(2000.5);
  expect(Number.isNaN(Date.parse(receipt.sentAt))).toBe(false);
  expect(socket.sent.at(-1)).toBeInstanceOf(ArrayBuffer);
  connection.close();
});

it("preserves binary lifecycle payloads, ignores stale and duplicate replies, and rotates OUTER identity", async () => {
  vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("window", { setTimeout, clearTimeout }); vi.stubGlobal("location", { protocol: "http:", host: "studio.test" });
  const operationId = crypto.randomUUID(), agentId = crypto.randomUUID();
  const open = async () => {
    const opening = BrowserP4Connection.open(agentId, "tcp://agent:12345", operationId);
    const socket = Socket.latest; socket.dispatchEvent(new Event("open"));
    socket.message(JSON.stringify({ type: "opened", connectionId: operationId, agentId }));
    return { connection: await opening, socket };
  };
  const { connection, socket } = await open();
  const target = { kind: "agent", address: "tcp://worker:12345" } as const;
  const binary = new Uint8Array([0, 255, 9, 128]);
  const first = connection.exchange(target, "llamacpp", NODE_LOAD_CONTENT_TYPE, binary, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE], 1000);
  const sent = decodeP4Event(new Uint8Array(socket.sent.at(-1) as ArrayBuffer).slice(4));
  expect(sent.payload).toEqual(binary);
  const reply: P4Event = { ...sent, eventId: "reply-1", causationId: sent.eventId, source: target, target: connection.outer, adapterKind: null, contentType: NODE_LIFECYCLE_RESULT_CONTENT_TYPE };
  let completed = false; void first.then(() => { completed = true; });
  socket.message(frameP4Event(encodeP4Event({ ...reply, eventId: "reply-0", causationId: "old-request" })).buffer);
  await Promise.resolve(); expect(completed).toBe(false);
  socket.message(frameP4Event(encodeP4Event(reply)).buffer); await first;
  const second = connection.exchange(target, "llamacpp", NODE_LOAD_CONTENT_TYPE, binary, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE], 1000);
  const next = decodeP4Event(new Uint8Array(socket.sent.at(-1) as ArrayBuffer).slice(4));
  completed = false; void second.then(() => { completed = true; });
  socket.message(frameP4Event(encodeP4Event(reply)).buffer); await Promise.resolve(); expect(completed).toBe(false);
  socket.message(frameP4Event(encodeP4Event({ ...reply, eventId: "reply-2", causationId: next.eventId })).buffer); await second;
  // A delivery-failure notice for the pending request ends the wait without settling anything.
  const third = connection.exchange(target, "llamacpp", NODE_LOAD_CONTENT_TYPE, binary, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE], 1000);
  const undelivered = decodeP4Event(new Uint8Array(socket.sent.at(-1) as ArrayBuffer).slice(4));
  const notice = (eventId: string, original: string, result: string): P4Event => ({ ...reply, eventId, causationId: original, source: { kind: "agent", address: "tcp://agent:12345" }, class: 3,
    contentType: P4_DELIVERY_FAILURE_CONTENT_TYPE, payload: new TextEncoder().encode(JSON.stringify({ event_id: original, result })) });
  let rejected: unknown; void third.catch(error => { rejected = error; });
  socket.message(frameP4Event(encodeP4Event(notice("notice-0", "another-request", "unknown"))).buffer); await Promise.resolve(); expect(rejected).toBeUndefined();
  socket.message(frameP4Event(encodeP4Event(notice("notice-1", undelivered.eventId, "not_started"))).buffer);
  await expect(third).rejects.toThrow("never sent");
  const fourth = connection.exchange(target, "llamacpp", NODE_LOAD_CONTENT_TYPE, binary, [NODE_LIFECYCLE_RESULT_CONTENT_TYPE], 1000);
  const uncertain = decodeP4Event(new Uint8Array(socket.sent.at(-1) as ArrayBuffer).slice(4));
  socket.message(frameP4Event(encodeP4Event(notice("notice-2", uncertain.eventId, "unknown"))).buffer);
  await expect(fourth).rejects.toMatchObject({ name: "UncertainP4Delivery" });
  connection.close();
  const reopened = await open(); expect(reopened.connection.outer.channel).not.toBe(connection.outer.channel); reopened.connection.close();
});
