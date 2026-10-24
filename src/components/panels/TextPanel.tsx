import { t } from "../../i18n";
import type { FontFamily, TextLayer } from "../../lib/document";
import { Icon } from "../Icon";

const SWATCHES = ["#1b1f1d", "#ffffff", "#c0392b", "#0d8a76", "#2f6fdf", "#f2b705"];
const FONTS: FontFamily[] = ["sans", "serif", "mono"];
const ALIGNS = ["left", "center", "right"] as const;

interface Props {
  layer: TextLayer | null;
  onAdd: () => void;
  onUpdate: (patch: Partial<TextLayer>, coalesce?: string) => void;
}

export function TextPanel({ layer, onAdd, onUpdate }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <button className="btn btn-primary w-full" onClick={onAdd}>
        <Icon name="text" className="size-4" />
        {t("layers.addText")}
      </button>
      {!layer ? (
        <p className="text-sm text-muted">{t("text.hint")}</p>
      ) : (
        <>
          <label>
            <span className="label">{t("text.content")}</span>
            <textarea
              className="field min-h-20 resize-y"
              value={layer.text}
              onChange={(e) => onUpdate({ text: e.target.value }, `text-${layer.id}`)}
              maxLength={10_000}
            />
          </label>
          <label>
            <span className="label">{t("text.font")}</span>
            <select className="field select-chevron appearance-none" value={layer.font} onChange={(e) => onUpdate({ font: e.target.value as FontFamily })}>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {t(`text.font.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">{t("text.size", { v: layer.size })}</span>
            <input type="range" min={8} max={400} value={layer.size} onChange={(e) => onUpdate({ size: +e.target.value }, `size-${layer.id}`)} className="w-full accent-(--accent)" />
          </label>
          <div>
            <span className="label">{t("text.color")}</span>
            <div className="flex items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`size-8 rounded-lg border-2 ${layer.color === c ? "border-accent" : "border-line"}`}
                  style={{ background: c }}
                  onClick={() => onUpdate({ color: c })}
                  aria-label={t("background.color", { color: c })}
                  title={c}
                />
              ))}
              <input type="color" value={layer.color} onChange={(e) => onUpdate({ color: e.target.value }, `color-${layer.id}`)} className="size-8 cursor-pointer rounded-lg border-2 border-line bg-transparent" aria-label={t("background.custom")} />
            </div>
          </div>
          <div>
            <span className="label">{t("text.style")}</span>
            <div className="grid grid-cols-2 gap-2">
              <button className={`btn font-bold ${layer.bold ? "btn-primary" : ""}`} aria-pressed={layer.bold} onClick={() => onUpdate({ bold: !layer.bold })}>
                {t("text.bold")}
              </button>
              <button className={`btn italic ${layer.italic ? "btn-primary" : ""}`} aria-pressed={layer.italic} onClick={() => onUpdate({ italic: !layer.italic })}>
                {t("text.italic")}
              </button>
            </div>
          </div>
          <div>
            <span className="label">{t("text.align")}</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("text.align")}>
              {ALIGNS.map((a) => (
                <button key={a} role="radio" aria-checked={layer.align === a} className={`btn px-2 ${layer.align === a ? "btn-primary" : ""}`} onClick={() => onUpdate({ align: a })}>
                  {t(`text.align.${a}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
