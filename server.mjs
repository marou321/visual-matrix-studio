import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 4173;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt']);
const assetCache = new Map();

async function resolveFilePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.posix.normalize(cleanPath);
  if (normalized.includes('..')) {
    return null;
  }

  const relative = normalized.replace(/^\/+/, '');
  const candidate = path.join(__dirname, relative || 'index.html');

  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile()) {
      return { filePath: candidate, stat };
    }
    if (stat.isDirectory()) {
      const dirIndex = path.join(candidate, 'index.html');
      const idxStat = await fs.stat(dirIndex);
      if (idxStat.isFile()) {
        return { filePath: dirIndex, stat: idxStat };
      }
    }
  } catch {
    // Try appending /index.html or .html for clean routes
  }

  if (!path.extname(candidate)) {
    for (const fallback of [path.join(candidate, 'index.html'), `${candidate}.html`]) {
      try {
        const stat = await fs.stat(fallback);
        if (stat.isFile()) {
          return { filePath: fallback, stat };
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

async function loadAsset(filePath, stat, ext) {
  const cached = assetCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const raw = await fs.readFile(filePath);
  const compressible = COMPRESSIBLE_EXTS.has(ext) && raw.length > 512;
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    etag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    raw,
    br: compressible ? await brotliCompress(raw) : null,
    gzip: compressible ? await gzipCompress(raw) : null
  };
  if (stat.size <= 2 * 1024 * 1024) {
    assetCache.set(filePath, entry);
  }
  return entry;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const resolved = await resolveFilePath(req.url);
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Page Not Found | ChromaGlyph Studio</title>
  <link rel="stylesheet" href="/src/css/styles.css" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4588627708948117" crossorigin="anonymous"></script>
</head>
<body class="page-404">
  <main class="container" style="padding: 6rem 1.5rem; text-align: center;">
    <p class="eyebrow">404 Error</p>
    <h1 style="margin: 0.75rem 0 1rem;">Page not found</h1>
    <p style="max-width: 48ch; margin: 0 auto 2rem; color: var(--text-muted);">
      The page you requested does not exist. Return to ChromaGlyph Studio to generate Binary, ASCII, or Halftone artwork, or explore our gallery and guides.
    </p>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:0.75rem;">
      <a class="btn btn-primary" href="/">Back to Studio</a>
      <a class="btn btn-secondary" href="/gallery">Gallery</a>
      <a class="btn btn-secondary" href="/guides">Guides</a>
      <a class="btn btn-ghost" href="/about">About</a>
      <a class="btn btn-ghost" href="/contact">Contact</a>
      <a class="btn btn-ghost" href="/privacy">Privacy</a>
    </div>
  </main>
</body>
</html>`);
    return;
  }

  try {
    const { filePath, stat } = resolved;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isCodeAsset = ext === '.html' || ext === '.css' || ext === '.js' || ext === '.mjs';
    const asset = await loadAsset(filePath, stat, ext);

    if (req.headers['if-none-match'] === asset.etag) {
      res.writeHead(304, {
        ETag: asset.etag,
        'Cache-Control': isCodeAsset ? 'no-cache, must-revalidate' : 'public, max-age=86400',
        'X-App-Version': '2.7.0-autotune-cad-samples'
      });
      res.end();
      return;
    }

    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    let body = asset.raw;
    let encoding = null;
    if (asset.br && acceptEncoding.includes('br')) {
      body = asset.br;
      encoding = 'br';
    } else if (asset.gzip && acceptEncoding.includes('gzip')) {
      body = asset.gzip;
      encoding = 'gzip';
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': body.length,
      ETag: asset.etag,
      'Cache-Control': isCodeAsset ? 'no-cache, must-revalidate' : 'public, max-age=86400',
      'X-App-Version': '2.7.0-autotune-cad-samples'
    };
    if (encoding) {
      headers['Content-Encoding'] = encoding;
      headers.Vary = 'Accept-Encoding';
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(body);
    }
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

// Render reverse-proxy recommended keep-alive timeouts (prevents 502 socket race conditions)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, HOST, () => {
  console.log(`ChromaGlyph Studio running at http://${HOST}:${PORT}`);
});
