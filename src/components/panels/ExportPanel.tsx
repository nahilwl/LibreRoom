import { useEffect, useState } from "react";
import { t } from "../../i18n";
import type { BackgroundState } from "../../lib/compose";
import type { ExportFormat } from "../../lib/render";

interface Props {
  width: number;
  height: number;
  background: BackgroundState;
  busy: boolean;
  onExport: (format: ExportFormat, width: number, quality: number) => void;
}

export function ExportPanel({ width, height, background, busy, onExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [outW, setOutW] = useState(width);
  const [quality, setQuality] = useState(92);
  useEffect(() => setOutW(width), [width]);
  const outH = Math.max(1, Math.round((height * outW) / width));
  const validW = Number.isInteger(outW) && outW >= 1 && outW <= 16_384;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="label">{t("export.format")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("export.formatGroup")}>
          {(["png", "jpeg", "webp"] as const).map((f) => (
            <button key={f} role="radio" aria-checked={format === f} className={`btn uppercase ${format === f ? "btn-primary" : ""}`} onClick={() => setFormat(f)}>
              {f === "jpeg" ? "jpg" : f}
            </button>
          ))}
        </div>
        {format === "jpeg" && background.type === "transparent" && (
          <p className="mt-2 text-xs text-muted">{t("export.jpegNoAlpha")}</p>
        )}
      </div>
      <label>
        <span className="label">{t("export.width")}</span>
        <input type="number" min={1} max={16384} value={outW} onChange={(e) => setOutW(Math.round(+e.target.value))} className="field" />
        <span className="mt-1 block text-xs text-muted">
          {t("export.size", { w: outW, h: outH, ow: width, oh: height })}
        </span>
      </label>
      {format !== "png" && (
        <label>
          <span className="label">{t("export.quality", { q: quality })}</span>
          <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(+e.target.value)} className="w-full accent-(--accent)" />
        </label>
      )}
      <button className="btn btn-primary w-full" disabled={busy || !validW} onClick={() => onExport(format, outW, quality / 100)}>
        {t("export.run")}
      </button>
      <p className="text-xs text-muted">{t("export.free")}</p>
    </div>
  );
}
