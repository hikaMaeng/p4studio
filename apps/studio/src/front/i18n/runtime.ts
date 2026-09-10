import { directionForLanguage, getLanguageModel, isLanguageCode, type LanguageCode } from "@p4studio/studio_domain/front";
import { catalogs } from "./catalog.js";

const storageKey = "p4studio.language";
const model = getLanguageModel();

const resolveInitialLanguage = (): LanguageCode => {
  const stored = window.localStorage.getItem(storageKey);
  if (stored && isLanguageCode(stored)) return stored;
  const browserLanguage = window.navigator.language.toLowerCase().split("-")[0] ?? "en";
  return isLanguageCode(browserLanguage) ? browserLanguage : "en";
};

const applyDocumentLanguage = (language: LanguageCode) => {
  document.documentElement.lang = language;
  document.documentElement.dir = directionForLanguage(language);
  document.title = catalogs[language]["shell.brand.title.text"];
};

model.set(resolveInitialLanguage());
applyDocumentLanguage(model.value);

export const setLanguage = (language: LanguageCode) => {
  window.localStorage.setItem(storageKey, language);
  applyDocumentLanguage(language);
  model.set(language);
};
