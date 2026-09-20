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
  it("rejects direct member dialing and permits a gateway with no nodes", async () => {
    const p4 = createTcpServer((socket: Socket) => socket.on("data", bytes => socket.write(bytes)));
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
    const p4 = createTcpServer((socket: Socket) => socket.on("data", bytes => socket.write(bytes)));
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
