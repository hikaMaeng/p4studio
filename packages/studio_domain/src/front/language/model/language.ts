import { SliceModel } from "../../model/SliceModel.js";
import type { LanguageCode } from "./types.js";

export type LanguageModel = SliceModel<LanguageCode>;

export const createLanguageModel = (initialLanguage: LanguageCode): LanguageModel =>
  new SliceModel(initialLanguage);
