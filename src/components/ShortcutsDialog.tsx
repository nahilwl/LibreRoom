import { useEffect, useRef } from "react";
import { t, type MessageKey } from "../i18n";

const SHORTCUTS: [string, MessageKey][] = [
  ["Ctrl+Z / Ctrl+Shift+Z", "shortcuts.undoRedo"],
  ["Ctrl+O / Ctrl+S", "shortcuts.openSave"],
  ["Ctrl+A", "shortcuts.selectAll"],
  ["Esc", "shortcuts.deselect"],
  ["Shift / Ctrl + click", "shortcuts.multi"],
  ["Ctrl+D", "shortcuts.duplicate"],
  ["Delete", "shortcuts.delete"],
  ["← ↑ → ↓", "shortcuts.nudge"],
  ["Ctrl+] / Ctrl+[", "shortcuts.order"],
  ["Alt + drag", "shortcuts.noSnap"],
  ["Shift + rotate", "shortcuts.rotateSnap"],
  ["+ / − / 0", "shortcuts.zoom"],
  ["Space + drag", "shortcuts.pan"],
  ["X / [ ]", "shortcuts.brush"],
];

/** Modal list of shortcuts, opened with "?". Uses the native <dialog> for focus trapping and Esc. */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,92vw)] rounded-2xl border border-line bg-panel p-0 text-ink shadow-xl backdrop:bg-black/40"
      aria-labelledby="shortcuts-title"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="shortcuts-title" className="font-semibold">
          {t("shortcuts.title")}
        </h2>
        <button className="btn px-3 py-1 text-xs" onClick={onClose} autoFocus>
          {t("shortcuts.close")}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="contents">
            <dt>
              <kbd className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-xs whitespace-nowrap">{keys}</kbd>
            </dt>
            <dd className="text-muted">{t(label)}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
