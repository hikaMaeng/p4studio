import type { Socket } from "node:net";
import { finishP4ConnectionFrame } from "@p4studio/p4-protocol";

/** Transport-only fallback for a vanished browser or legacy inspection owner. */
export function finishP4Socket(socket: Socket, timeoutMs = 30_000): Promise<void> {
  if (socket.destroyed) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      // A reset is an explicit broken connection, unlike EOF between frames.
      // The P4 reader can then retire its route even if FINISH was not consumed.
      if (!socket.destroyed) {
        if (socket.connecting) socket.destroy();
        else {
          try { socket.resetAndDestroy(); } catch { socket.destroy(); }
        }
      }
    }, timeoutMs);
    timer.unref();
    const onError = () => { socket.destroy(); };
    socket.once("error", onError);
    socket.once("close", () => { clearTimeout(timer); socket.off("error", onError); resolve(); });
    // Keep the read side active until the agent drains, ACKs and shuts down.
    // Sending TCP FIN now could make the agent treat a failed retirement as
    // a valid half-close before our deadline can reset the connection.
    if (!socket.writableEnded) socket.write(Buffer.from(finishP4ConnectionFrame()));
  });
}
