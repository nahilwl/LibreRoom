// Serves dist/ the way GitHub Pages serves a project site, to test the web build locally:
//  - only under /LibreRoom/ (paths are case-sensitive, like on GitHub Pages);
//  - /LibreRoom redirects to /LibreRoom/ (301), directories serve index.html;
//  - standard MIME types, "Cache-Control: max-age=600", and NO custom headers
//    (GitHub Pages cannot send COOP/COEP, so the page is not cross-origin isolated by itself);
//  - anything else is a 404.
//   node scripts/serve-pages.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/LibreRoom/";
const ROOT = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.argv[2] ?? 4174);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE });
    return res.end();
  }
  if (!path.startsWith(BASE)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404 (GitHub Pages simulation: outside /LibreRoom/)");
  }
  let file = normalize(join(ROOT, path.slice(BASE.length)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "max-age=600" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`GitHub Pages simulation: http://127.0.0.1:${PORT}${BASE}`));
