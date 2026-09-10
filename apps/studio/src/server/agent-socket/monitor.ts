import type { StudioDatabase } from "../database/client.js";
import { inspectRegisteredAgent } from "./inspection/coordinator.js";
import type { AgentObservationStore } from "./inspection/store.js";
import type { AgentInspector } from "./inspection/types.js";

/** Refreshes every current registration without exceeding the configured fan-out. */
export const refreshAgentObservations = async (
  database: StudioDatabase,
  observations: AgentObservationStore,
  inspector: AgentInspector,
  timeoutMs: number,
  concurrency: number,
): Promise<void> => {
  const agents = database.agents();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < agents.length) {
      const agent = agents[nextIndex];
      nextIndex += 1;
      if (agent) {
        await inspectRegisteredAgent(
          database,
          observations,
          inspector,
          agent,
          timeoutMs,
        );
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, agents.length) },
      () => worker(),
    ),
  );
};

/** Periodically refreshes registered agents with bounded parallel P4 queries. */
export const startAgentMonitor = (
  database: StudioDatabase,
  observations: AgentObservationStore,
  inspector: AgentInspector,
  intervalMs: number,
  timeoutMs: number,
  concurrency: number,
) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await refreshAgentObservations(
        database,
        observations,
        inspector,
        timeoutMs,
        concurrency,
      );
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
