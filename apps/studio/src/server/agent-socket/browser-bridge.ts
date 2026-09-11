import { connect, type Socket } from "node:net";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
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
export function attachBrowserP4Bridge(server: Server, database: StudioDatabase): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
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
      current?.socket.destroy();
      if (current) control(websocket, { type: "closed", connectionId: current.connectionId, detail });
    };
    websocket.on("message", (data, binary) => {
      if (binary) {
        if (!bridge) { control(websocket, { type: "error", connectionId: null, detail: "Open an agent connection before sending P4 bytes" }); return; }
        const bytes = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
        bridge.socket.write(bytes, error => { if (error) close(error.message); });
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
      const socket = connect(agentDialAddress(agent.host, agent.port));
      bridge = { connectionId: message.connectionId, socket };
      socket.setNoDelay(true);
      socket.once("connect", () => control(websocket, { type: "opened", connectionId: message.connectionId, agentId: agent.id }));
      socket.on("data", chunk => { if (websocket.readyState === WebSocket.OPEN) websocket.send(chunk, { binary: true }); });
      socket.once("error", error => close(error.message));
      socket.once("close", () => close("P4 agent connection closed"));
    });
    websocket.once("close", () => close("Browser WebSocket closed"));
    websocket.once("error", () => close("Browser WebSocket errored"));
  });
  return () => { server.off("upgrade", upgrade); wss.close(); };
}
