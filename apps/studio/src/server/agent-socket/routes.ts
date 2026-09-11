// See apps/studio/docs/usage.md#agent-network: dial routing preserves P4 endpoints.
const routes = new Map<string, { host: string; port: number }>();
export function setAgentRoutes(values: { agentHost: string; agentPort: number; localPort: number }[]) {
  routes.clear();
  for (const value of values) routes.set(JSON.stringify([value.agentHost, value.agentPort]), { host: "127.0.0.1", port: value.localPort });
}
export function agentDialAddress(host: string, port: number) { return routes.get(JSON.stringify([host, port])) ?? { host, port }; }
