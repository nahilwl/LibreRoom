import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { maskAlpha, newCanvas } from "../lib/compose";
import {
  boundsOf,
  hitTest,
  layerCorners,
  layersInRect,
  resizeFromCorner,
  rotationFromPointer,
  selectedLayer,
  selectedLayers,
  snap,
  toLayerLocal,
  toggleSelected,
  type Box,
  type Doc,
  type Guide,
  type ImageLayer,
  type Layer,
} from "../lib/document";
import { maskCanvas, measureText, renderDoc, sizeOf } from "../lib/render";
import { Icon } from "./Icon";

export type Tool = "move" | "brush";
export interface BrushSettings {
  mode: "erase" | "restore";
  /** Diameter in screen pixels. */
  size: number;
}

interface Props {
  doc: Doc | null;
  tool: Tool;
  brush: BrushSettings;
  onSelect: (ids: string[]) => void;
  /** Called repeatedly while dragging; `gesture` identifies one drag (one undo step). */
  onTransform: (patches: Map<string, Partial<Layer>>, gesture: number) => void;
  /** A brush stroke finished on an image layer: its new mask. */
  onMaskPainted: (id: string, mask: Uint8ClampedArray) => void;
  onEditText: (id: string) => void;
  onFiles: (files: FileList) => void;
  onPick: () => void;
}

type View = { scale: number; x: number; y: number };
type Pt = { x: number; y: number };
type Drag =
  | { kind: "pan"; last: Pt }
  | { kind: "move"; start: Pt; layers: Layer[]; others: Box[]; gesture: number }
  | { kind: "resize"; layer: Layer; corner: 0 | 1 | 2 | 3; gesture: number }
  | { kind: "rotate"; layer: Layer; gesture: number }
  | { kind: "marquee"; start: Pt; end: Pt }
  | { kind: "paint"; layer: ImageLayer; canvas: HTMLCanvasElement; last: Pt };

/** Handle sizes in screen pixels. */
const HANDLE = 9;
const ROTATE_OFFSET = 28;
const SNAP_PX = 6;
const CORNER_CURSORS = ["nwse-resize", "nesw-resize", "nwse-resize", "nesw-resize"];

let gestures = 0;

export function Workspace({ doc, tool, brush, onSelect, onTransform, onMaskPainted, onEditText, onFiles, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratch = useRef(newCanvas(1, 1));
  const view = useRef<View>({ scale: 1, x: 0, y: 0 });
  const pointer = useRef<Pt | null>(null);
  const drag = useRef<Drag | null>(null);
  const guides = useRef<Guide[]>([]);
  const space = useRef(false);
  const frame = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [comparing, setComparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const checker = useRef<{ key: string; pattern: HTMLCanvasElement } | null>(null);

  /** Canvas (document) → screen (CSS px relative to the element). */
  const toScreen = (p: Pt): Pt => ({ x: view.current.x + p.x * view.current.scale, y: view.current.y + p.y * view.current.scale });
  /** Screen → document canvas pixels. */
  const toDoc = (p: Pt): Pt => ({ x: (p.x - view.current.x) / view.current.scale, y: (p.y - view.current.y) / view.current.scale });

  /** Screen positions of the transform handles of a single selected layer. */
  const handlesOf = (layer: Layer) => {
    const corners = layerCorners(layer, sizeOf(layer)).map(toScreen);
    const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const r = (layer.rotation * Math.PI) / 180;
    const knob = { x: top.x + Math.sin(r) * ROTATE_OFFSET, y: top.y - Math.cos(r) * ROTATE_OFFSET };
    return { corners, top, knob };
  };

  const handleAt = (p: Pt): { kind: "corner"; corner: 0 | 1 | 2 | 3 } | { kind: "rotate" } | null => {
    if (!doc || tool !== "move" || doc.selectedIds.length !== 1) return null;
    const layer = selectedLayer(doc);
    if (!layer || !layer.visible) return null;
    const h = handlesOf(layer);
    const near = (q: Pt) => Math.hypot(q.x - p.x, q.y - p.y) <= HANDLE;
    if (near(h.knob)) return { kind: "rotate" };
    const i = h.corners.findIndex(near);
    return i >= 0 ? { kind: "corner", corner: i as 0 | 1 | 2 | 3 } : null;
  };

  const render = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const c = canvasRef.current;
      if (!c || !doc) return;
      const dpr = devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) Object.assign(c, { width: w, height: h });
      if (scratch.current.width !== w || scratch.current.height !== h) Object.assign(scratch.current, { width: w, height: h });
      const ctx = c.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { scale, x, y } = view.current;
      const v = { scale: scale * dpr, dx: x * dpr, dy: y * dpr };
      const css = getComputedStyle(c);
      const accent = css.getPropertyValue("--accent");

      // Checkerboard = transparent area of the canvas.
      const checkerColor = css.getPropertyValue("--checker");
      if (checker.current?.key !== `${checkerColor}@${dpr}`) {
        const sq = 10 * dpr;
        const pattern = newCanvas(sq * 2, sq * 2);
        const p = pattern.getContext("2d")!;
        p.fillStyle = css.getPropertyValue("--panel");
        p.fillRect(0, 0, sq * 2, sq * 2);
        p.fillStyle = checkerColor;
        p.fillRect(0, 0, sq, sq);
        p.fillRect(sq, sq, sq, sq);
        checker.current = { key: `${checkerColor}@${dpr}`, pattern };
      }
      ctx.save();
      ctx.translate(v.dx, v.dy);
      ctx.fillStyle = ctx.createPattern(checker.current.pattern, "repeat")!;
      ctx.fillRect(0, 0, doc.width * v.scale, doc.height * v.scale);
      ctx.restore();

      ctx.imageSmoothingQuality = "high";
      const d = drag.current;
      renderDoc(ctx, doc, v, scratch.current, {
        ignoreMasks: comparing,
        liveMask: d?.kind === "paint" ? { layerId: d.layer.id, canvas: d.canvas } : undefined,
      });

      // Overlays in screen pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 1.5;
      if (tool === "move" && !comparing) {
        const selection = selectedLayers(doc);
        ctx.strokeStyle = accent;
        ctx.setLineDash([5, 4]);
        for (const l of selection) {
          const pts = layerCorners(l, sizeOf(l)).map(toScreen);
          ctx.beginPath();
          pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.stroke();
        }
        ctx.setLineDash([]);
        if (selection.length === 1 && selection[0].visible) {
          const hs = handlesOf(selection[0]);
          ctx.beginPath();
          ctx.moveTo(hs.top.x, hs.top.y);
          ctx.lineTo(hs.knob.x, hs.knob.y);
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          for (const p of hs.corners) {
            ctx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
            ctx.strokeRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
          }
          ctx.beginPath();
          ctx.arc(hs.knob.x, hs.knob.y, HANDLE / 2 + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Smart guides while moving.
        ctx.strokeStyle = css.getPropertyValue("--danger");
        ctx.lineWidth = 1;
        for (const g of guides.current) {
          const a = toScreen(g.axis === "x" ? { x: g.at, y: 0 } : { x: 0, y: g.at });
          const b = toScreen(g.axis === "x" ? { x: g.at, y: doc.height } : { x: doc.width, y: g.at });
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (d?.kind === "marquee") {
          ctx.strokeStyle = accent;
          ctx.fillStyle = "rgba(60, 197, 169, 0.12)";
          const [x0, y0, x1, y1] = [d.start.x, d.start.y, d.end.x, d.end.y];
          ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
          ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        }
      }

      if (tool === "brush" && pointer.current) {
        ctx.beginPath();
        ctx.arc(pointer.current.x, pointer.current.y, brush.size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#000000";
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }, [doc, tool, brush.size, comparing]); // eslint-disable-line react-hooks/exhaustive-deps -- helpers read refs

  const fit = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !doc) return;
    const pad = 32;
    const scale = Math.min((c.clientWidth - pad * 2) / doc.width, (c.clientHeight - pad * 2) / doc.height, 1);
    view.current = { scale, x: (c.clientWidth - doc.width * scale) / 2, y: (c.clientHeight - doc.height * scale) / 2 };
    setZoom(scale);
    render();
  }, [doc, render]);

  const zoomAt = useCallback(
    (factor: number, at?: Pt) => {
      const c = canvasRef.current;
      if (!c) return;
      const v = view.current;
      const p = at ?? { x: c.clientWidth / 2, y: c.clientHeight / 2 };
      const scale = Math.min(32, Math.max(0.02, v.scale * factor));
      const k = scale / v.scale;
      view.current = { scale, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
      setZoom(scale);
      render();
    },
    [render],
  );

  // Refit when another document (or canvas size) is shown, not on every edit.
  const docKey = doc ? `${doc.width}x${doc.height}:${doc.layers[0]?.id}` : "";
  useEffect(fit, [docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(render, [render]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(c);
    // Wheel must be non-passive to stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), { x: e.offsetX, y: e.offsetY });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      c.removeEventListener("wheel", onWheel);
    };
  }, [render, zoomAt, doc !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest("input, textarea, select");
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      if (e.code === "Space") space.current = true;
      if (e.key === "0") fit();
      if (e.key === "+" || e.key === "=") zoomAt(1.25);
      if (e.key === "-") zoomAt(0.8);
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && (space.current = false);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, [fit, zoomAt]);

  const paint = (d: Extract<Drag, { kind: "paint" }>, to: Pt) => {
    const size = { width: d.layer.image.width, height: d.layer.image.height };
    const [a, b] = [toDoc(d.last), toDoc(to)].map((p) => toLayerLocal(d.layer, size, p.x, p.y));
    const ctx = d.canvas.getContext("2d")!;
    ctx.globalCompositeOperation = brush.mode === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = brush.size / (view.current.scale * d.layer.scale);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const local = (e: React.PointerEvent | React.MouseEvent): Pt => ({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (e.button === 1 || space.current) {
      drag.current = { kind: "pan", last: p };
      return;
    }
    if (e.button !== 0) return;
    if (tool === "brush") {
      const layer = selectedLayer(doc);
      if (layer?.kind !== "image" || !layer.visible) return;
      // Work on a copy so the document stays unchanged until the stroke is committed.
      const { width, height } = layer.image;
      const canvas = newCanvas(width, height);
      const ctx = canvas.getContext("2d")!;
      if (layer.mask) ctx.drawImage(maskCanvas(layer.mask, width, height), 0, 0);
      else ctx.fillRect(0, 0, width, height);
      const d: Drag = { kind: "paint", layer, canvas, last: p };
      drag.current = d;
      paint(d, p);
      render();
      return;
    }
    const handle = handleAt(p);
    const sel = selectedLayer(doc);
    if (handle && sel) {
      drag.current = handle.kind === "rotate" ? { kind: "rotate", layer: sel, gesture: ++gestures } : { kind: "resize", layer: sel, corner: handle.corner, gesture: ++gestures };
      return;
    }
    const q = toDoc(p);
    const hit = hitTest(doc, q.x, q.y, measureText);
    if (hit && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      onSelect(toggleSelected(doc, hit.id).selectedIds);
      return;
    }
    if (!hit) {
      drag.current = { kind: "marquee", start: p, end: p };
      return;
    }
    const ids = doc.selectedIds.includes(hit.id) ? doc.selectedIds : [hit.id];
    if (ids !== doc.selectedIds) onSelect(ids);
    const moving = doc.layers.filter((l) => ids.includes(l.id));
    const others = doc.layers.filter((l) => l.visible && !ids.includes(l.id)).map((l) => boundsOf([l], measureText)!);
    drag.current = { kind: "move", start: q, layers: moving, others, gesture: ++gestures };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    pointer.current = p;
    const d = drag.current;
    const q = toDoc(p);
    if (!d) {
      if (tool === "move") {
        const h = handleAt(p);
        (e.currentTarget as HTMLElement).style.cursor = !h ? "default" : h.kind === "rotate" ? "grab" : CORNER_CURSORS[h.corner];
      }
      if (tool === "brush") render();
      return;
    }
    if (d.kind === "pan") {
      view.current = { ...view.current, x: view.current.x + p.x - d.last.x, y: view.current.y + p.y - d.last.y };
      d.last = p;
    } else if (d.kind === "paint") {
      paint(d, p);
      d.last = p;
    } else if (d.kind === "marquee") {
      d.end = p;
    } else if (d.kind === "move") {
      let [dx, dy] = [q.x - d.start.x, q.y - d.start.y];
      guides.current = [];
      if (!e.altKey && doc) {
        const b = boundsOf(d.layers, measureText)!;
        const s = snap({ left: b.left + dx, top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy }, d.others, doc, SNAP_PX / view.current.scale);
        dx += s.dx;
        dy += s.dy;
        guides.current = s.guides;
      }
      onTransform(new Map(d.layers.map((l) => [l.id, { x: Math.round(l.x + dx), y: Math.round(l.y + dy) }])), d.gesture);
    } else if (d.kind === "resize") {
      const r = resizeFromCorner(d.layer, sizeOf(d.layer), d.corner, q.x, q.y);
      onTransform(new Map([[d.layer.id, r]]), d.gesture);
    } else if (d.kind === "rotate") {
      onTransform(new Map([[d.layer.id, { rotation: rotationFromPointer(d.layer, q.x, q.y, e.shiftKey) }]]), d.gesture);
    }
    render();
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    guides.current = [];
    if (d?.kind === "paint") {
      onMaskPainted(d.layer.id, maskAlpha(d.canvas));
      d.canvas.width = d.canvas.height = 0;
    } else if (d?.kind === "marquee" && doc) {
      const [a, b] = [toDoc(d.start), toDoc(d.end)];
      const tiny = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) < 3;
      const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
      onSelect(tiny ? [] : layersInRect(doc, box, measureText).map((l) => l.id));
    }
    render();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!doc) return;
    const q = toDoc(local(e));
    const hit = hitTest(doc, q.x, q.y, measureText);
    if (hit?.kind === "text") onEditText(hit.id);
  };

  if (!doc) {
    return (
      <div
        className={`flex flex-1 items-center justify-center p-6 ${dragOver ? "bg-accent/10" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl border-2 border-dashed border-line bg-panel/60 px-8 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/12 text-accent">
            <Icon name="image" className="size-8" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("empty.title")}</h2>
            <p className="mt-2 text-sm text-muted">{t("empty.body")}</p>
          </div>
          <button className="btn btn-primary px-5 py-2.5 text-base" onClick={onPick}>
            {t("empty.pick")}
          </button>
          <ol className="grid w-full gap-2 text-left text-sm sm:grid-cols-3">
            {(["empty.step1", "empty.step2", "empty.step3"] as const).map((k, i) => (
              <li key={k} className="flex items-start gap-2 rounded-xl bg-raised p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-ink">{i + 1}</span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">{t("empty.private")}</p>
        </div>
      </div>
    );
  }

  const hasMask = doc.layers.some((l) => l.kind === "image" && l.mask);
  return (
    <div
      className={`relative flex-1 overflow-hidden ${dragOver ? "outline-2 -outline-offset-4 outline-accent" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <canvas
        ref={canvasRef}
        className={`size-full touch-none ${tool === "brush" ? "cursor-none" : ""}`}
        aria-label={t("workspace.label", { name: doc.name })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => {
          pointer.current = null;
          render();
        }}
      />
      {hasMask && (
        <button
          className={`absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm shadow-sm select-none ${comparing ? "bg-accent text-accent-ink" : "bg-panel"}`}
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setComparing(true)}
          onKeyUp={() => setComparing(false)}
          aria-pressed={comparing}
        >
          <Icon name="eye" className="size-4" />
          {t("compare.hold")}
        </button>
      )}
      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-xl border border-line bg-panel p-1 shadow-sm">
        <button className="rounded-lg p-1.5 hover:bg-raised" onClick={() => zoomAt(0.8)} aria-label={t("zoom.out")} title={t("zoom.out")}>
          <Icon name="minus" className="size-4" />
        </button>
        <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
          {Math.round(zoom * 100)} %
        </span>
        <button className="rounded-lg p-1.5 hover:bg-raised" onClick={() => zoomAt(1.25)} aria-label={t("zoom.in")} title={t("zoom.in")}>
          <Icon name="plus" className="size-4" />
        </button>
        <button className="rounded-lg p-1.5 hover:bg-raised" onClick={fit} aria-label={t("zoom.fit")} title={t("zoom.fit")}>
          <Icon name="fit" className="size-4" />
        </button>
      </div>
    </div>
  );
}
