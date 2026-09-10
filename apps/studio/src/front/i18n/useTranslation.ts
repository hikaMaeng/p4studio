import { getLanguageModel, type LanguageCode } from "@p4studio/studio_domain/front";
import { useModel } from "../model/useModel.js";
import { catalogs, type TranslationCatalog } from "./catalog.js";
import { setLanguage } from "./runtime.js";

export type Translation = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: TranslationCatalog;
};

export const useTranslation = (): Translation => {
  const language = useModel(getLanguageModel()).value;
  return { language, setLanguage, t: catalogs[language] };
};
