import { useTranslation } from "../../i18n/useTranslation.js";
import { RSC } from "./resource.js";
import { SESSION_CONTRACT_ERRORS } from "@p4studio/studio_domain/common";

const sessionErrorResources = {
  [SESSION_CONTRACT_ERRORS.stages]: RSC.INFERENCE_SESSION_STAGES_ALERT,
  [SESSION_CONTRACT_ERRORS.reports]: RSC.INFERENCE_SESSION_REPORTS_ALERT,
  [SESSION_CONTRACT_ERRORS.generation]: RSC.INFERENCE_SESSION_GENERATION_ALERT,
  [SESSION_CONTRACT_ERRORS.invalid]: RSC.INFERENCE_SESSION_INVALID_ALERT,
  [SESSION_CONTRACT_ERRORS.partial]: RSC.INFERENCE_SESSION_PARTIAL_ALERT,
  [SESSION_CONTRACT_ERRORS.mismatch]: RSC.INFERENCE_SESSION_MISMATCH_ALERT,
};

export function InferenceError({ detail }: { detail: string }) {
  const { t } = useTranslation();
  if (Object.hasOwn(sessionErrorResources, detail)) return <>{t[sessionErrorResources[detail as keyof typeof sessionErrorResources]]}</>;
  const explanation = detail.includes("LLAMA_PIPELINE_AGREEMENT_FAILED [submission]") ? t[RSC.INFERENCE_AGREEMENT_FAILED_MESSAGE]
    : detail.includes("LLAMA_PIPELINE_AGREEMENT_FAILED [owner]") ? t[RSC.INFERENCE_AGREEMENT_OWNER_MESSAGE] : "";
  return <>{explanation && <>{explanation} · </>}{detail}</>;
}
