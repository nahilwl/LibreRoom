import { useEffect, useRef, useState } from "react";
import { t, type MessageKey } from "./i18n";
import {
  addLayer,
  docFromImage,
  findLayer,
  imageLayer,
  maskBytes,
  moveLayer,
  removeLayer,
  selectedLayer,
  textLayer,
  updateLayer,
  type Doc,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "./lib/document";
import { baseName, decodeImage, openProject, saveBlob, serializeProject } from "./lib/files";
import { History } from "./lib/history";
import { MODELS } from "./lib/models";
import { exportImage, type ExportFormat } from "./lib/render";
import { segment } from "./lib/segmenter";
import { restoreAutosave } from "./lib/autosave";
import { useAutosave } from "./hooks/useAutosave";
import { prefs, useLanguage, useTheme } from "./hooks/usePreferences";
import { Header } from "./components/Header";
import { Icon, type IconName } from "./components/Icon";
import { Progress } from "./components/Progress";
import { Workspace, type BrushSettings } from "./components/Workspace";
import { RemovePanel } from "./components/panels/RemovePanel";
import { BrushPanel } from "./components/panels/BrushPanel";
import { LayersPanel } from "./components/panels/LayersPanel";
import { TextPanel } from "./components/panels/TextPanel";
import { BackgroundPanel } from "./components/panels/BackgroundPanel";
import { ExportPanel } from "./components/panels/ExportPanel";

type Section = "remove" | "brush" | "layers" | "text" | "background" | "export";
const SECTIONS: { id: Section; label: MessageKey; icon: IconName }[] = [
  { id: "remove", label: "section.remove", icon: "wand" },
  { id: "brush", label: "section.brush", icon: "brush" },
  { id: "layers", label: "section.layers", icon: "layers" },
  { id: "text", label: "section.text", icon: "text" },
  { id: "background", label: "section.background", icon: "image" },
  { id: "export", label: "section.export", icon: "download" },
];

function Busy({ label, since }: { label: string; since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <Progress label={t("busy.elapsed", { label, seconds: ((now - since) / 1000).toFixed(1) })} />;
}

const closeImages = (d: Doc | null) => d?.layers.forEach((l) => l.kind === "image" && l.image.close());

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [section, setSection] = useState<Section>("remove");
  const [brush, setBrush] = useState<BrushSettings>({ mode: "erase", size: 40 });
  const [modelId, setModelId] = useState(() => prefs.get("libreroom-model") ?? MODELS[0].id);
  const [busy, setBusy] = useState<{ label: string; since: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dark, setDark] = useTheme();
  const [lang, setLang] = useLanguage();
  const history = useRef(new History<Doc>(maskBytes));
  const lastEdit = useRef({ key: "", at: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const autosave = useAutosave(doc, dirty, (e) => setError(e.message));

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
  const select = (id: string | null) => doc && setDoc({ ...doc, selectedId: id });

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
      closeImages(next);
      return;
    }
    closeImages(doc);
    history.current.clear();
    setDoc(next);
    setDirty(keepDirty);
    setLastRun(null);
    if (!keepDirty) autosave.discard();
  };

  /** Adds an image as a new layer, scaled down to fit the canvas if needed. */
  const addImage = (file: File) =>
    doc &&
    run("busy.opening", async () => {
      const image = await decodeImage(file);
      const scale = Math.min(1, (0.8 * doc.width) / image.width, (0.8 * doc.height) / image.height);
      apply(addLayer(doc, imageLayer(baseName(file.name), file, image, doc.width / 2, doc.height / 2, scale)));
      setSection("layers");
    });

  const addText = () => {
    if (!doc) return;
    const size = Math.max(16, Math.round(doc.height / 10));
    apply(addLayer(doc, textLayer(t("text.layerName"), t("text.default"), doc.width / 2, doc.height / 2, size)));
    setSection("text");
  };

  /** Open: a project or an image replaces the document. Drop/paste onto an open document adds a layer. */
  const importFiles = (files: FileList | File[] | null, asLayer = false) => {
    const file = files?.[0];
    if (!file) return;
    if (asLayer && doc && !file.name.endsWith(".libreroom")) return addImage(file);
    run("busy.opening", async () => {
      if (file.name.endsWith(".libreroom")) {
        replaceDoc(await openProject(await file.text()));
        return;
      }
      replaceDoc(docFromImage(baseName(file.name), file, await decodeImage(file)));
      setSection("remove");
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
      if (e.clipboardData?.files.length) importFiles(e.clipboardData.files, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
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
      } else if (!mod && (key === "delete" || key === "backspace") && sel) {
        e.preventDefault();
        edit((d) => removeLayer(d, sel.id));
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
      />
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
          <Workspace
            doc={doc}
            tool={section === "brush" ? "brush" : "move"}
            brush={brush}
            onSelect={select}
            onMoveLayer={(id, x, y, gesture) => editLayer(id, { x, y }, `move-${gesture}`)}
            onMaskPainted={(id, mask) => editLayer<ImageLayer>(id, { mask })}
            onEditText={(id) => {
              select(id);
              setSection("text");
            }}
            onFiles={(files) => importFiles(files, true)}
            onPick={() => fileInput.current?.click()}
          />
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
          {!doc && section !== "remove" && hint("app.importFirst")}
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
              onAddImage={addImage}
              onAddText={addText}
              onUpdate={(id, patch, coalesce) => editLayer(id, patch, coalesce)}
              onMove={(id, delta) => edit((d) => moveLayer(d, id, delta))}
              onRemove={(id) => edit((d) => removeLayer(d, id))}
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
