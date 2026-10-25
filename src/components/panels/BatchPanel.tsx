import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { extensionOf, type BatchItem, type BatchOptions } from "../../lib/batch";
import { saveBlob } from "../../lib/files";
import { getModel } from "../../lib/models";
import { isDownloaded } from "../../lib/modelStore";
import type { ExportFormat } from "../../lib/render";
import { createZip } from "../../lib/zip";
import { Progress } from "../Progress";

const SIZES = [null, 4000, 2000, 1080] as const;

interface Props {
  items: BatchItem[];
  running: boolean;
  cancelling: boolean;
  modelId: string;
  onStart: (o: BatchOptions) => void;
  onCancel: () => void;
  onClear: () => void;
  onOpenModel: () => void;
}

export function BatchPanel({ items, running, cancelling, modelId, onStart, onCancel, onClear, onOpenModel }: Props) {
  const [removeBackground, setRemoveBackground] = useState(true);
  const [background, setBackground] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(90);
  const [maxSide, setMaxSide] = useState<number | null>(null);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    isDownloaded(getModel(modelId)).then(setModelReady, () => setModelReady(false));
  }, [modelId]);

  const done = items.filter((i) => i.status === "done");
  const pending = items.filter((i) => i.status !== "done");
  const finished = items.filter((i) => i.status === "done" || i.status === "error" || i.status === "cancelled").length;
  const blocked = removeBackground && modelReady === false;

  const downloadAll = async () => {
    setZipping(true);
    try {
      const entries = await Promise.all(done.map(async (i) => ({ name: i.result!.name, data: new Uint8Array(await i.result!.blob.arrayBuffer()) })));
      saveBlob(createZip(entries), "libreroom-batch.zip");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-center justify-between text-sm font-medium">
        {t("batch.removeBg")}
        <input type="checkbox" className="size-4 accent-(--accent)" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} disabled={running} />
      </label>
      {blocked && (
        <div className="rounded-lg bg-raised p-3 text-sm">
          <p className="mb-2 text-muted">{t("batch.needModel")}</p>
          <button className="btn w-full" onClick={onOpenModel}>
            {t("batch.goModel")}
          </button>
        </div>
      )}

      <div>
        <span className="label">{t("batch.background")}</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("batch.background")}>
          <button role="radio" aria-checked={background === null} className={`btn ${background === null ? "btn-primary" : ""}`} onClick={() => setBackground(null)} disabled={running}>
            {t("batch.transparent")}
          </button>
          <label className={`btn cursor-pointer ${background !== null ? "btn-primary" : ""}`}>
            <input type="color" value={background ?? "#ffffff"} onChange={(e) => setBackground(e.target.value)} onClick={() => setBackground(background ?? "#ffffff")} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={t("batch.color")} disabled={running} />
            {t("batch.color")}
          </label>
        </div>
      </div>

      <div>
        <span className="label">{t("export.format")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("export.formatGroup")}>
          {(["png", "jpeg", "webp"] as const).map((f) => (
            <button key={f} role="radio" aria-checked={format === f} className={`btn uppercase ${format === f ? "btn-primary" : ""}`} onClick={() => setFormat(f)} disabled={running}>
              {extensionOf(f)}
            </button>
          ))}
        </div>
        {format === "jpeg" && background === null && <p className="mt-2 text-xs text-muted">{t("export.jpegNoAlpha")}</p>}
      </div>
      {format !== "png" && (
        <label>
          <span className="label">{t("export.quality", { q: quality })}</span>
          <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(+e.target.value)} className="w-full accent-(--accent)" disabled={running} />
        </label>
      )}
      <label>
        <span className="label">{t("batch.maxSide")}</span>
        <select className="field select-chevron appearance-none" value={maxSide ?? ""} onChange={(e) => setMaxSide(e.target.value ? +e.target.value : null)} disabled={running}>
          {SIZES.map((s) => (
            <option key={s ?? "original"} value={s ?? ""}>
              {s ? t("batch.px", { v: s }) : t("batch.original")}
            </option>
          ))}
        </select>
      </label>

      {running ? (
        <div className="flex flex-col gap-2">
          <Progress value={items.length ? finished / items.length : 0} label={t("batch.progress", { done: finished, total: items.length })} />
          <button className="btn w-full" onClick={onCancel} disabled={cancelling}>
            {cancelling ? t("batch.cancelling") : t("batch.cancel")}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-primary w-full"
          disabled={!pending.length || blocked}
          onClick={() => onStart({ removeBackground, modelId, background, format, quality: quality / 100, maxSide })}
        >
          {pending.length === 1 ? t("batch.startOne") : t("batch.start", { n: pending.length })}
        </button>
      )}
      {items.length > 0 && !running && (
        <p className="text-xs text-muted">
          {t("batch.summary", {
            done: done.length,
            errors: items.filter((i) => i.status === "error").length,
            cancelled: items.filter((i) => i.status === "cancelled").length,
          })}
        </p>
      )}
      <button className="btn w-full" disabled={!done.length || zipping} onClick={downloadAll}>
        {t("batch.downloadAll")}
      </button>
      <button className="text-left text-xs text-muted underline disabled:opacity-40" onClick={onClear} disabled={!items.length || running}>
        {t("batch.clear")}
      </button>
      <p className="text-xs text-muted">{t("batch.oneModel")}</p>
    </div>
  );
}
