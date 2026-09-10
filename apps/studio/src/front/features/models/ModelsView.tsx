import { Box, Paper, Typography } from "@mui/material";
import type { ModelRecord } from "../../../common/domain.js";
import { formatMessage, formatNumber } from "../../i18n/format.js";
import { useTranslation } from "../../i18n/useTranslation.js";
import { EmptyState } from "../../shared/components/EmptyState.js";
import { Icon } from "../../shared/components/Icon.js";
import { RSC } from "./resource.js";

export const ModelsView = ({ models, onRegister }: { models: ModelRecord[]; onRegister: () => void }) => {
  const { language, t } = useTranslation();
  if (models.length === 0) return <EmptyState title={t[RSC.MODELS_EMPTY_TITLE_TEXT]} detail={t[RSC.MODELS_EMPTY_DETAIL_MESSAGE]} action={t[RSC.MODELS_REGISTER_BUTTON]} onAction={onRegister} />;
  return <Box component="section" aria-label={t[RSC.MODELS_LIST_LABEL]} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)", xxl: "repeat(3, 1fr)" }, gap: 1.5 }}>{models.map((model) => <Paper component="article" variant="outlined" key={model.id} sx={{ p: 2.5, bgcolor: "background.paper" }}><Box sx={{ display: "flex", gap: 1.5 }}><Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: "action.hover", display: "grid", placeItems: "center" }}><Icon name="memory" fontSize="small" /></Box><Box sx={{ minWidth: 0 }}><Typography component="h2" sx={{ fontWeight: 620 }}>{model.name}</Typography><Typography variant="body2" color="text.secondary">{model.architecture} · {model.adapter}</Typography></Box></Box><Box sx={{ mt: 3, pt: 2, borderTop: "1px solid", borderColor: "divider" }}><Typography variant="caption" color="text.secondary">{t[RSC.MODELS_ARTIFACT_TEXT]}</Typography><Typography component="code" variant="body2" title={model.artifact} sx={{ mt: .5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.primary" }}>{model.artifact}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>{t[RSC.MODELS_CONTEXT_TEXT]}</Typography><Typography variant="body2">{model.contextLength == null ? t[RSC.MODELS_UNSPECIFIED_TEXT] : formatMessage(t[RSC.MODELS_CONTEXT_VALUE_TEXT], { count: formatNumber(model.contextLength, language) })}</Typography>{model.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{model.notes}</Typography>}</Box></Paper>)}</Box>;
};
