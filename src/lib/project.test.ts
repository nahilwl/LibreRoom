import { describe, expect, it } from "vitest";
import { parseProject } from "./project";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const imageLayer = { kind: "image", name: "Shoe", visible: true, opacity: 1, x: 400, y: 300, scale: 1, rotation: 0, source: PNG, mask: PNG, modelId: "isnet-int8" };
const textLayer = { kind: "text", name: "Title", visible: true, opacity: 0.8, x: 400, y: 80, scale: 1.5, rotation: -5, text: "SALE\n-20%", font: "serif", size: 64, bold: true, italic: false, color: "#c0392b", align: "center" };
const valid = {
  format: "libreroom",
  version: 2,
  name: "Shoe ad",
  width: 800,
  height: 600,
  background: { type: "color", color: "#ffffff" },
  layers: [imageLayer, textLayer],
  selected: 1,
  savedAt: "2026-10-25T00:00:00Z",
};
const parse = (o: object) => parseProject(JSON.stringify(o));

describe("parseProject", () => {
  it("accepts a valid v2 project", () => {
    expect(parse(valid)).toEqual(valid);
  });
  it("migrates a v1 project to a single full-canvas image layer", () => {
    const v1 = { format: "libreroom", version: 1, name: "Old", width: 800, height: 600, source: PNG, mask: null, background: { type: "transparent" }, modelId: null, savedAt: "" };
    const p = parse(v1);
    expect(p.version).toBe(2);
    expect(p.layers).toEqual([{ kind: "image", name: "Old", visible: true, opacity: 1, x: 400, y: 300, scale: 1, rotation: 0, source: PNG, mask: null, modelId: null }]);
    expect(p.selected).toBe(0);
  });
  it("rejects non-JSON", () => {
    expect(() => parseProject("{")).toThrow(/invalid JSON/);
  });
  it("rejects other formats and newer versions", () => {
    expect(() => parse({ ...valid, format: "psd" })).toThrow(/not a LibreRoom project/);
    expect(() => parse({ ...valid, version: 99 })).toThrow(/newer version/);
  });
  it("rejects non-image or remote sources", () => {
    expect(() => parse({ ...valid, layers: [{ ...imageLayer, source: "https://evil.example/x.png" }] })).toThrow(/source image/);
    expect(() => parse({ ...valid, layers: [{ ...imageLayer, source: "data:text/html;base64,PGgxPg==" }] })).toThrow(/source image/);
  });
  it("rejects absurd dimensions, transforms and colours", () => {
    expect(() => parse({ ...valid, width: 0 })).toThrow(/“width”/);
    expect(() => parse({ ...valid, height: 1e9 })).toThrow(/“height”/);
    expect(() => parse({ ...valid, background: { type: "color", color: "red;}" } })).toThrow(/invalid background/);
    expect(() => parse({ ...valid, layers: [{ ...imageLayer, opacity: 2 }] })).toThrow(/layers/);
    expect(() => parse({ ...valid, layers: [{ ...imageLayer, scale: 0 }] })).toThrow(/layers/);
    expect(() => parse({ ...valid, layers: [{ ...textLayer, color: "url(x)" }] })).toThrow(/layers/);
    expect(() => parse({ ...valid, layers: [{ ...textLayer, font: "Comic Sans" }] })).toThrow(/layers/);
    expect(() => parse({ ...valid, layers: [{ ...textLayer, text: "x".repeat(10_001) }] })).toThrow(/layers/);
    expect(() => parse({ ...valid, layers: [{ kind: "video" }] })).toThrow(/layers/);
  });
  it("defaults a missing name and an out-of-range selection", () => {
    const p = parse({ ...valid, name: "", selected: 7 });
    expect(p.name).toBe("Untitled");
    expect(p.selected).toBe(1);
  });
});
