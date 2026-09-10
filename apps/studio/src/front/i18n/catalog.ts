import ar from "../../../assets/i18n/ar.json";
import en from "../../../assets/i18n/en.json";
import es from "../../../assets/i18n/es.json";
import fr from "../../../assets/i18n/fr.json";
import hi from "../../../assets/i18n/hi.json";
import ko from "../../../assets/i18n/ko.json";
import pt from "../../../assets/i18n/pt.json";
import zh from "../../../assets/i18n/zh.json";
import type { LanguageCode } from "@p4studio/studio_domain/front";

export type TranslationCatalog = typeof en;

export const catalogs: Record<LanguageCode, TranslationCatalog> = { ar, en, es, fr, hi, ko, pt, zh };
