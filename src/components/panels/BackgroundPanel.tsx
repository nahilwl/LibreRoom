import { t } from "../../i18n";
import type { BackgroundState } from "../../lib/compose";

const SWATCHES = ["#ffffff", "#000000", "#f1ede6", "#e8eef5", "#dff1ea", "#fde8e4", "#fff4cc", "#2f3a4a"];

interface Props {
  background: BackgroundState;
  hasMask: boolean;
  setColor: (c: string | null) => void;
  onPickImage: (file: File) => void;
}

export function BackgroundPanel({ background, hasMask, setColor, onPickImage }: Props) {
  const color = background.type === "color" ? background.color : "#ffffff";
  return (
    <div className="flex flex-col gap-5">
      {!hasMask && (
        <p className="rounded-lg bg-raised p-3 text-sm text-muted">{t("background.hint")}</p>
      )}
      <div>
        <span className="label">{t("background.solid")}</span>
        <div className="grid grid-cols-5 gap-2">
          <button
            className={`aspect-square rounded-lg border-2 bg-[conic-gradient(var(--checker)_25%,var(--panel)_0_50%,var(--checker)_0_75%,var(--panel)_0)] bg-[length:12px_12px] ${background.type === "transparent" ? "border-accent" : "border-line"}`}
            onClick={() => setColor(null)}
            aria-label={t("background.transparent")}
            title={t("background.transparent")}
          />
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={`aspect-square rounded-lg border-2 ${background.type === "color" && background.color === c ? "border-accent" : "border-line"}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={t("background.color", { color: c })}
              title={c}
            />
          ))}
          <label className="relative aspect-square cursor-pointer rounded-lg border-2 border-line" title={t("background.custom")}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={t("background.custom")} />
            <span className="flex size-full items-center justify-center rounded-md bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
          </label>
        </div>
      </div>
      <label className="btn w-full cursor-pointer">
        {t("background.image")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
