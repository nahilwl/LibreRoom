import { useState } from "react";
import { t } from "../i18n";
import type { BatchItem, BatchStatus } from "../lib/batch";
import { saveBlob } from "../lib/files";
import { Icon } from "./Icon";

const STATUS_STYLE: Record<BatchStatus, string> = {
  queued: "bg-raised text-muted",
  processing: "bg-accent/15 text-accent",
  done: "bg-accent text-accent-ink",
  error: "bg-danger/15 text-danger",
  cancelled: "bg-raised text-muted line-through",
};

interface Props {
  items: BatchItem[];
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
}

const kb = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);

/** Main area in batch mode: the queue, with a drop zone. */
export function BatchView({ items, onAdd, onRemove }: Props) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex flex-1 flex-col gap-4 overflow-y-auto p-6 ${over ? "bg-accent/8" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onAdd(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-panel/60 p-5">
        <Icon name="batch" className="size-8 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("batch.drop")}</p>
          <p className="text-xs text-muted">{t("batch.originals")}</p>
        </div>
        <label className="btn btn-primary cursor-pointer">
          {t("batch.add")}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) onAdd(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted">{t("batch.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label={t("batch.list")}>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                {item.file.name}
                <span className="ml-2 text-xs text-muted">{kb(item.file.size)}</span>
              </span>
              {item.error && (
                <span className="max-w-60 truncate text-xs text-danger" title={item.error}>
                  {item.error}
                </span>
              )}
              {item.ms !== undefined && <span className="text-xs text-muted tabular-nums">{(item.ms / 1000).toFixed(1)} s</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{t(`batch.status.${item.status}`)}</span>
              {item.result ? (
                <button className="btn px-2 py-1 text-xs" onClick={() => saveBlob(item.result!.blob, item.result!.name)} title={item.result.name}>
                  <Icon name="download" className="size-3.5" />
                  {t("batch.download")}
                </button>
              ) : (
                item.status !== "processing" && (
                  <button className="rounded-md p-1 text-muted hover:bg-raised hover:text-ink" onClick={() => onRemove(item.id)} aria-label={t("batch.remove")} title={t("batch.remove")}>
                    <Icon name="close" className="size-4" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
