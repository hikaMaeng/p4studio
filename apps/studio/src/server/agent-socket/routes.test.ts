import { afterEach, expect, it } from "vitest";
import { connect, createServer } from "node:net";
import { once } from "node:events";
import { agentDialAddress, setAgentRoutes } from "./routes.js";
afterEach(() => setAgentRoutes([]));
it("routes the TCP dial through a tunnel and transports opaque bytes", async () => {
  const server = createServer(socket => socket.pipe(socket));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  setAgentRoutes([{ agentHost: "10.10.10.111", agentPort: 43015, localPort: port }]);
  const client = connect(agentDialAddress("10.10.10.111", 43015));
  try {
    await once(client, "connect");
    const received = once(client, "data"), bytes = Buffer.from([0, 255, 4, 80, 52, 69, 51]);
    client.write(bytes); expect((await received)[0]).toEqual(bytes);
    expect(agentDialAddress("192.168.0.29", 52005)).toEqual({ host: "192.168.0.29", port: 52005 });
  } finally { client.destroy(); server.close(); await once(server, "close"); }
});
