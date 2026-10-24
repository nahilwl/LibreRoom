import { useEffect, useRef, useState } from "react";
import { AppError, t } from "../../i18n";
import { MODELS, getModel, modelDescription, modelLabel } from "../../lib/models";
import { downloadModel, isDownloaded, removeModel } from "../../lib/modelStore";
import { isDesktop } from "../../lib/platform";
import { Progress } from "../Progress";

const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
// GPU-only models need WebGPU, which only the browser engine uses (natively they would run on
// the CPU and need ~7.7 GB of RAM: measured, see docs/ai-models.md).
const hasWebGPU = !isDesktop && typeof navigator !== "undefined" && "gpu" in navigator;

interface Props {
  modelId: string;
  setModelId: (id: string) => void;
  canRun: boolean;
  busy: boolean;
  hasMask: boolean;
  onRemove: () => void;
  onShowOriginal: () => void;
}

export function RemovePanel({ modelId, setModelId, canRun, busy, hasMask, onRemove, onShowOriginal }: Props) {
  const model = getModel(modelId);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all(MODELS.map(async (m) => [m.id, await isDownloaded(m)] as const)).then((e) => setReady(Object.fromEntries(e)));
  }, []);

  const download = async () => {
    setError(null);
    abort.current = new AbortController();
    setProgress(0);
    try {
      await downloadModel(model, (l, t) => setProgress(l / t), abort.current.signal);
      setReady((r) => ({ ...r, [model.id]: true }));
    } catch (e) {
      setError((e as Error).name === "AbortError" ? new AppError("remove.cancelled").message : (e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const unavailable = model.gpuOnly && !hasWebGPU;

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="label">{t("remove.model")}</legend>
        <div className="flex flex-col gap-2">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${m.id === modelId ? "border-accent bg-accent/5" : "border-line"}`}
            >
              <input type="radio" name="model" className="mt-1 accent-(--accent)" checked={m.id === modelId} onChange={() => setModelId(m.id)} />
              <span>
                <span className="font-semibold">{modelLabel(m)}</span>
                <span className="block text-muted">{modelDescription(m)}</span>
                <span className="mt-1 block text-xs text-muted">
                  {mb(m.bytes)} · {t("remove.license", { license: m.license })} · {ready[m.id] ? t("remove.installed") : t("remove.notInstalled")}
                  {m.gpuOnly && !hasWebGPU && ` · ${t("remove.noWebgpu")}`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!ready[model.id] ? (
        <div className="rounded-xl border border-line bg-raised p-3 text-sm">
          <p className="mb-2">{t("remove.downloadIntro", { size: mb(model.bytes) })}</p>
          <p className="mb-3 text-xs break-all text-muted">
            {t("remove.source")}{" "}
            <a className="underline" href={model.source} target="_blank" rel="noreferrer noopener">
              {model.source}
            </a>
            <br />
            {t("remove.integrity", { hash: model.sha256.slice(0, 16) })}
          </p>
          {progress === null ? (
            <button className="btn btn-primary w-full" onClick={download} disabled={unavailable}>
              {t("remove.download")}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Progress value={progress} label={t("remove.downloading")} />
              <button className="btn" onClick={() => abort.current?.abort()}>
                {t("remove.cancel")}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary w-full" onClick={onRemove} disabled={!canRun || busy || unavailable}>
            {t("remove.run")}
          </button>
          {hasMask && (
            <button className="btn w-full" onClick={onShowOriginal} disabled={busy}>
              {t("remove.original")}
            </button>
          )}
          <button
            className="text-left text-xs text-muted underline"
            onClick={async () => {
              await removeModel(model);
              setReady((r) => ({ ...r, [model.id]: false }));
            }}
          >
            {t("remove.deleteModel")}
          </button>
        </div>
      )}
      {!canRun && <p className="text-sm text-muted">{t("app.importFirst")}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
