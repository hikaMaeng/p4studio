// P4 authority: layers/protocol/src/event/mod.rs DELIVERY_FAILURE_CONTENT_TYPE and
// entrypoints/agent/src/event_runtime/transport/retry.rs delivery_failure_event.
export const P4_DELIVERY_FAILURE_CONTENT_TYPE = "application/vnd.p4.transport.delivery-failure-v1+json";

/**
 * A sending agent's notice that one original ran out of its send budget.
 * `not_started`: no byte of the original was written toward its peer.
 * `unknown`: a write began and the peer may have received it.
 * It is a transport diagnostic, never a request terminal or a settlement.
 */
export type P4DeliveryFailure = { eventId: string; result: "not_started" | "unknown" };

export function parseP4DeliveryFailure(payload: Uint8Array): P4DeliveryFailure {
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("P4 delivery failure notice must be an object");
  const { event_id: eventId, result } = value as Record<string, unknown>;
  if (typeof eventId !== "string" || !eventId) throw new Error("P4 delivery failure notice requires event_id");
  if (result !== "not_started" && result !== "unknown") throw new Error("P4 delivery failure notice result is unsupported");
  return { eventId, result };
}
