import { z } from "zod";

export const agentInput = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535),
});

export const nodeInput = z.object({
  name: z.string().trim().min(1).max(80),
  adapter: z.string().trim().min(1).max(80),
});

export const modelInput = z.object({
  name: z.string().trim().min(1).max(120),
  artifact: z.string().trim().min(1).max(2_048),
  architecture: z.string().trim().min(1).max(120),
  adapter: z.string().trim().min(1).max(80),
  contextLength: z.number().int().positive().nullable(),
  notes: z.string().max(4_000).default(""),
});

const stageInput = z.object({
  nodeId: z.string().uuid(),
  stageIndex: z.number().int().min(0),
  layerStart: z.number().int().min(0),
  layerEnd: z.number().int().positive(),
  launchArgs: z.string().default("{}"),
}).refine((value) => value.layerEnd > value.layerStart, { message: "layerEnd must be greater than layerStart" });

export const pipelineInput = z.object({
  name: z.string().trim().min(1).max(120),
  modelId: z.string().uuid(),
  stages: z.array(stageInput).min(1).refine((stages) => new Set(stages.map((stage) => stage.stageIndex)).size === stages.length, { message: "stageIndex must be unique" }),
});
