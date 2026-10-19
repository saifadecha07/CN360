#!/usr/bin/env node
/**
 * Local stand-in for the Vercel deployment: serves UI/dist and the real
 * api/stream/*.js functions on one origin. For local/e2e testing only.
 *
 *   STREAM_* env vars as in .env.stream.example, then:
 *   node tools/stream-dev-server.mjs [port]      (default 8787)
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const port = Number(process.argv[2] ?? 8787);

const routes = {};
for (const name of ["session", "token", "publish-token", "jwks"]) {
  routes[`/api/stream/${name}`] = await import(path.join(root, "api/stream", `${name}.js`));
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const mod = routes[url.pathname];
  if (mod) {
    const handler = mod[req.method];
    if (!handler) { res.writeHead(405).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    request.headers.set("x-forwarded-for", req.socket.remoteAddress ?? "");
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    console.log(`${req.method} ${url.pathname} → ${response.status}`);
    return;
  }
  if (url.pathname.startsWith("/api/")) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
  const file = path.join(dist, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`stream dev server on http://127.0.0.1:${port}`));
