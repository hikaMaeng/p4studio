export const LANGUAGE_CODES = ["en", "ko", "zh", "es", "hi", "ar", "fr", "pt"] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const isLanguageCode = (value: string): value is LanguageCode =>
  LANGUAGE_CODES.includes(value as LanguageCode);

export const directionForLanguage = (language: LanguageCode): "ltr" | "rtl" =>
  language === "ar" ? "rtl" : "ltr";
