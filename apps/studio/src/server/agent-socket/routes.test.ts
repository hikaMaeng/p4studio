import { afterEach, expect, it } from "vitest";
import { createServer } from "node:net";
import { once } from "node:events";
import { decodeP4Event, encodeP4Event, type P4Event } from "@p4studio/p4-protocol";
import { DeploymentSocket } from "./deployment/client.js";
import { agentDialAddress, setAgentRoutes } from "./routes.js";

afterEach(() => setAgentRoutes([]));
it("routes the TCP dial through a tunnel without changing logical endpoints or reply identity", async () => {
  let request: P4Event | undefined;
  const server = createServer(socket => { let buffer = Buffer.alloc(0); socket.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 4 || buffer.length < buffer.readUInt32LE(0) + 4) return;
    request = decodeP4Event(buffer.subarray(4));
    const response = encodeP4Event({ ...request, eventId: "reply", causationId: request.eventId, source: request.target, target: request.source,
      class: 3, adapterKind: null, contentType: "application/vnd.p4.node.result-v3+json", payload: new TextEncoder().encode('{"ok":true}') });
    const frame = Buffer.alloc(response.length + 4); frame.writeUInt32LE(response.length); frame.set(response, 4); socket.write(frame);
  }); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  setAgentRoutes([{ agentHost: "10.10.10.111", agentPort: 43015, localPort: port }]);
  const client = new DeploymentSocket("10.10.10.111", 43015, "op");
  try {
    const reply = await client.exchange({ kind: "agent", address: "tcp://10.10.10.111:43015" }, "llamacpp", "application/vnd.p4.node.create-v3+json", {}, ["application/vnd.p4.node.result-v3+json"], 2000);
    expect(request?.target).toEqual({ kind: "agent", address: "tcp://10.10.10.111:43015" });
    expect(request?.source).toMatchObject({ address: "tcp://10.10.10.111:43015" });
    expect(reply.correlationId).toBe("op");
    expect(agentDialAddress("192.168.0.29", 52005)).toEqual({ host: "192.168.0.29", port: 52005 });
  } finally { client.close(); server.close(); await once(server, "close"); }
});
