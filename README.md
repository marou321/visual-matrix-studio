# ChromaGlyph Studio

A modern, privacy-first web application for transforming photographs into **Color-True Binary (0/1)**, **ASCII typography**, and **Halftone Dots** art directly on HTML5 Canvas.

## Features

- **Multi-Mode Interactive Canvas Studio (`/`)**
  - Upload your own images (click or drag-and-drop) or choose from 6 high-contrast preloaded studio samples.
  - **Binary Mode (0/1)**: Luminance thresholding with optional 4×4 Bayer ordered dithering while preserving real RGB colors.
  - **ASCII Mode**: 5 selectable optical-density character ramps (including `@#%*+=-:.`, 70-step Extended, Unicode Blocks, and Geometric) with True RGB or curated editorial palettes.
  - **Dots / Halftone Mode**: Amplitude-modulated circles responding to brightness, darkness, or harmonic size + opacity, with Square or Staggered Hexagonal screening grids.
  - Smooth interactive sliders (Cell Size, Character/Dot Spacing, Contrast, Brightness, Color Saturation, Original Underlay), 60fps interactive cursor hover spotlight (Magnify & Illuminate, Original Photo Reveal Lens, Chromatic Glow), Before/After comparison, Plain-Text copy, and 1× / 2× HiDPI PNG export.
- **Curated Gallery (`/gallery`)**: 9 hand-tuned pre-generated artworks across all three modes with mode filters, technical recipe tags, editorial explanations, interactive lightbox inspector, and one-click *Open in Studio*.
- **Technical Graphics Guides (`/guides`)**: In-depth handbook covering Rec. 709 luminance sampling, Binary dithering, ASCII optical density, Halftone geometry, and practical contrast/resolution optimization.
- **Compliance & Trust Pages**: Clean semantic pages for `/about`, `/contact`, and `/privacy`, with the Google AdSense script integrated cleanly in `<head>` across every route.
- **Dark & Light Themes**: Accessible color system with instant toggle and `localStorage` persistence.

## Running Locally

Requires Node.js 18+ (zero external npm dependencies needed):

```bash
node server.mjs
```

Then open `http://127.0.0.1:4173`.

## Deploying on Render

This repository is pre-configured for zero-dependency Node.js deployment on [Render](https://render.com/):

1. Connect `https://github.com/marou321/visual-matrix-studio` in the Render Dashboard as a **Web Service** (or import directly via [render.yaml](render.yaml)).
2. **Build Command**: `npm install`
3. **Start Command**: `node server.mjs` (or `npm start`)
4. `server.mjs` dynamically binds to `0.0.0.0` on `process.env.PORT || 4173` and supports clean URLs (`/`, `/gallery`, `/guides`, `/about`, `/contact`, `/privacy`) plus `HEAD` health checks.

You can also deploy the static files directly to **Vercel**, **Netlify**, **Cloudflare Pages**, or **GitHub Pages** (`vercel.json` and `_redirects` are included).
