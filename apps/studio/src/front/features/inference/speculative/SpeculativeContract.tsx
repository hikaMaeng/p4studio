import { Typography } from "@mui/material";
import { checkLoadStageContracts, parseSpeculativeContract } from "@p4studio/studio_domain/common";
import type { DeploymentRecord } from "@p4studio/studio_domain/common";
import { useTranslation } from "../../../i18n/useTranslation.js";
import { formatMessage } from "../../../i18n/format.js";
import { RSC } from "./resource.js";

const modeKey = {
  cc: RSC.INFERENCE_SPECULATIVE_CONTRACT_MODE_CC,
  deferred: RSC.INFERENCE_SPECULATIVE_CONTRACT_MODE_DEFERRED,
  checkpoint: RSC.INFERENCE_SPECULATIVE_CONTRACT_MODE_CHECKPOINT,
  none: RSC.INFERENCE_SPECULATIVE_CONTRACT_MODE_NONE,
} as const;

/** The LOAD-reported speculative contract the run executes against, resolved
 * in the domain from the deployment record. Anything unreported, stale or
 * disagreed stays unconfirmed instead of derived. */
export const contractForRun = (model: DeploymentRecord | undefined, loadGeneration: number | undefined): string | null => {
  if (!model) return null;
  try {
    return checkLoadStageContracts({ stages: model.stages, reports: model.reports, loadGeneration: loadGeneration ?? model.loadGeneration });
  } catch { return null; }
};

export function SpeculativeContract({ contract }: { contract: string | null }) {
  const { t } = useTranslation();
  const parsed = parseSpeculativeContract(contract);
  return <Typography data-testid="inference-speculative-contract" sx={{ fontSize: ".7rem", lineHeight: 1.25 }} color="text.secondary">
    {t[RSC.INFERENCE_SPECULATIVE_CONTRACT_LABEL]} {contract === null || parsed === null
      ? (contract ?? t[RSC.INFERENCE_SPECULATIVE_CONTRACT_UNAVAILABLE_MESSAGE])
      : formatMessage(t[RSC.INFERENCE_SPECULATIVE_CONTRACT_MESSAGE], { mode: t[modeKey[parsed.mode]], contract })}
  </Typography>;
}
