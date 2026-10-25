import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, createZip } from "./zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes an archive that a standard tool reads back intact", async () => {
    const files = [
      { name: "shoe-libreroom.png", data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
      { name: "café é.webp", data: new TextEncoder().encode("x".repeat(1000)) },
    ];
    const bytes = new Uint8Array(await createZip(files).arrayBuffer());
    const path = join(mkdtempSync(join(tmpdir(), "zip-")), "t.zip");
    writeFileSync(path, bytes);
    // Python's zipfile checks every CRC and size: an independent reader.
    const py = spawnSync("python3", ["-I", "-c", "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps([[i.filename, len(z.read(i))] for i in z.infolist()]))", path], { encoding: "utf8" });
    if (py.error) return; // python3 unavailable: skip the cross-check
    expect(py.stderr).toBe("");
    expect(JSON.parse(py.stdout)).toEqual([["shoe-libreroom.png", 7], ["café é.webp", 1000]]);
  });
});
