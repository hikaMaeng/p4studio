import hy3 from "./presets/hy3.js";
import step from "./presets/step.js";
import qwenNone from "./presets/qwen-none.js";
import qwenMtp from "./presets/qwen-mtp.js";
import mimo from "./presets/mimo.js";

export interface DeploymentPreset {
  insightNotes?: string;
  id: string; name: string; adapter: string; ingressAddress: string; totalLayers: number; timeoutMs: number;
  source: { directory: string; configSha256: string; artifactSha256: string; build: unknown;
    artifactFile?: string; measurements?: unknown; evidenceFiles?: { file: string; sha256: string }[];
    pipelineCompatibility: string | null; passed: boolean; requests: number; completed: number; released: number;
    error: unknown; evidenceMissing: unknown; cleanupError: unknown };
  stages: { referenceAgent: string; referenceNode: string; artifact: string; layerStart: number; layerEnd: number;
    device: string; planText: string; loadOptionsJson: string }[];
}
export const deploymentPresets: readonly DeploymentPreset[] = [hy3, step, qwenNone, qwenMtp, mimo];
