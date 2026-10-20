/**
 * Serve the production build locally.
 *
 * The Nitro build targets the Cloudflare Worker preset, so `vite preview`
 * cannot run it. This adapter starts a small Node server that:
 *
 * 1. serves the static files from `.output/public`, and
 * 2. forwards everything else to the built Worker entry.
 *
 * It is a local verification tool, not a production server: production
 * deployment uses the Cloudflare Worker (`npx wrangler --cwd .output/server deploy`).
 *
 * Usage: node scripts/preview-build.mjs [port]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = path.join(repoRoot, ".output");
const publicDir = path.join(outputDir, "public");
const port = Number(process.argv[2] ?? 8090);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const worker = (await import(pathToFileURL(path.join(outputDir, "server", "index.mjs")).href))
  .default;

const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.join(publicDir, relative);
    if (!filePath.startsWith(publicDir)) return new Response("Forbidden", { status: 403 });
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return new Response("Not found", { status: 404 });
      const body = await readFile(filePath);
      return new Response(body, {
        headers: {
          "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
          "content-length": String(info.size),
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};

const server = createServer(async (nodeRequest, nodeResponse) => {
  const url = `http://${nodeRequest.headers.host ?? `localhost:${port}`}${nodeRequest.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }

  const hasBody = nodeRequest.method !== "GET" && nodeRequest.method !== "HEAD";
  const request = new Request(url, {
    method: nodeRequest.method,
    headers,
    body: hasBody ? nodeRequest : undefined,
    duplex: hasBody ? "half" : undefined,
  });

  try {
    const response = await worker.fetch(request, { ASSETS }, { waitUntil: () => {} }, new URL(url));
    nodeResponse.statusCode = response.status;
    response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
    nodeResponse.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[preview]", error);
    nodeResponse.statusCode = 500;
    nodeResponse.end("Internal Server Error");
  }
});

server.listen(port, () => {
  console.log(`Production build available at http://localhost:${port}/`);
});
