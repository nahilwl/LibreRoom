import { LANGUAGES, t, type Language } from "../i18n";
import { Icon } from "./Icon";

interface Props {
  name: string | null;
  onRename: (name: string) => void;
  dirty: boolean;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: () => void;
  onSave: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  lang: Language;
  onLanguage: (l: Language) => void;
  onShortcuts: () => void;
}

const iconButton = "rounded-lg p-2 text-muted transition hover:bg-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent";

export function Header(p: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:px-4">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-8" />
      <div className="mr-2 hidden leading-tight md:block">
        <div className="font-semibold tracking-tight">LibreRoom</div>
        <div className="text-[11px] text-muted">{t("app.tagline")}</div>
      </div>
      {p.name !== null && (
        <input
          className="w-40 min-w-0 rounded-md bg-transparent px-2 py-1 text-sm text-muted hover:bg-raised focus:bg-raised focus:text-ink focus:outline-none sm:w-56"
          value={p.name}
          aria-label={t("header.projectName")}
          onChange={(e) => p.onRename(e.target.value.replace(/[\\/:*?"<>|]/g, ""))}
        />
      )}
      <div className="ml-1 flex items-center">
        <button className={iconButton} onClick={p.onUndo} disabled={!p.canUndo || p.busy} aria-label={t("header.undo")} title={t("header.undo")}>
          <Icon name="undo" className="size-4" />
        </button>
        <button className={iconButton} onClick={p.onRedo} disabled={!p.canRedo || p.busy} aria-label={t("header.redo")} title={t("header.redo")}>
          <Icon name="redo" className="size-4" />
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button className="btn" onClick={p.onOpen} title={t("header.openTitle")}>
          <Icon name="folder" className="size-4" />
          <span className="hidden sm:inline">{t("header.open")}</span>
        </button>
        <button className="btn" onClick={p.onSave} disabled={p.name === null || p.busy} title={t("header.saveTitle")}>
          <Icon name="save" className="size-4" />
          <span className="hidden sm:inline">{t("header.save")}</span>
          {p.dirty && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </button>
        <select
          className="select-chevron appearance-none rounded-lg border border-line bg-raised py-2 pr-7 pl-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
          value={p.lang}
          onChange={(e) => p.onLanguage(e.target.value as Language)}
          aria-label={t("header.language")}
        >
          {Object.entries(LANGUAGES).map(([code, l]) => (
            <option key={code} value={code}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="btn px-2.5" onClick={p.onShortcuts} aria-label={t("shortcuts.open")} title={t("shortcuts.open")}>
          <Icon name="keyboard" className="size-4" />
        </button>
        <button className="btn px-2.5" onClick={p.onToggleTheme} aria-label={p.dark ? t("header.lightMode") : t("header.darkMode")} title={p.dark ? t("header.lightMode") : t("header.darkMode")}>
          <Icon name={p.dark ? "sun" : "moon"} className="size-4" />
        </button>
      </div>
    </header>
  );
}
