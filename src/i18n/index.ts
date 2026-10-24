import { en, type Messages } from "./en";
import { fr } from "./fr";

export type Language = "en" | "fr";
export const LANGUAGES: Record<Language, { name: string; messages: Messages }> = {
  en: { name: "English", messages: en },
  fr: { name: "Français", messages: fr },
};

export type MessageKey = keyof Messages;

let current: Language = detectLanguage();

export function detectLanguage(preferred?: string | null): Language {
  if (preferred && preferred in LANGUAGES) return preferred as Language;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const getLanguage = () => current;
export function setLanguage(lang: Language) {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** Translates `key`, replacing `{name}` placeholders with `params.name`. Falls back to English. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = LANGUAGES[current].messages[key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

/** Error whose message is translated when shown, so workers and libraries stay language-agnostic. */
export class AppError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params: Record<string, string | number> = {},
  ) {
    super(t(key, params));
  }
}
