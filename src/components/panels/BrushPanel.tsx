import { t } from "../../i18n";
import type { BrushSettings } from "../Workspace";

interface Props {
  brush: BrushSettings;
  setBrush: (b: BrushSettings) => void;
  canResetToAi: boolean;
  onResetToAi: () => void;
}

export function BrushPanel({ brush, setBrush, canResetToAi, onResetToAi }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{t("brush.help")}</p>
      <div>
        <span className="label">{t("brush.mode")}</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("brush.modeGroup")}>
          {(
            [
              ["erase", t("brush.erase")],
              ["restore", t("brush.restore")],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              role="radio"
              aria-checked={brush.mode === mode}
              className={`btn ${brush.mode === mode ? "btn-primary" : ""}`}
              onClick={() => setBrush({ ...brush, mode })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label>
        <span className="label">{t("brush.size", { size: brush.size })}</span>
        <input
          type="range"
          min={4}
          max={300}
          value={brush.size}
          onChange={(e) => setBrush({ ...brush, size: +e.target.value })}
          className="w-full accent-(--accent)"
        />
      </label>
      {canResetToAi && (
        <button className="btn" onClick={onResetToAi}>
          {t("brush.reset")}
        </button>
      )}
    </div>
  );
}
