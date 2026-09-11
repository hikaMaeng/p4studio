import { z } from "zod";

/** Same-origin WebSocket endpoint; binary messages are opaque P4 TCP bytes. */
export const P4_TUNNEL_PATH = "/api/p4-tunnel";
const identifier = z.string().uuid();

export const p4TunnelOpenSchema = z.object({ type: z.literal("open"), connectionId: identifier, agentId: identifier });
export const p4TunnelCloseSchema = z.object({ type: z.literal("close"), connectionId: identifier });
export const p4TunnelClientControlSchema = z.discriminatedUnion("type", [p4TunnelOpenSchema, p4TunnelCloseSchema]);
export type P4TunnelClientControl = z.infer<typeof p4TunnelClientControlSchema>;

export const p4TunnelOpenedSchema = z.object({ type: z.literal("opened"), connectionId: identifier, agentId: identifier });
export const p4TunnelClosedSchema = z.object({ type: z.literal("closed"), connectionId: identifier, detail: z.string() });
export const p4TunnelErrorSchema = z.object({ type: z.literal("error"), connectionId: identifier.nullable(), detail: z.string() });
export const p4TunnelServerControlSchema = z.discriminatedUnion("type", [p4TunnelOpenedSchema, p4TunnelClosedSchema, p4TunnelErrorSchema]);
export type P4TunnelServerControl = z.infer<typeof p4TunnelServerControlSchema>;

export const parseP4TunnelClientControl = (value: unknown): P4TunnelClientControl => p4TunnelClientControlSchema.parse(value);
export const parseP4TunnelServerControl = (value: unknown): P4TunnelServerControl => p4TunnelServerControlSchema.parse(value);
