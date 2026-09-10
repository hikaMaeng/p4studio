import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import {
  MAX_P4_AGENT_SNAPSHOT_BYTES,
  decodeAgentInspectionResponse,
  encodeAgentInspectionRequest,
} from "@p4studio/p4-protocol";
import type { AgentInspectionAttempt } from "./types.js";
import { availableObservation, errorObservation } from "./types.js";

const unreachable = (message: string): AgentInspectionAttempt => ({
  probe: {
    reachability: "unreachable",
    latencyMs: null,
    probeError: message,
  },
  observation: errorObservation(message),
});

/** Queries one agent through the standard length-prefixed P4 event-v3 transport. */
export const inspectAgent = (
  host: string,
  port: number,
  timeoutMs: number,
): Promise<AgentInspectionAttempt> =>
  new Promise((resolve) => {
    const started = performance.now();
    const correlationId = randomUUID();
    const agentAddress = `tcp://${host}:${port}`;
    const event = encodeAgentInspectionRequest({ agentAddress, correlationId });
    const request = Buffer.allocUnsafe(4 + event.byteLength);
    request.writeUInt32LE(event.byteLength, 0);
    request.set(event, 4);

    const socket = connect({ host, port });
    let connectedAt: number | null = null;
    let settled = false;
    let received = Buffer.alloc(0);
    let expectedLength: number | null = null;

    const finish = (attempt: AgentInspectionAttempt) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(attempt);
    };
    const protocolFailure = (message: string) =>
      finish({
        probe: {
          reachability: "reachable",
          latencyMs:
            connectedAt === null
              ? Math.max(0, Math.round(performance.now() - started))
              : connectedAt,
          probeError: null,
        },
        observation: errorObservation(message),
      });

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      connectedAt = Math.max(0, Math.round(performance.now() - started));
      socket.write(request);
    });
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (expectedLength === null && received.byteLength >= 4) {
        expectedLength = received.readUInt32LE(0);
        if (expectedLength <= 0 || expectedLength > MAX_P4_AGENT_SNAPSHOT_BYTES) {
          protocolFailure("P4 agent snapshot length is outside the Studio safety limit");
          return;
        }
      }
      if (expectedLength !== null && received.byteLength >= expectedLength + 4) {
        try {
          const snapshot = decodeAgentInspectionResponse(
            received.subarray(4, expectedLength + 4),
            correlationId,
          );
          finish({
            probe: {
              reachability: "reachable",
              latencyMs: connectedAt,
              probeError: null,
            },
            observation: availableObservation(snapshot),
          });
        } catch (error) {
          protocolFailure(error instanceof Error ? error.message : "P4 inspection failed");
        }
      }
    });
    socket.once("timeout", () => {
      if (connectedAt === null) {
        finish(unreachable("connection timed out"));
      } else {
        protocolFailure("P4 inspection timed out");
      }
    });
    socket.once("error", (error) => {
      if (connectedAt === null) finish(unreachable(error.message));
      else protocolFailure(error.message);
    });
    socket.once("end", () => {
      if (!settled) protocolFailure("P4 agent closed before returning a snapshot");
    });
  });
