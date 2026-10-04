import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from "node:net";
import WebSocket from "ws";
import { P4_TUNNEL_PATH } from "@p4studio/studio_domain/common";
import { StudioDatabase } from "../database/client.js";
import { attachBrowserP4Bridge } from "./browser-bridge.js";

const servers: Server[] = [];
const tcpServers: TcpServer[] = [];
const databases: StudioDatabase[] = [];
const close = (server: Server | TcpServer) => new Promise<void>(resolve => server.close(() => resolve()));
const listen = (server: Server | TcpServer) => new Promise<number>(resolve => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
const nextMessage = (socket: WebSocket) => new Promise<{ data: WebSocket.RawData; binary: boolean }>((resolve, reject) => {
  socket.once("message", (data, binary) => resolve({ data, binary })); socket.once("error", reject);
});

afterEach(async () => {
  databases.splice(0).forEach(database => database.close());
  await Promise.all(servers.splice(0).map(close));
  await Promise.all(tcpServers.splice(0).map(close));
});

describe("browser P4 bridge", () => {
  it("keeps a replacement bridge alive when the previous socket finally ACKs and closes", async () => {
    let previous!: Socket;
    let finishSeen!: () => void;
    const seen = new Promise<void>(resolve => { finishSeen = resolve; });
    let connections = 0;
    const p4 = createTcpServer(socket => {
      const first = ++connections === 1;
      if (first) previous = socket;
      socket.on("data", bytes => {
        if (bytes.length === 4 && bytes.readUInt32LE(0) === 0) {
          if (first) finishSeen(); else socket.end(bytes);
        } else socket.write(bytes);
      });
    });
    tcpServers.push(p4); const p4Port = await listen(p4);
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const agent = database.createAgent({ name: "p4", host: "127.0.0.1", port: p4Port });
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const firstId = crypto.randomUUID();
    socket.send(JSON.stringify({ type: "open", connectionId: firstId, agentId: agent.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data)).type).toBe("opened");
    socket.send(JSON.stringify({ type: "close", connectionId: firstId }));
    expect(JSON.parse(String((await nextMessage(socket)).data)).type).toBe("closed");
    await seen;
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: agent.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data)).type).toBe("opened");
    const previousClosed = new Promise<void>(resolve => previous.once("close", resolve));
    previous.end(Buffer.alloc(4)); await previousClosed;
    const payload = Buffer.from([7, 6, 5]);
    const echoed = nextMessage(socket); socket.send(payload);
    expect(Buffer.from((await echoed).data as Buffer)).toEqual(payload);
    socket.close(); await detach();
  });

  it("drains browser-owned P4 sockets before Studio shutdown returns", async () => {
    let acknowledge!: () => void;
    let finishSeen!: () => void;
    const seen = new Promise<void>(resolve => { finishSeen = resolve; });
    const p4 = createTcpServer(socket => socket.on("data", bytes => {
      if (bytes.length === 4 && bytes.readUInt32LE(0) === 0) {
        acknowledge = () => socket.end(Buffer.alloc(4)); finishSeen();
      }
    }));
    tcpServers.push(p4); const p4Port = await listen(p4);
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const agent = database.createAgent({ name: "p4", host: "127.0.0.1", port: p4Port });
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: agent.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data)).type).toBe("opened");
    let retired = false; const retiring = detach().then(() => { retired = true; });
    await seen; expect(retired).toBe(false);
    acknowledge(); await retiring; expect(retired).toBe(true);
  });

  it("rejects direct member dialing and permits a gateway with no nodes", async () => {
    const p4 = createTcpServer((socket: Socket) => socket.on("data", bytes => bytes.length === 4 && bytes.readUInt32LE(0) === 0 ? socket.end(bytes) : socket.write(bytes)));
    tcpServers.push(p4); const p4Port = await listen(p4);
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const gateway = database.createAgent({ name: "gateway", host: "127.0.0.1", port: p4Port });
    const member = database.createAgent({ name: "private", host: "private.invalid", port: p4Port });
    database.agentGroups.save({ name: "private cluster", gatewayAgentId: gateway.id, memberAgentIds: [gateway.id, member.id] });
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: member.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data))).toMatchObject({ type: "error", detail: "Connect through the agent group's gateway" });
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: gateway.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data))).toMatchObject({ type: "opened", agentId: gateway.id });
    expect(database.nodes()).toEqual([]);
    socket.close(); detach();
  });
  it("forwards opaque binary P4 bytes without decoding or reframing them", async () => {
    const p4 = createTcpServer((socket: Socket) => socket.on("data", bytes => bytes.length === 4 && bytes.readUInt32LE(0) === 0 ? socket.end(bytes) : socket.write(bytes)));
    tcpServers.push(p4); const p4Port = await listen(p4);
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const agent = database.createAgent({ name: "p4", host: "127.0.0.1", port: p4Port });
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: agent.id }));
    const opened = await nextMessage(socket);
    expect(JSON.parse(String(opened.data))).toMatchObject({ type: "opened", agentId: agent.id });
    const opaque = Buffer.from([3, 0, 0, 0, 0xff, 0x00, 0x12]);
    socket.send(opaque);
    const echoed = await nextMessage(socket);
    expect(echoed.binary).toBe(true);
    expect(Buffer.from(echoed.data as Buffer)).toEqual(opaque);
    socket.close(); detach();
  });

  it("sends P4 FINISH when a browser-owned session closes", async () => {
    const receivedFinish = new Promise<Buffer>((resolve) => {
      const p4 = createTcpServer((socket: Socket) => {
        let received = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          received = Buffer.concat([received, chunk]);
          if (received.length < 4) return;
          const size = received.readUInt32LE(0);
          if (size === 0) {
            resolve(received.subarray(0, 4));
            socket.end();
          }
        });
      });
      tcpServers.push(p4);
    });
    const p4Port = await listen(tcpServers.at(-1)!);
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const agent = database.createAgent({ name: "p4", host: "127.0.0.1", port: p4Port });
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const connectionId = crypto.randomUUID();
    socket.send(JSON.stringify({ type: "open", connectionId, agentId: agent.id }));
    expect(JSON.parse(String((await nextMessage(socket)).data))).toMatchObject({ type: "opened", agentId: agent.id });
    socket.send(JSON.stringify({ type: "close", connectionId }));
    expect(JSON.parse(String((await nextMessage(socket)).data))).toMatchObject({ type: "closed", connectionId });
    expect(Array.from(await receivedFinish)).toEqual([0, 0, 0, 0]);
    socket.close(); detach();
  });

  it("rejects a bridge request for an agent that is not stored by Studio", async () => {
    const database = new StudioDatabase(":memory:"); databases.push(database);
    const server = createServer(express()); servers.push(server);
    const detach = attachBrowserP4Bridge(server, database); const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${P4_TUNNEL_PATH}`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "open", connectionId: crypto.randomUUID(), agentId: crypto.randomUUID() }));
    const response = await nextMessage(socket);
    expect(JSON.parse(String(response.data))).toMatchObject({ type: "error", detail: "Managed agent was not found" });
    socket.close(); detach();
  });
});
