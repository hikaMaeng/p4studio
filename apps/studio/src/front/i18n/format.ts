import type { LanguageCode } from "@p4studio/studio_domain/front";

export const formatMessage = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{([^}]+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

export const formatNumber = (value: number, language: LanguageCode, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(language, options).format(value);

export const formatDateTime = (value: string | number, language: LanguageCode): string =>
  new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));

export const formatBytes = (bytes: number | null, language: LanguageCode, unavailable: string, unitTemplate = "{value} GiB"): string =>
  bytes == null ? unavailable : formatMessage(unitTemplate, { value: formatNumber(bytes / (1024 ** 3), language, { maximumFractionDigits: 1 }) });
