import { useEffect, useRef, useState } from "react";
import { t, type MessageKey } from "./i18n";
import {
  addLayer,
  align,
  docFromImage,
  duplicateLayers,
  findLayer,
  imageLayer,
  maskBytes,
  moveLayer,
  removeLayers,
  select as selectIds,
  selectedLayer,
  textLayer,
  updateLayer,
  updateLayers,
  type Doc,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "./lib/document";
import { baseName, decodeImage, openProject, saveBlob, serializeProject } from "./lib/files";
import { History } from "./lib/history";
import { MODELS } from "./lib/models";
import { exportImage, measureText, type ExportFormat } from "./lib/render";
import { segment } from "./lib/segmenter";
import { restoreAutosave } from "./lib/autosave";
import { useAutosave } from "./hooks/useAutosave";
import { prefs, useLanguage, useTheme } from "./hooks/usePreferences";
import { Header } from "./components/Header";
import { Icon, type IconName } from "./components/Icon";
import { Progress } from "./components/Progress";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { BatchView } from "./components/BatchView";
import { BatchPanel } from "./components/panels/BatchPanel";
import { useBatch } from "./hooks/useBatch";
import { Workspace, type BrushSettings } from "./components/Workspace";
import { RemovePanel } from "./components/panels/RemovePanel";
import { BrushPanel } from "./components/panels/BrushPanel";
import { LayersPanel } from "./components/panels/LayersPanel";
import { TextPanel } from "./components/panels/TextPanel";
import { BackgroundPanel } from "./components/panels/BackgroundPanel";
import { ExportPanel } from "./components/panels/ExportPanel";

type Section = "remove" | "brush" | "layers" | "text" | "background" | "export" | "batch";
const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: "remove", label: "section.remove", icon: "wand" },
  { id: "brush", label: "section.brush", icon: "brush" },
  { id: "layers", label: "section.layers", icon: "layers" },
  { id: "text", label: "section.text", icon: "text" },
  { id: "background", label: "section.background", icon: "image" },
  { id: "export", label: "section.export", icon: "download" },
  { id: "batch", label: "section.batch", icon: "batch" },
];

function Busy({ label, since }: { label: string; since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <Progress label={t("busy.elapsed", { label, seconds: ((now - since) / 1000).toFixed(1) })} />;
}

const imagesOf = (d: Doc | null) => d?.layers.flatMap((l) => (l.kind === "image" ? [l.image] : [])) ?? [];

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [section, setSection] = useState<Section>("remove");
  const [brush, setBrush] = useState<BrushSettings>({ mode: "erase", size: 40 });
  const [modelId, setModelId] = useState(() => prefs.get("libreroom-model") ?? MODELS[0].id);
  const [busy, setBusy] = useState<{ label: string; since: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [dark, setDark] = useTheme();
  const [lang, setLang] = useLanguage();
  const history = useRef(new History<Doc>(maskBytes));
  const lastEdit = useRef({ key: "", at: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const autosave = useAutosave(doc, dirty, (e) => setError(e.message));
  // Bitmaps of a replaced document are freed only after the canvas has switched to the new
  // one: a frame already scheduled for the old document must not draw a closed bitmap.
  const retired = useRef<ImageBitmap[]>([]);
  useEffect(() => {
    const list = retired.current.splice(0);
    if (list.length) requestAnimationFrame(() => requestAnimationFrame(() => list.forEach((b) => b.close())));
  }, [doc]);
  const batch = useBatch();

  const run = async (label: MessageKey, task: () => Promise<void>) => {
    setError(null);
    setBusy({ label: t(label), since: Date.now() });
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Replaces the document with `next` as one undo step. Repeated edits with the same `coalesce`
   * key within a second (dragging, typing, sliders) merge into a single step.
   */
  const apply = (next: Doc, coalesce = "") => {
    setDoc((prev) => {
      if (!prev) return next;
      const now = Date.now();
      const merge = coalesce !== "" && lastEdit.current.key === coalesce && now - lastEdit.current.at < 1000;
      if (!merge) history.current.record(prev);
      lastEdit.current = { key: coalesce, at: now };
      return next;
    });
    setDirty(true);
  };

  /** Applies `change` to the current document (always the latest state). */
  const edit = (change: (d: Doc) => Doc, coalesce = "") => doc && apply(change(doc), coalesce);
  const editLayer = <L extends Layer>(id: string, patch: Partial<L>, coalesce = "") => edit((d) => updateLayer<L>(d, id, patch), coalesce);
  const editLayers = (ids: string[], patch: Partial<Layer>, coalesce = "") =>
    edit((d) => updateLayers(d, new Map(ids.map((id) => [id, patch]))), coalesce);
  /** Selection changes are not undo steps. */
  const select = (ids: string[]) => doc && setDoc(selectIds(doc, ids));

  const restore = (d: Doc | null) => {
    if (!d) return;
    lastEdit.current = { key: "", at: 0 };
    setDoc(d);
    setDirty(true);
  };
  const undo = () => doc && restore(history.current.undo(doc));
  const redo = () => doc && restore(history.current.redo(doc));

  const replaceDoc = (next: Doc, keepDirty = false) => {
    if (dirty && !keepDirty && !confirm(t("confirm.discard"))) {
      imagesOf(next).forEach((b) => b.close()); // never shown
      return;
    }
    retired.current.push(...imagesOf(doc));
    history.current.clear();
    setDoc(next);
    setDirty(keepDirty);
    setLastRun(null);
    if (!keepDirty) autosave.discard();
  };

  /** `base` plus the images as new layers, each scaled down to fit the canvas and slightly offset. */
  const withImages = async (base: Doc, files: File[]) => {
    let next = base;
    for (const [i, file] of files.entries()) {
      const image = await decodeImage(file);
      const scale = Math.min(1, (0.8 * next.width) / image.width, (0.8 * next.height) / image.height);
      next = addLayer(next, imageLayer(baseName(file.name), file, image, next.width / 2 + i * 24, next.height / 2 + i * 24, scale));
    }
    return next;
  };

  /** Adds images to the open document as one undo step. */
  const addImages = (files: File[]) =>
    doc &&
    run("busy.opening", async () => {
      apply(await withImages(doc, files));
      setSection("layers");
    });

  const addText = () => {
    if (!doc) return;
    const size = Math.max(16, Math.round(doc.height / 10));
    apply(addLayer(doc, textLayer(t("text.layerName"), t("text.default"), doc.width / 2, doc.height / 2, size)));
    setSection("text");
  };

  /**
   * Open: a project or an image replaces the document. Dropping or pasting images onto an open
   * document adds them as layers; dropping several onto an empty editor opens the first and
   * adds the others as layers.
   */
  const importFiles = (list: FileList | File[] | null, asLayers = false) => {
    const files = [...(list ?? [])];
    const project = files.find((f) => f.name.endsWith(".libreroom"));
    if (project) {
      run("busy.opening", async () => replaceDoc(await openProject(await project.text())));
      return;
    }
    if (!files.length) return;
    if (asLayers && doc) return addImages(files);
    run("busy.opening", async () => {
      const [first, ...rest] = files;
      const fresh = docFromImage(baseName(first.name), first, await decodeImage(first));
      replaceDoc(rest.length ? await withImages(fresh, rest) : fresh);
      setSection(rest.length ? "layers" : "remove");
    });
  };

  const sel = doc ? selectedLayer(doc) : null;
  const selImage = sel?.kind === "image" ? sel : null;
  const selText = sel?.kind === "text" ? sel : null;

  const removeBackground = () => {
    if (!doc || !selImage) return;
    const target = selImage;
    run("busy.removing", async () => {
      const r = await segment(modelId, await createImageBitmap(target.image));
      setDoc((current) => {
        // The user may have edited meanwhile: apply the mask to the latest document.
        if (!current || !findLayer(current, target.id)) return current;
        history.current.record(current);
        return updateLayer<ImageLayer>(current, target.id, { mask: r.mask, aiMask: r.mask, modelId });
      });
      setDirty(true);
      setLastRun(`${r.backend} · ${(r.ms / 1000).toFixed(1)} s`);
    });
  };

  const saveProject = () =>
    doc &&
    run("busy.saving", async () => {
      saveBlob(await serializeProject(doc), `${doc.name}.libreroom`);
      setDirty(false);
      await autosave.discard();
    });

  const exportDoc = (format: ExportFormat, width: number, quality: number) =>
    doc &&
    run("busy.exporting", async () => {
      saveBlob(await exportImage(doc, width, format, quality), `${doc.name}.${format === "jpeg" ? "jpg" : format}`);
    });

  const setBackgroundImage = (file: File) =>
    doc &&
    run("busy.loadingBackground", async () => {
      const bitmap = await decodeImage(file);
      edit((d) => ({ ...d, background: { type: "image", blob: file, bitmap } }));
    });

  const restoreRecovered = () => {
    const r = autosave.recovered;
    if (!r) return;
    autosave.dismissRecovered();
    run("busy.opening", async () => replaceDoc(await restoreAutosave(r), true));
  };

  useEffect(() => prefs.set("libreroom-model", modelId), [modelId]);

  // Browser tab: warn before closing with unsaved work (autosave covers the desktop app).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea")) return;
      if (!e.clipboardData?.files.length) return;
      if (section === "batch") batch.add(e.clipboardData.files);
      else importFiles(e.clipboardData.files, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, dialog")) return;
      if (section === "batch" && e.key !== "?") return; // layer shortcuts do not apply to the batch view
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        saveProject();
      } else if (mod && key === "o") {
        e.preventDefault();
        fileInput.current?.click();
      } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        if (!busy) redo();
      } else if (mod && key === "z") {
        e.preventDefault();
        if (!busy) undo();
      } else if (!mod && (key === "delete" || key === "backspace") && doc?.selectedIds.length) {
        e.preventDefault();
        edit((d) => removeLayers(d, d.selectedIds));
      } else if (mod && key === "a" && doc) {
        e.preventDefault();
        select(doc.layers.map((l) => l.id));
      } else if (key === "escape" && doc) {
        select([]);
      } else if (mod && key === "d" && doc?.selectedIds.length) {
        e.preventDefault();
        edit((d) => duplicateLayers(d, d.selectedIds));
      } else if (mod && (key === "]" || key === "[") && sel) {
        e.preventDefault();
        edit((d) => moveLayer(d, sel.id, key === "]" ? 1 : -1));
      } else if (!mod && key.startsWith("arrow") && doc?.selectedIds.length && section !== "brush") {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key] ?? [0, 0];
        const patches = new Map(doc.layers.filter((l) => doc.selectedIds.includes(l.id)).map((l) => [l.id, { x: l.x + dx, y: l.y + dy }]));
        edit((d) => updateLayers(d, patches), "nudge");
      } else if (e.key === "?") {
        setShowShortcuts(true);
      } else if (!mod && key === "x") setBrush((b) => ({ ...b, mode: b.mode === "erase" ? "restore" : "erase" }));
      else if (!mod && key === "[") setBrush((b) => ({ ...b, size: Math.max(4, Math.round(b.size / 1.2)) }));
      else if (!mod && key === "]") setBrush((b) => ({ ...b, size: Math.min(300, Math.round(b.size * 1.2)) }));
    };
    addEventListener("paste", onPaste);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("paste", onPaste);
      removeEventListener("keydown", onKey);
    };
  });

  const hint = (key: MessageKey) => <p className="text-sm text-muted">{t(key)}</p>;

  return (
    <div className="flex h-full flex-col" lang={lang}>
      <Header
        name={doc?.name ?? null}
        onRename={(name) => doc && apply({ ...doc, name }, "rename")}
        dirty={dirty}
        busy={!!busy}
        canUndo={history.current.canUndo}
        canRedo={history.current.canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpen={() => fileInput.current?.click()}
        onSave={saveProject}
        dark={dark}
        onToggleTheme={() => setDark(!dark)}
        lang={lang}
        onLanguage={setLang}
        onShortcuts={() => setShowShortcuts(true)}
      />
      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,.libreroom"
        className="sr-only"
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {autosave.recovered && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm">
          <span className="font-semibold">{t("recovery.title")}</span>
          <span className="text-muted">
            {t("recovery.body", { name: autosave.recovered.name, time: new Date(autosave.recovered.savedAt).toLocaleString(lang) })}
          </span>
          <span className="ml-auto flex gap-2">
            <button className="btn btn-primary py-1" onClick={restoreRecovered}>
              {t("recovery.restore")}
            </button>
            <button className="btn py-1" onClick={autosave.discard}>
              {t("recovery.discard")}
            </button>
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-20 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-3" aria-label={t("app.tools")}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id}
              className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-center text-[11px] leading-tight font-medium transition ${section === s.id ? "bg-accent/12 text-accent" : "text-muted hover:bg-raised hover:text-ink"}`}
            >
              <Icon name={s.icon} />
              {t(s.label)}
            </button>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          {section === "batch" ? (
            <BatchView items={batch.items} onAdd={batch.add} onRemove={batch.remove} />
          ) : (
            <Workspace
              doc={doc}
              tool={section === "brush" ? "brush" : "move"}
              brush={brush}
              onSelect={select}
              onTransform={(patches, gesture) => edit((d) => updateLayers(d, patches), `transform-${gesture}`)}
              onMaskPainted={(id, mask) => editLayer<ImageLayer>(id, { mask })}
              onEditText={(id) => {
                select([id]);
                setSection("text");
              }}
              onFiles={(files) => importFiles(files, true)}
              onPick={() => fileInput.current?.click()}
            />
          )}
          <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-xs text-muted">
            <span>{doc ? `${doc.width} × ${doc.height} px` : t("app.noImage")}</span>
            {lastRun && <span>{t("app.localAi", { info: lastRun })}</span>}
            <span className="ml-auto flex items-center gap-1">
              <Icon name="check" className="size-3.5" />
              {t("app.privacy")}
            </span>
          </footer>
        </main>

        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-5" aria-label={t("app.properties")}>
          <h2 className="text-base font-semibold">{t(SECTIONS.find((s) => s.id === section)!.label)}</h2>
          {busy && <Busy label={busy.label} since={busy.since} />}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 p-3 text-sm text-danger">
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} aria-label={t("app.dismiss")}>
                <Icon name="close" className="size-4" />
              </button>
            </div>
          )}
          {!doc && section !== "remove" && section !== "batch" && hint("app.importFirst")}
          {section === "batch" && (
            <BatchPanel
              items={batch.items}
              running={batch.running}
              cancelling={batch.cancelling}
              modelId={modelId}
              onStart={batch.start}
              onCancel={batch.cancel}
              onClear={batch.clear}
              onOpenModel={() => setSection("remove")}
            />
          )}
          {section === "remove" && (
            <>
              <RemovePanel
                modelId={modelId}
                setModelId={setModelId}
                canRun={!!selImage}
                busy={!!busy}
                hasMask={!!selImage?.mask}
                onRemove={removeBackground}
                onShowOriginal={() => selImage && editLayer<ImageLayer>(selImage.id, { mask: null })}
              />
              {doc && !selImage && hint("selection.needImage")}
            </>
          )}
          {doc && section === "brush" &&
            (selImage ? (
              <BrushPanel
                brush={brush}
                setBrush={setBrush}
                canResetToAi={!!selImage.aiMask}
                onResetToAi={() => editLayer<ImageLayer>(selImage.id, { mask: selImage.aiMask })}
              />
            ) : (
              hint("selection.needImage")
            ))}
          {doc && section === "layers" && (
            <LayersPanel
              doc={doc}
              onSelect={select}
              onAddImage={(files) => addImages(files)}
              onAddText={addText}
              onUpdate={editLayers}
              onMove={(id, delta) => edit((d) => moveLayer(d, id, delta))}
              onRemove={(ids) => edit((d) => removeLayers(d, ids))}
              onDuplicate={() => edit((d) => duplicateLayers(d, d.selectedIds))}
              onAlign={(how) => edit((d) => updateLayers(d, align(d, d.selectedIds, how, measureText)))}
            />
          )}
          {doc && section === "text" && (
            <TextPanel layer={selText} onAdd={addText} onUpdate={(patch, coalesce) => selText && editLayer<TextLayer>(selText.id, patch, coalesce)} />
          )}
          {doc && section === "background" && (
            <BackgroundPanel
              background={doc.background}
              hasMask={doc.layers.some((l) => l.kind === "image" && !!l.mask)}
              setColor={(color) => edit((d) => ({ ...d, background: color ? { type: "color", color } : { type: "transparent" } }), "background-color")}
              onPickImage={setBackgroundImage}
            />
          )}
          {doc && section === "export" && (
            <ExportPanel width={doc.width} height={doc.height} background={doc.background} busy={!!busy} onExport={exportDoc} />
          )}
        </aside>
      </div>
    </div>
  );
}
