import { connect, type Socket } from "node:net";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { finishP4Socket } from "./finish.js";
import { P4_TUNNEL_PATH, parseP4TunnelClientControl, type P4TunnelServerControl } from "@p4studio/studio_domain/common";
import type { StudioDatabase } from "../database/client.js";
import { agentDialAddress } from "./routes.js";

type Bridge = { connectionId: string; socket: Socket };

const control = (socket: WebSocket, value: P4TunnelServerControl) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
};

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return false;
  const host = request.headers.host;
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * Browser-owned P4 sessions.  The server authorizes an agent ID, then moves
 * opaque TCP bytes only; it never decodes P4 frames or creates P4 events.
 */
export function attachBrowserP4Bridge(server: Server, database: StudioDatabase, closeTimeoutMs = 30_000): () => Promise<void> {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  const closing = new Set<Promise<void>>();
  const owners = new Set<(detail: string) => void>();
  const upgrade = (request: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (pathname !== P4_TUNNEL_PATH) { socket.destroy(); return; }
    if (!sameOrigin(request)) { socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, value => wss.emit("connection", value, request));
  };
  server.on("upgrade", upgrade);
  wss.on("connection", websocket => {
    let bridge: Bridge | undefined;
    const close = (detail: string) => {
      const current = bridge; bridge = undefined;
      if (current && !current.socket.destroyed) {
        // P4 retains the reply route after TCP EOF because the peer may have
        // half-closed its write side. End the route explicitly so the agent
        // releases the connection slot when this browser-owned session ends.
        const retirement = finishP4Socket(current.socket, closeTimeoutMs);
        closing.add(retirement);
        void retirement.finally(() => closing.delete(retirement));
      }
      if (current) control(websocket, { type: "closed", connectionId: current.connectionId, detail });
    };
    owners.add(close);
    websocket.on("message", (data, binary) => {
      if (binary) {
        if (!bridge) { control(websocket, { type: "error", connectionId: null, detail: "Open an agent connection before sending P4 bytes" }); return; }
        const bytes = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        const current = bridge;
        current.socket.write(bytes, error => { if (error && bridge === current) close(error.message); });
        return;
      }
      let message;
      try { message = parseP4TunnelClientControl(JSON.parse(String(data))); }
      catch { control(websocket, { type: "error", connectionId: null, detail: "Invalid bridge control message" }); return; }
      if (message.type === "close") {
        if (!bridge || bridge.connectionId !== message.connectionId) { control(websocket, { type: "error", connectionId: message.connectionId, detail: "Unknown bridge connection" }); return; }
        close("Closed by browser"); return;
      }
      if (bridge) { control(websocket, { type: "error", connectionId: message.connectionId, detail: "One P4 connection is allowed per WebSocket" }); return; }
      const agent = database.agent(message.agentId);
      if (!agent) { control(websocket, { type: "error", connectionId: message.connectionId, detail: "Managed agent was not found" }); return; }
      const group = database.agentGroups.list().find(value => value.memberAgentIds.includes(agent.id));
      if (group && group.gatewayAgentId !== agent.id) { control(websocket, { type: "error", connectionId: message.connectionId, detail: "Connect through the agent group's gateway" }); return; }
      const socket = connect(agentDialAddress(agent.host, agent.port));
      bridge = { connectionId: message.connectionId, socket };
      socket.setNoDelay(true);
      socket.once("connect", () => { if (bridge?.socket === socket) control(websocket, { type: "opened", connectionId: message.connectionId, agentId: agent.id }); });
      socket.on("data", chunk => { if (bridge?.socket === socket && websocket.readyState === WebSocket.OPEN) websocket.send(chunk, { binary: true }); });
      socket.once("error", error => { if (bridge?.socket === socket) close(error.message); });
      socket.once("close", () => { if (bridge?.socket === socket) close("P4 agent connection closed"); });
    });
    websocket.once("close", () => { owners.delete(close); close("Browser WebSocket closed"); });
    websocket.once("error", () => close("Browser WebSocket errored"));
  });
  return async () => {
    server.off("upgrade", upgrade);
    owners.forEach(close => close("Studio shutting down"));
    await Promise.all(closing);
    wss.clients.forEach(websocket => websocket.terminate());
    await new Promise<void>(resolve => wss.close(() => resolve()));
  };
}
