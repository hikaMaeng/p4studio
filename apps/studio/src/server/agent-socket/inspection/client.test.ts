import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { inspectAgent } from "./client.js";

describe("P4 agent inspection transport", () => {
  it("sends connection-scoped FINISH when an inspection times out", async () => {
    const server = createServer();
    let resolveFinish!: (frame: Buffer) => void;
    const finishReceived = new Promise<Buffer>((resolve) => { resolveFinish = resolve; });
    server.on("connection", (socket) => {
      let received = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length < 4) return;
        const eventEnd = 4 + received.readUInt32LE(0);
        if (received.length >= eventEnd + 4) {
          resolveFinish(received.subarray(eventEnd, eventEnd + 4));
          socket.end();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      const attempt = await inspectAgent("127.0.0.1", address.port, 50);
      expect(attempt.observation.state).toBe("error");
      const finish = await Promise.race([
        finishReceived,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("FINISH was not sent")), 1000)),
      ]);
      expect(Array.from(finish)).toEqual([0, 0, 0, 0]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
