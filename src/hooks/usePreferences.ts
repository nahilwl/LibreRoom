import { useEffect, useState } from "react";
import { detectLanguage, setLanguage, type Language } from "../i18n";

/** localStorage can throw (private mode, blocked storage): preferences are then just not remembered. */
export const prefs = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* not remembered */
    }
  },
};

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    prefs.set("libreroom-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

export function useLanguage() {
  const [lang, setLang] = useState<Language>(() => {
    const l = detectLanguage(prefs.get("libreroom-lang"));
    setLanguage(l);
    return l;
  });
  const change = (l: Language) => {
    setLanguage(l);
    prefs.set("libreroom-lang", l);
    setLang(l);
  };
  return [lang, change] as const;
}
