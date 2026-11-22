import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 4173;

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
      return candidate;
    }
    if (stat.isDirectory()) {
      const dirIndex = path.join(candidate, 'index.html');
      const idxStat = await fs.stat(dirIndex);
      if (idxStat.isFile()) {
        return dirIndex;
      }
    }
  } catch {
    // Try appending .html or /index.html for clean routes
  }

  if (!path.extname(candidate)) {
    for (const fallback of [path.join(candidate, 'index.html'), `${candidate}.html`]) {
      try {
        const stat = await fs.stat(fallback);
        if (stat.isFile()) {
          return fallback;
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const filePath = await resolveFilePath(req.url);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — Page Not Found | ChromaGlyph Studio</title>
  <link rel="stylesheet" href="/src/css/styles.css" />
</head>
<body class="page-404">
  <main class="container" style="padding: 6rem 1.5rem; text-align: center;">
    <p class="eyebrow">404 Error</p>
    <h1 style="margin: 0.75rem 0 1rem;">Page not found</h1>
    <p style="max-width: 48ch; margin: 0 auto 2rem; color: var(--text-muted);">
      The page you requested does not exist. Return to the ChromaGlyph Studio to generate Binary, ASCII, or Halftone artwork.
    </p>
    <a class="btn btn-primary" href="/">Back to Studio</a>
  </main>
</body>
</html>`);
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`ChromaGlyph Studio running at http://${HOST}:${PORT}`);
});
