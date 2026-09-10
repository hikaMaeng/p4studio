import { createLanguageModel } from "./language.js";

const languageModel = createLanguageModel("en");

export const getLanguageModel = () => languageModel;
