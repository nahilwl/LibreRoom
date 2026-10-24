import { t } from "../../i18n";
import { selectedLayer, type Doc, type Layer } from "../../lib/document";
import { Icon } from "../Icon";

interface Props {
  doc: Doc;
  onSelect: (id: string) => void;
  onAddImage: (file: File) => void;
  onAddText: () => void;
  /** `coalesce` groups rapid changes (e.g. dragging a slider) into one undo step. */
  onUpdate: (id: string, patch: Partial<Layer>, coalesce?: string) => void;
  onMove: (id: string, delta: 1 | -1) => void;
  onRemove: (id: string) => void;
}

const iconButton = "rounded-md p-1 text-muted hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

export const layerLabel = (l: Layer) => (l.kind === "text" ? l.text.split("\n")[0].slice(0, 40) || t("text.layerName") : l.name);

export function LayersPanel({ doc, onSelect, onAddImage, onAddText, onUpdate, onMove, onRemove }: Props) {
  const sel = selectedLayer(doc);
  const top = doc.layers.length - 1;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <label className="btn cursor-pointer">
          <Icon name="image" className="size-4" />
          {t("layers.addImage")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAddImage(f);
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn" onClick={onAddText}>
          <Icon name="text" className="size-4" />
          {t("layers.addText")}
        </button>
      </div>

      <ul className="flex flex-col gap-1" aria-label={t("layers.list")}>
        {doc.layers.length === 0 && <li className="text-sm text-muted">{t("layers.empty")}</li>}
        {[...doc.layers].reverse().map((l) => {
          const index = doc.layers.indexOf(l);
          const active = l.id === doc.selectedId;
          return (
            <li key={l.id} className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${active ? "border-accent bg-accent/8" : "border-transparent hover:bg-raised"}`}>
              <button className={iconButton} onClick={() => onUpdate(l.id, { visible: !l.visible })} aria-label={l.visible ? t("layers.hide") : t("layers.show")} title={l.visible ? t("layers.hide") : t("layers.show")}>
                <Icon name={l.visible ? "eye" : "eyeOff"} className="size-4" />
              </button>
              <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm" onClick={() => onSelect(l.id)} aria-current={active}>
                <Icon name={l.kind === "text" ? "text" : "image"} className="size-4 shrink-0 text-muted" />
                <span className={`truncate ${l.visible ? "" : "text-muted line-through"}`}>{layerLabel(l)}</span>
              </button>
              <button className={iconButton} onClick={() => onMove(l.id, 1)} disabled={index === top} aria-label={t("layers.up")} title={t("layers.up")}>
                <Icon name="up" className="size-4" />
              </button>
              <button className={iconButton} onClick={() => onMove(l.id, -1)} disabled={index === 0} aria-label={t("layers.down")} title={t("layers.down")}>
                <Icon name="down" className="size-4" />
              </button>
              <button className={iconButton} onClick={() => onRemove(l.id)} aria-label={t("layers.delete")} title={t("layers.delete")}>
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {sel && (
        <section className="flex flex-col gap-4 rounded-xl bg-raised p-3">
          <h3 className="label mb-0">{t("layers.properties")}</h3>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("layers.opacity", { v: Math.round(sel.opacity * 100) })}</span>
            <input type="range" min={0} max={100} value={Math.round(sel.opacity * 100)} onChange={(e) => onUpdate(sel.id, { opacity: +e.target.value / 100 }, `opacity-${sel.id}`)} className="w-full accent-(--accent)" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("layers.scale", { v: Math.round(sel.scale * 100) })}</span>
            <input type="range" min={5} max={400} value={Math.round(sel.scale * 100)} onChange={(e) => onUpdate(sel.id, { scale: +e.target.value / 100 }, `scale-${sel.id}`)} className="w-full accent-(--accent)" />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">{t("layers.rotation", { v: Math.round(sel.rotation) })}</span>
            <input type="range" min={-180} max={180} value={Math.round(sel.rotation)} onChange={(e) => onUpdate(sel.id, { rotation: +e.target.value }, `rotation-${sel.id}`)} className="w-full accent-(--accent)" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn px-2 text-xs" onClick={() => onUpdate(sel.id, { x: doc.width / 2, y: doc.height / 2 })}>
              {t("layers.center")}
            </button>
            <button className="btn px-2 text-xs" onClick={() => onUpdate(sel.id, { scale: 1, rotation: 0 })}>
              {t("layers.reset")}
            </button>
          </div>
        </section>
      )}
      <p className="text-xs text-muted">{t("layers.hint")}</p>
    </div>
  );
}
