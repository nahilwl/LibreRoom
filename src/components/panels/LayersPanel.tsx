import { t, type MessageKey } from "../../i18n";
import { DEFAULT_SHADOW, selectedLayer, toggleSelected, type Alignment, type Doc, type Layer, type Shadow } from "../../lib/document";
import { Icon, type IconName } from "../Icon";

interface Props {
  doc: Doc;
  onSelect: (ids: string[]) => void;
  onAddImage: (files: File[]) => void;
  onAddText: () => void;
  /** Patch the given layers; `coalesce` groups rapid changes (sliders) into one undo step. */
  onUpdate: (ids: string[], patch: Partial<Layer>, coalesce?: string) => void;
  onMove: (id: string, delta: 1 | -1) => void;
  onRemove: (ids: string[]) => void;
  onDuplicate: () => void;
  onAlign: (how: Alignment) => void;
}

const iconButton = "rounded-md p-1 text-muted hover:bg-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
const ALIGNMENTS: [Alignment, IconName, MessageKey][] = [
  ["left", "alignLeft", "align.left"],
  ["center", "alignCenter", "align.center"],
  ["right", "alignRight", "align.right"],
  ["top", "alignTop", "align.top"],
  ["middle", "alignMiddle", "align.middle"],
  ["bottom", "alignBottom", "align.bottom"],
];

export const layerLabel = (l: Layer) => (l.kind === "text" ? l.text.split("\n")[0].slice(0, 40) || t("text.layerName") : l.name);

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-(--accent)" />
    </label>
  );
}

export function LayersPanel({ doc, onSelect, onAddImage, onAddText, onUpdate, onMove, onRemove, onDuplicate, onAlign }: Props) {
  const sel = selectedLayer(doc);
  const ids = doc.selectedIds;
  const top = doc.layers.length - 1;
  const shadow: Shadow = sel?.shadow ?? DEFAULT_SHADOW;
  const setShadow = (patch: Partial<Shadow>, key: string) => onUpdate(ids, { shadow: { ...shadow, ...patch } }, `shadow-${key}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <label className="btn cursor-pointer">
          <Icon name="image" className="size-4" />
          {t("layers.addImage")}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) onAddImage([...e.target.files]);
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
          const active = ids.includes(l.id);
          return (
            <li key={l.id} className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${active ? "border-accent bg-accent/8" : "border-transparent hover:bg-raised"}`}>
              <button className={iconButton} onClick={() => onUpdate([l.id], { visible: !l.visible })} aria-label={l.visible ? t("layers.hide") : t("layers.show")} title={l.visible ? t("layers.hide") : t("layers.show")}>
                <Icon name={l.visible ? "eye" : "eyeOff"} className="size-4" />
              </button>
              <button
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm"
                onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelected(doc, l.id).selectedIds : [l.id])}
                aria-pressed={active}
              >
                <Icon name={l.kind === "text" ? "text" : "image"} className="size-4 shrink-0 text-muted" />
                <span className={`truncate ${l.visible ? "" : "text-muted line-through"}`}>{layerLabel(l)}</span>
              </button>
              <button className={iconButton} onClick={() => onMove(l.id, 1)} disabled={index === top} aria-label={t("layers.up")} title={t("layers.up")}>
                <Icon name="up" className="size-4" />
              </button>
              <button className={iconButton} onClick={() => onMove(l.id, -1)} disabled={index === 0} aria-label={t("layers.down")} title={t("layers.down")}>
                <Icon name="down" className="size-4" />
              </button>
              <button className={iconButton} onClick={() => onRemove([l.id])} aria-label={t("layers.delete")} title={t("layers.delete")}>
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>

      {sel && (
        <>
          <section className="flex flex-col gap-3 rounded-xl bg-raised p-3">
            <div className="flex items-center justify-between">
              <h3 className="label mb-0">{ids.length > 1 ? t("layers.selectedCount", { n: ids.length }) : t("layers.properties")}</h3>
              <button className="btn px-2 py-1 text-xs" onClick={onDuplicate} title={`${t("layers.duplicate")} (Ctrl+D)`}>
                <Icon name="copy" className="size-3.5" />
                {t("layers.duplicate")}
              </button>
            </div>
            <div>
              <span className="mb-1 block text-xs text-muted">{t("layers.align")}</span>
              <div className="grid grid-cols-6 gap-1" title={t("align.hintOne")}>
                {ALIGNMENTS.map(([how, icon, label]) => (
                  <button key={how} className="btn px-0 py-1.5" onClick={() => onAlign(how)} aria-label={t(label)} title={t(label)}>
                    <Icon name={icon} className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            <Slider label={t("layers.opacity", { v: Math.round(sel.opacity * 100) })} value={Math.round(sel.opacity * 100)} min={0} max={100} onChange={(v) => onUpdate(ids, { opacity: v / 100 }, "opacity")} />
            {ids.length === 1 && (
              <>
                <Slider label={t("layers.scale", { v: Math.round(sel.scale * 100) })} value={Math.round(sel.scale * 100)} min={5} max={400} onChange={(v) => onUpdate(ids, { scale: v / 100 }, "scale")} />
                <Slider label={t("layers.rotation", { v: Math.round(sel.rotation) })} value={Math.round(sel.rotation)} min={-180} max={180} onChange={(v) => onUpdate(ids, { rotation: v }, "rotation")} />
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn px-2 text-xs" onClick={() => onUpdate(ids, { x: doc.width / 2, y: doc.height / 2 })}>
                    {t("layers.center")}
                  </button>
                  <button className="btn px-2 text-xs" onClick={() => onUpdate(ids, { scale: 1, rotation: 0 })}>
                    {t("layers.reset")}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-raised p-3">
            <label className="flex items-center justify-between text-sm font-medium">
              {t("shadow.enable")}
              <input type="checkbox" className="size-4 accent-(--accent)" checked={!!sel.shadow} onChange={(e) => onUpdate(ids, { shadow: e.target.checked ? shadow : null })} />
            </label>
            {sel.shadow && (
              <>
                <Slider label={t("shadow.blur", { v: shadow.blur })} value={shadow.blur} min={0} max={150} onChange={(blur) => setShadow({ blur }, "blur")} />
                <Slider label={t("shadow.x", { v: shadow.x })} value={shadow.x} min={-150} max={150} onChange={(x) => setShadow({ x }, "x")} />
                <Slider label={t("shadow.y", { v: shadow.y })} value={shadow.y} min={-150} max={150} onChange={(y) => setShadow({ y }, "y")} />
                <Slider label={t("shadow.opacity", { v: Math.round(shadow.opacity * 100) })} value={Math.round(shadow.opacity * 100)} min={0} max={100} onChange={(v) => setShadow({ opacity: v / 100 }, "opacity")} />
                <label className="flex items-center justify-between text-xs text-muted">
                  {t("shadow.color")}
                  <input type="color" value={shadow.color} onChange={(e) => setShadow({ color: e.target.value }, "color")} className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent" />
                </label>
              </>
            )}
          </section>
        </>
      )}
      <p className="text-xs text-muted">{t("layers.selectHint")}</p>
    </div>
  );
}
