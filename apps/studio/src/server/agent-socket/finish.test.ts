import { createServer, connect, type Socket } from "node:net";
import { once } from "node:events";
import { expect, it } from "vitest";
import { finishP4Socket } from "./finish.js";

it("resets a peer that never completes FINISH and releases the Studio socket", async () => {
  let peer: Socket | undefined;
  const server = createServer({ allowHalfOpen: true }, socket => {
    peer = socket; socket.on("error", () => {}); socket.on("data", () => {});
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw Error("listener missing");
  const client = connect(address.port, "127.0.0.1"); await once(client, "connect");
  try {
    const closed = once(peer!, "close").catch(() => {});
    await finishP4Socket(client, 30);
    expect(client.destroyed).toBe(true); await closed;
    expect(peer!.destroyed).toBe(true);
  } finally {
    client.destroy(); peer?.destroy(); server.close(); await once(server, "close");
  }
});
