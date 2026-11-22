/**
 * ChromaGlyph Studio — High-Performance Color-True Rendering Engine
 * Modes:
 *  - binary:    0/1 character art mapped by luminance threshold (with optional Bayer 4x4 dithering)
 *  - ascii:     Multi-ramp character art mapped by optical density & real RGB or curated palettes
 *  - dots:      Halftone dot matrix with radius/opacity response and square or hexagonal grids
 *  - aquarelle: Fast multi-pass translucent watercolor washes, pigment bleed, capillary rims & paper grain
 *  - outline:   Color-aware Sobel + 8-way NMS contour extraction with batched vector strokes & #FFFFFF interior
 *
 * Performance optimizations:
 *  - Pooled offscreen scratch canvases (zero per-frame canvas GC churn during slider drags)
 *  - Zero per-dab createRadialGradient allocations in Aquarelle inner loops
 *  - Color-bucketed path batching in Outline mode (1 stroke in Ink mode; ~40-90 batched strokes in RGB)
 *  - AABB spatial culling & font-state caching in 60fps cursor spotlight compositing
 */

export const ASCII_RAMPS = {
  classic: {
    label: 'Classic (@#%*+=-:.)',
    chars: '@#%*+=-:. '
  },
  extended: {
    label: 'Extended 24-Step',
    chars: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. '
  },
  blocks: {
    label: 'Block Shading (█▓▒░)',
    chars: '█▓▒░· '
  },
  geometric: {
    label: 'Geometric (◆◈◉○·)',
    chars: '◆◈◉◎○◌· '
  },
  minimal: {
    label: 'High-Contrast (#+=:.)',
    chars: '#+=:-. '
  }
};

export const COLOR_PALETTES = {
  rgb: { label: 'True RGB (Real Colors)' },
  vibrant: { label: 'Vibrant RGB Boost' },
  mono: { label: 'Clean Monochrome' },
  matrix: { label: 'Matrix Phosphor' },
  amber: { label: 'Amber CRT' },
  cyanotype: { label: 'Cyanotype Blueprint' },
  duotone: { label: 'Cyber Duotone' }
};

export const CANVAS_BACKGROUNDS = {
  obsidian: { label: 'Obsidian', hex: '#06080f', light: false },
  black: { label: 'Pure Black', hex: '#000000', light: false },
  slate: { label: 'Deep Slate', hex: '#141a26', light: false },
  paper: { label: 'Gallery Paper', hex: '#ffffff', light: true },
  warm: { label: 'Warm Cream', hex: '#f7f2e8', light: true }
};

export const DEFAULT_CONFIG = {
  mode: 'ascii',
  cellSize: 10,
  spacing: 1.0,
  contrast: 18,
  brightness: 4,
  saturation: 118,
  background: 'obsidian',
  colorMode: 'rgb',
  invert: false,
  underlayOpacity: 0,
  // Binary specific
  binaryThreshold: 112,
  binaryDither: true,
  // ASCII specific
  asciiRamp: 'classic',
  // Dots specific
  dotStyle: 'brightness',
  dotHexGrid: false,
  dotScale: 0.92,
  // Aquarelle (Watercolor) specific
  aquarelleSoftness: 62,
  aquarellePigment: 92,
  aquarelleDetail: 3,
  aquarellePaperGrain: true,
  // Shape / Hollow Outline specific
  outlineThreshold: 34,
  outlineThickness: 2.2,
  outlineDetail: 3,
  outlineInkStyle: 'rgb',
  // Interactive spotlight
  spotlightMode: 'magnify',
  spotlightRadius: 115
};

const BAYER_4X4 = [
  [0 / 16 - 0.5, 8 / 16 - 0.5, 2 / 16 - 0.5, 10 / 16 - 0.5],
  [12 / 16 - 0.5, 4 / 16 - 0.5, 14 / 16 - 0.5, 6 / 16 - 0.5],
  [3 / 16 - 0.5, 11 / 16 - 0.5, 1 / 16 - 0.5, 9 / 16 - 0.5],
  [15 / 16 - 0.5, 7 / 16 - 0.5, 13 / 16 - 0.5, 5 / 16 - 0.5]
];

// Reusable offscreen scratch canvas pool (avoids per-frame DOM allocations & GC stalls)
const scratchPool = new Map();

function getScratchCanvas(key, w, h) {
  let c = scratchPool.get(key);
  if (!c) {
    c = document.createElement('canvas');
    scratchPool.set(key, c);
  }
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function adjustPixelColor(r, g, b, contrastFactor, brightnessOffset, satFactor) {
  let nr = (r - 128) * contrastFactor + 128 + brightnessOffset;
  let ng = (g - 128) * contrastFactor + 128 + brightnessOffset;
  let nb = (b - 128) * contrastFactor + 128 + brightnessOffset;

  nr = clamp255(nr);
  ng = clamp255(ng);
  nb = clamp255(nb);

  if (satFactor !== 1) {
    const luma = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    nr = clamp255(luma + (nr - luma) * satFactor);
    ng = clamp255(luma + (ng - luma) * satFactor);
    nb = clamp255(luma + (nb - luma) * satFactor);
  }

  return [nr, ng, nb];
}

function mapPaletteColor(r, g, b, lum, palette, isLightBg) {
  const t = lum / 255;
  switch (palette) {
    case 'vibrant': {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return [
        Math.round(clamp255(luma + (r - luma) * 1.42 + 8)),
        Math.round(clamp255(luma + (g - luma) * 1.42 + 8)),
        Math.round(clamp255(luma + (b - luma) * 1.42 + 8))
      ];
    }
    case 'mono': {
      const v = isLightBg ? Math.round(20 + (1 - t) * 40) : Math.round(95 + t * 160);
      return isLightBg ? [v, v + 4, v + 12] : [v, v, v];
    }
    case 'matrix':
      return [Math.round(18 + t * 70), Math.round(95 + t * 160), Math.round(35 + t * 80)];
    case 'amber':
      return [Math.round(130 + t * 125), Math.round(68 + t * 145), Math.round(12 + t * 40)];
    case 'cyanotype':
      return [Math.round(24 + t * 140), Math.round(95 + t * 135), Math.round(150 + t * 105)];
    case 'duotone':
      return [Math.round(98 + t * 146), Math.round(64 + t * 136), Math.round(220 + t * 35)];
    case 'rgb':
    default:
      return [Math.round(r), Math.round(g), Math.round(b)];
  }
}

let cachedPaperPatternCanvas = null;

function getPaperGrainTile() {
  if (cachedPaperPatternCanvas) return cachedPaperPatternCanvas;
  const size = 144;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext('2d');
  const imgData = tctx.createImageData(size, size);
  const d = imgData.data;
  const rand = mulberry32(42197);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const wave = Math.sin(x * 0.19 + y * 0.07) * 6 + Math.cos(y * 0.23 - x * 0.05) * 5;
      const noise = (rand() - 0.5) * 26;
      const shade = clamp255(238 + wave + noise);
      d[idx] = shade;
      d[idx + 1] = clamp255(shade - 2);
      d[idx + 2] = clamp255(shade - 6);
      d[idx + 3] = 28;
    }
  }
  tctx.putImageData(imgData, 0, 0);
  cachedPaperPatternCanvas = tile;
  return tile;
}

function smoothField(srcR, srcG, srcB, w, h, radius) {
  if (radius <= 0) return { r: srcR, g: srcG, b: srcB };
  const len = w * h;
  const tmpR = new Float32Array(len);
  const tmpG = new Float32Array(len);
  const tmpB = new Float32Array(len);
  const outR = new Float32Array(len);
  const outG = new Float32Array(len);
  const outB = new Float32Array(len);

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const x0 = x - radius < 0 ? 0 : x - radius;
      const x1 = x + radius >= w ? w - 1 : x + radius;
      const count = x1 - x0 + 1;
      for (let k = x0; k <= x1; k++) {
        const i = rowOff + k;
        sr += srcR[i];
        sg += srcG[i];
        sb += srcB[i];
      }
      const dst = rowOff + x;
      tmpR[dst] = sr / count;
      tmpG[dst] = sg / count;
      tmpB[dst] = sb / count;
    }
  }

  for (let y = 0; y < h; y++) {
    const y0 = y - radius < 0 ? 0 : y - radius;
    const y1 = y + radius >= h ? h - 1 : y + radius;
    const count = y1 - y0 + 1;
    const dstRow = y * w;
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let k = y0; k <= y1; k++) {
        const i = k * w + x;
        sr += tmpR[i];
        sg += tmpG[i];
        sb += tmpB[i];
      }
      const dst = dstRow + x;
      outR[dst] = sr / count;
      outG[dst] = sg / count;
      outB[dst] = sb / count;
    }
  }

  return { r: outR, g: outG, b: outB };
}

/**
 * High-Speed Aquarelle (Watercolor) Rendering Mode
 * Uses soft bilinear wet-on-wet under-wash + concentric feathered translucent ellipses
 * (zero per-dab radial-gradient allocations) + capillary rims + batched edge accents + paper tooth.
 */
function renderAquarelle(
  source,
  cfg,
  outWidth,
  outHeight,
  scaleMultiplier,
  contrastFactor,
  brightnessOffset,
  satFactor,
  bgSpec,
  options,
  startTime
) {
  const baseCanvas = options.targetCanvas || document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  const paperHex = bgSpec.hex;
  ctx.fillStyle = paperHex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  const softnessNorm = Math.max(0, Math.min(1, (cfg.aquarelleSoftness - 20) / 80));
  const pigmentNorm = Math.max(0.35, Math.min(1.5, cfg.aquarellePigment / 100));
  const detailLevel = Math.max(1, Math.min(5, Math.round(cfg.aquarelleDetail)));

  const toWatercolorRGB = (rawR, rawG, rawB) => {
    const [ar, ag, ab] = adjustPixelColor(
      rawR,
      rawG,
      rawB,
      contrastFactor,
      brightnessOffset,
      satFactor
    );
    const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
    let [cr, cg, cb] = mapPaletteColor(ar, ag, ab, lum, cfg.colorMode, bgSpec.light);

    if (bgSpec.light) {
      const lift = 22 + softnessNorm * 14;
      const luma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      const chromaBoost = 1.12 + pigmentNorm * 0.12;
      cr = clamp255(lift + (luma + (cr - luma) * chromaBoost) * 0.9);
      cg = clamp255(lift + (luma + (cg - luma) * chromaBoost) * 0.9);
      cb = clamp255(lift + (luma + (cb - luma) * chromaBoost) * 0.92);
    }
    return [Math.round(cr), Math.round(cg), Math.round(cb), lum];
  };

  // Pass 0: Wet-on-wet atmospheric under-wash
  const underScale = 10 + softnessNorm * 16;
  const underW = Math.max(44, Math.round(outWidth / underScale));
  const underH = Math.max(32, Math.round(outHeight / underScale));
  const underCanvas = getScratchCanvas('aq-under', underW, underH);
  const uctx = underCanvas.getContext('2d', { willReadFrequently: true });
  uctx.imageSmoothingEnabled = true;
  uctx.imageSmoothingQuality = 'high';
  uctx.drawImage(source, 0, 0, underW, underH);
  const uData = uctx.getImageData(0, 0, underW, underH);

  for (let i = 0; i < uData.data.length; i += 4) {
    const [cr, cg, cb, lum] = toWatercolorRGB(uData.data[i], uData.data[i + 1], uData.data[i + 2]);
    uData.data[i] = cr;
    uData.data[i + 1] = cg;
    uData.data[i + 2] = cb;
    if (bgSpec.light && lum > 225) {
      uData.data[i + 3] = Math.round(((255 - lum) / 30) * 200);
    }
  }
  uctx.putImageData(uData, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = Math.min(0.88, 0.44 + pigmentNorm * 0.28);
  ctx.drawImage(underCanvas, 0, 0, outWidth, outHeight);
  ctx.restore();

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  const rand = mulberry32(133791);
  const cells = options.skipCells ? null : [];

  // Two fast, expressive painterly passes (strictly capped grid budget so every frame stays < 25ms)
  const baseTargetCols = Math.round(16 + detailLevel * 5 + Math.max(0, 14 - cfg.cellSize) * 0.8);
  const passes = [
    {
      cols: Math.max(12, Math.round(baseTargetCols * 0.62)),
      radiusMul: 1.2 + softnessNorm * 0.78,
      alpha: Math.min(0.34, 0.14 * pigmentNorm + 0.08),
      drawRim: false,
      recordCells: false
    },
    {
      cols: Math.min(44, Math.max(18, baseTargetCols)),
      radiusMul: 0.88 + softnessNorm * 0.48,
      alpha: Math.min(0.42, 0.18 * pigmentNorm + 0.1),
      drawRim: true,
      recordCells: true
    }
  ];

  let finalCols = 0;
  let finalRows = 0;
  const aspect = outHeight / outWidth;

  for (let pIdx = 0; pIdx < passes.length; pIdx++) {
    const pass = passes[pIdx];
    const cols = Math.max(10, Math.round(pass.cols / Math.max(0.75, cfg.spacing)));
    const rows = Math.max(8, Math.round(cols * aspect));
    const stepX = outWidth / cols;
    const stepY = outHeight / rows;
    const avgStep = (stepX + stepY) * 0.5;

    if (pIdx === 1) {
      finalCols = cols;
      finalRows = rows;
    }

    const sCanvas = getScratchCanvas(`aq-pass-${pIdx}`, cols, rows);
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, 0, 0, cols, rows);
    const data = sCtx.getImageData(0, 0, cols, rows).data;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = (row * cols + col) * 4;
        if (data[idx + 3] < 16) continue;

        const [cr, cg, cb, lum] = toWatercolorRGB(data[idx], data[idx + 1], data[idx + 2]);
        if (bgSpec.light && lum > 240 && pIdx > 0) continue;

        const jitterX = (rand() - 0.5) * stepX * (0.5 + softnessNorm * 0.32);
        const jitterY = (rand() - 0.5) * stepY * (0.5 + softnessNorm * 0.32);
        const cx = (col + 0.5) * stepX + jitterX;
        const cy = (row + 0.5) * stepY + jitterY;
        const r = avgStep * pass.radiusMul * (0.8 + rand() * 0.42);
        const scaleX = 0.78 + rand() * 0.46;
        const scaleY = 0.78 + rand() * 0.46;
        const rot = rand() * Math.PI;
        const rx = r * scaleX;
        const ry = r * scaleY;

        const coreAlpha = Math.min(
          0.56,
          pass.alpha * (cfg.invert ? 0.65 + (lum / 255) * 0.45 : 0.8 + (1 - lum / 255) * 0.25)
        );

        // Outer soft bleed halo (feathered edge without gradient shader allocation)
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(coreAlpha * 0.38).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();

        // Inner pigment wash body
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(coreAlpha * 0.72).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(cx + jitterX * 0.14, cy + jitterY * 0.14, rx * 0.66, ry * 0.66, rot, 0, Math.PI * 2);
        ctx.fill();

        // Subtle capillary drying rim
        if (pass.drawRim && rand() > 0.54) {
          ctx.strokeStyle = `rgba(${Math.round(cr * 0.76)},${Math.round(cg * 0.76)},${Math.round(cb * 0.76)},${(coreAlpha * 0.36).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, 1.2 * scaleMultiplier);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 0.84, ry * 0.84, rot, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (pass.recordCells && cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: coreAlpha, radius: r * 0.52 });
        }
      }
    }
    ctx.restore();
  }

  // Pass 3: Lightweight watercolor edge accents along major contours
  const edgeW = Math.min(180, Math.max(96, Math.round(outWidth / (6.5 - detailLevel * 0.65))));
  const edgeH = Math.max(60, Math.round(edgeW * aspect));
  const eCanvas = getScratchCanvas('aq-edge', edgeW, edgeH);
  const eCtx = eCanvas.getContext('2d', { willReadFrequently: true });
  eCtx.drawImage(source, 0, 0, edgeW, edgeH);
  const ePixels = eCtx.getImageData(0, 0, edgeW, edgeH).data;
  const eLum = new Float32Array(edgeW * edgeH);

  for (let i = 0; i < edgeW * edgeH; i++) {
    const p = i * 4;
    const [ar, ag, ab] = adjustPixelColor(
      ePixels[p],
      ePixels[p + 1],
      ePixels[p + 2],
      contrastFactor,
      brightnessOffset,
      satFactor
    );
    eLum[i] = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
  }

  const sx = outWidth / edgeW;
  const sy = outHeight / edgeH;
  const edgeCutoff = 50 - detailLevel * 5;
  const rad = Math.max(1.3, (1.6 + softnessNorm * 1.4) * scaleMultiplier);
  const edgeAlpha = Math.min(0.26, 0.14 * pigmentNorm).toFixed(3);
  const edgeBuckets = new Map();

  for (let y = 1; y < edgeH - 1; y++) {
    const rowOff = y * edgeW;
    for (let x = 1; x < edgeW - 1; x++) {
      const i = rowOff + x;
      const gx =
        -eLum[i - edgeW - 1] + eLum[i - edgeW + 1] -
        2 * eLum[i - 1] + 2 * eLum[i + 1] -
        eLum[i + edgeW - 1] + eLum[i + edgeW + 1];
      const gy =
        -eLum[i - edgeW - 1] - 2 * eLum[i - edgeW] - eLum[i - edgeW + 1] +
        eLum[i + edgeW - 1] + 2 * eLum[i + edgeW] + eLum[i + edgeW + 1];
      const mag = Math.sqrt(gx * gx + gy * gy) * 0.25;
      if (mag < edgeCutoff) continue;

      const p = i * 4;
      const [cr, cg, cb] = toWatercolorRGB(ePixels[p], ePixels[p + 1], ePixels[p + 2]);
      const qr = Math.round(cr * 0.72) & 0xe0;
      const qg = Math.round(cg * 0.72) & 0xe0;
      const qb = Math.round(cb * 0.72) & 0xe0;
      const key = (qr << 16) | (qg << 8) | qb;
      let pts = edgeBuckets.get(key);
      if (!pts) {
        pts = [];
        edgeBuckets.set(key, pts);
      }
      pts.push((x + 0.5) * sx, (y + 0.5) * sy);
    }
  }

  ctx.save();
  for (const [key, pts] of edgeBuckets) {
    const r = (key >> 16) & 255;
    const g = (key >> 8) & 255;
    const b = key & 255;
    ctx.fillStyle = `rgba(${r},${g},${b},${edgeAlpha})`;
    ctx.beginPath();
    for (let k = 0; k < pts.length; k += 2) {
      const px = pts[k];
      const py = pts[k + 1];
      ctx.moveTo(px + rad, py);
      ctx.arc(px, py, rad, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();

  // Pass 4: Cold-press watercolor paper grain texture overlay
  if (cfg.aquarellePaperGrain) {
    ctx.save();
    const pattern = ctx.createPattern(getPaperGrainTile(), 'repeat');
    if (pattern) {
      ctx.globalCompositeOperation = bgSpec.light ? 'multiply' : 'overlay';
      ctx.globalAlpha = bgSpec.light ? 0.52 : 0.26;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, outWidth, outHeight);
    }
    ctx.restore();
  }

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    baseCanvas,
    cells,
    cols: finalCols,
    rows: finalRows,
    width: outWidth,
    height: outHeight,
    fontSize: Math.round(cfg.cellSize * scaleMultiplier),
    stepX: Math.round(outWidth / Math.max(1, finalCols)),
    stepY: Math.round(outHeight / Math.max(1, finalRows)),
    bgHex: paperHex,
    renderMs,
    textOutput: ''
  };
}

/**
 * High-Speed Shape / Hollow Outline Rendering Mode
 * Detects main shapes, contours, and silhouettes via color-aware Sobel + corrected 8-way NMS,
 * batching connected contour segments by color bucket over a pure white (#FFFFFF) interior.
 */
function renderOutline(
  source,
  cfg,
  outWidth,
  outHeight,
  scaleMultiplier,
  contrastFactor,
  brightnessOffset,
  satFactor,
  bgSpec,
  options,
  startTime
) {
  const baseCanvas = options.targetCanvas || document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  const interiorHex = cfg.background === 'warm' ? '#faf8f4' : '#ffffff';
  ctx.fillStyle = interiorHex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity * 0.45;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  const detail = Math.max(1, Math.min(5, Math.round(cfg.outlineDetail)));
  const targetMaxW = 160 + detail * 55; // 215px..435px (fast & crisp silhouettes)
  const w = Math.min(outWidth, targetMaxW);
  const h = Math.max(60, Math.round((w * outHeight) / outWidth));

  const sCanvas = getScratchCanvas('outline-src', w, h);
  const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
  sCtx.imageSmoothingEnabled = true;
  sCtx.imageSmoothingQuality = 'high';
  sCtx.drawImage(source, 0, 0, w, h);
  const raw = sCtx.getImageData(0, 0, w, h).data;

  const len = w * h;
  const rawR = new Float32Array(len);
  const rawG = new Float32Array(len);
  const rawB = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const p = i * 4;
    const [ar, ag, ab] = adjustPixelColor(
      raw[p],
      raw[p + 1],
      raw[p + 2],
      contrastFactor,
      brightnessOffset,
      satFactor
    );
    rawR[i] = ar;
    rawG[i] = ag;
    rawB[i] = ab;
  }

  const smoothRadius = detail <= 2 ? 2 : detail <= 4 ? 1 : 0;
  const { r: fR, g: fG, b: fB } = smoothField(rawR, rawG, rawB, w, h, smoothRadius);
  const fL = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    fL[i] = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
  }

  const mag = new Float32Array(len);
  const dir = new Uint8Array(len);
  const hist = new Uint32Array(256);

  const sobelAt = (arr, i) => {
    const gx =
      -arr[i - w - 1] + arr[i - w + 1] -
      2 * arr[i - 1] + 2 * arr[i + 1] -
      arr[i + w - 1] + arr[i + w + 1];
    const gy =
      -arr[i - w - 1] - 2 * arr[i - w] - arr[i - w + 1] +
      arr[i + w - 1] + 2 * arr[i + w] + arr[i + w + 1];
    return [gx, gy, Math.sqrt(gx * gx + gy * gy) * 0.25];
  };

  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const [gxL, gyL, mL] = sobelAt(fL, i);
      const [gxR, gyR, mR] = sobelAt(fR, i);
      const [gxG, gyG, mG] = sobelAt(fG, i);
      const [gxB, gyB, mB] = sobelAt(fB, i);

      let bestM = mL;
      let bestGx = gxL;
      let bestGy = gyL;

      if (mR * 0.92 > bestM) { bestM = mR * 0.92; bestGx = gxR; bestGy = gyR; }
      if (mG * 0.92 > bestM) { bestM = mG * 0.92; bestGx = gxG; bestGy = gyG; }
      if (mB * 0.92 > bestM) { bestM = mB * 0.92; bestGx = gxB; bestGy = gyB; }

      mag[i] = bestM;
      hist[bestM >= 255 ? 255 : bestM | 0]++;

      let angle = (Math.atan2(bestGy, bestGx) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      if (angle < 22.5 || angle >= 157.5) dir[i] = 0;
      else if (angle < 67.5) dir[i] = 1;
      else if (angle < 112.5) dir[i] = 2;
      else dir[i] = 3;
    }
  }

  const totalInner = (w - 2) * (h - 2);
  let acc = 0;
  let p97 = 45;
  const target97 = totalInner * 0.97;
  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (acc >= target97) {
      p97 = Math.max(18, b);
      break;
    }
  }

  const sliderNorm = Math.max(0.05, Math.min(0.95, cfg.outlineThreshold / 100));
  const threshold = Math.max(7, p97 * (0.22 + sliderNorm * 0.95));
  const softFloor = threshold * 0.48;

  const edgeStrength = new Float32Array(len);
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const m = mag[i];
      if (m < softFloor) continue;

      let n1 = 0;
      let n2 = 0;
      const d = dir[i];
      if (d === 0) {
        n1 = mag[i - 1];
        n2 = mag[i + 1];
      } else if (d === 1) {
        n1 = mag[i - w - 1];
        n2 = mag[i + w + 1];
      } else if (d === 2) {
        n1 = mag[i - w];
        n2 = mag[i + w];
      } else {
        n1 = mag[i - w + 1];
        n2 = mag[i + w - 1];
      }

      if (m < n1 || m < n2) continue;
      edgeStrength[i] = m;
    }
  }

  const active = new Uint8Array(len);
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const m = edgeStrength[i];
      if (m <= 0) continue;
      if (
        m >= threshold ||
        edgeStrength[i - w - 1] >= threshold || edgeStrength[i - w] >= threshold || edgeStrength[i - w + 1] >= threshold ||
        edgeStrength[i - 1] >= threshold || edgeStrength[i + 1] >= threshold ||
        edgeStrength[i + w - 1] >= threshold || edgeStrength[i + w] >= threshold || edgeStrength[i + w + 1] >= threshold
      ) {
        active[i] = 1;
      }
    }
  }

  const getContourColor = (i) => {
    if (cfg.outlineInkStyle === 'ink') {
      return [15, 23, 42];
    }
    if (cfg.outlineInkStyle === 'palette') {
      const [pr, pg, pb] = mapPaletteColor(fR[i], fG[i], fB[i], fL[i], cfg.colorMode, true);
      return [Math.round(pr * 0.68), Math.round(pg * 0.68), Math.round(pb * 0.68)];
    }
    const lum = fL[i];
    const darken = lum > 175 ? 0.52 : lum > 120 ? 0.68 : 0.85;
    const luma = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
    const sr = clamp255(luma + (fR[i] - luma) * 1.35);
    const sg = clamp255(luma + (fG[i] - luma) * 1.35);
    const sb = clamp255(luma + (fB[i] - luma) * 1.35);
    return [
      Math.round(clamp255(sr * darken)),
      Math.round(clamp255(sg * darken)),
      Math.round(clamp255(sb * darken))
    ];
  };

  // Batch connected contour segments into color buckets -> ~1 to 90 stroke() calls instead of 6,000+
  const sx = outWidth / w;
  const sy = outHeight / h;
  const strokeWidth = Math.max(1.0, cfg.outlineThickness * scaleMultiplier);
  const cells = options.skipCells ? null : [];
  let contourCount = 0;

  const segBuckets = new Map();
  const dotBuckets = new Map();
  const forwardOffsets = [
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1]
  ];

  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      if (!active[i]) continue;

      contourCount++;
      const [cr, cg, cb] = getContourColor(i);
      // Quantize RGB into 16-step buckets for batched vector strokes (single bucket in Ink mode)
      const qr = cfg.outlineInkStyle === 'ink' ? 15 : cr & 0xf0;
      const qg = cfg.outlineInkStyle === 'ink' ? 23 : cg & 0xf0;
      const qb = cfg.outlineInkStyle === 'ink' ? 42 : cb & 0xf0;
      const colorKey = (qr << 16) | (qg << 8) | qb;

      const cx = (x + 0.5) * sx;
      const cy = (y + 0.5) * sy;
      let connected = false;

      for (let k = 0; k < 4; k++) {
        const nx = x + forwardOffsets[k][0];
        const ny = y + forwardOffsets[k][1];
        const ni = ny * w + nx;
        if (active[ni]) {
          connected = true;
          let segs = segBuckets.get(colorKey);
          if (!segs) {
            segs = [];
            segBuckets.set(colorKey, segs);
          }
          segs.push(cx, cy, (nx + 0.5) * sx, (ny + 0.5) * sy);
        }
      }

      if (!connected) {
        let dots = dotBuckets.get(colorKey);
        if (!dots) {
          dots = [];
          dotBuckets.set(colorKey, dots);
        }
        dots.push(cx, cy);
      }

      if (cells && (contourCount % 3 === 0 || detail <= 2)) {
        cells.push({ cx, cy, r: cr, g: cg, b: cb, lum: fL[i], char: '', alpha: 0.92, radius: strokeWidth * 0.6 });
      }
    }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidth;

  for (const [colorKey, segs] of segBuckets) {
    const r = (colorKey >> 16) & 255;
    const g = (colorKey >> 8) & 255;
    const b = colorKey & 255;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    for (let k = 0; k < segs.length; k += 4) {
      ctx.moveTo(segs[k], segs[k + 1]);
      ctx.lineTo(segs[k + 2], segs[k + 3]);
    }
    ctx.stroke();
  }

  const dotR = strokeWidth * 0.5;
  for (const [colorKey, dots] of dotBuckets) {
    const r = (colorKey >> 16) & 255;
    const g = (colorKey >> 8) & 255;
    const b = colorKey & 255;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    for (let k = 0; k < dots.length; k += 2) {
      ctx.moveTo(dots[k] + dotR, dots[k + 1]);
      ctx.arc(dots[k], dots[k + 1], dotR, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    baseCanvas,
    cells,
    cols: w,
    rows: h,
    width: outWidth,
    height: outHeight,
    fontSize: Math.round(strokeWidth * 4),
    stepX: sx,
    stepY: sy,
    bgHex: interiorHex,
    renderMs,
    textOutput: ''
  };
}

/**
 * Computes the artwork onto an offscreen base canvas and returns cell metadata
 * for fast 60fps spotlight interaction and text export.
 */
export function renderArtwork(source, config, options = {}) {
  const startTime = performance.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const srcWidth = source.naturalWidth || source.width || 960;
  const srcHeight = source.naturalHeight || source.height || 720;
  const maxDim = options.maxDimension || 920;

  let outWidth = srcWidth;
  let outHeight = srcHeight;
  if (Math.max(outWidth, outHeight) > maxDim) {
    const scale = maxDim / Math.max(outWidth, outHeight);
    outWidth = Math.round(outWidth * scale);
    outHeight = Math.round(outHeight * scale);
  }
  const scaleMultiplier = options.exportScale || 1;
  outWidth = Math.max(240, Math.round(outWidth * scaleMultiplier));
  outHeight = Math.max(180, Math.round(outHeight * scaleMultiplier));

  const bgSpec = CANVAS_BACKGROUNDS[cfg.background] || CANVAS_BACKGROUNDS.obsidian;
  const cVal = cfg.contrast * 2.55;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const brightnessOffset = cfg.brightness * 2.1;
  const satFactor = cfg.saturation / 100;

  if (cfg.mode === 'aquarelle') {
    return renderAquarelle(
      source,
      cfg,
      outWidth,
      outHeight,
      scaleMultiplier,
      contrastFactor,
      brightnessOffset,
      satFactor,
      bgSpec,
      options,
      startTime
    );
  }

  if (cfg.mode === 'outline') {
    return renderOutline(
      source,
      cfg,
      outWidth,
      outHeight,
      scaleMultiplier,
      contrastFactor,
      brightnessOffset,
      satFactor,
      bgSpec,
      options,
      startTime
    );
  }

  // Matrix Modes: Binary, ASCII, and Dots / Halftone
  const cellSize = Math.max(4, Math.round(cfg.cellSize * scaleMultiplier));
  const stepX = Math.max(4, Math.round(cellSize * cfg.spacing));
  const stepY =
    cfg.mode === 'dots'
      ? stepX
      : Math.max(4, Math.round(cellSize * cfg.spacing * 1.05));

  const cols = Math.max(8, Math.floor(outWidth / stepX));
  const rows = Math.max(6, Math.floor(outHeight / stepY));

  const sampleCanvas = getScratchCanvas('matrix-sample', cols, rows);
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(source, 0, 0, cols, rows);
  const pixelData = sampleCtx.getImageData(0, 0, cols, rows).data;

  const baseCanvas = options.targetCanvas || document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  ctx.fillStyle = bgSpec.hex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  const rampStr = (ASCII_RAMPS[cfg.asciiRamp] || ASCII_RAMPS.classic).chars;
  const rampLen = rampStr.length;

  const fontSize = Math.max(5, Math.round(cellSize * 1.08));
  if (cfg.mode !== 'dots') {
    ctx.font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }

  const offsetX = Math.floor((outWidth - cols * stepX) / 2);
  const offsetY = Math.floor((outHeight - rows * stepY) / 2);

  const cells = options.skipCells ? null : [];
  const textLines = options.includeText ? [] : null;

  for (let row = 0; row < rows; row++) {
    let lineStr = '';
    const hexShift = cfg.mode === 'dots' && cfg.dotHexGrid && row % 2 === 1 ? stepX * 0.5 : 0;

    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4;
      const rawR = pixelData[idx];
      const rawG = pixelData[idx + 1];
      const rawB = pixelData[idx + 2];
      const alpha = pixelData[idx + 3] / 255;

      if (alpha < 0.05) {
        if (textLines) lineStr += ' ';
        continue;
      }

      const [ar, ag, ab] = adjustPixelColor(
        rawR,
        rawG,
        rawB,
        contrastFactor,
        brightnessOffset,
        satFactor
      );

      const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      const [cr, cg, cb] = mapPaletteColor(ar, ag, ab, lum, cfg.colorMode, bgSpec.light);

      const cx = offsetX + col * stepX + stepX * 0.5 + hexShift;
      const cy = offsetY + row * stepY + stepY * 0.5;
      if (cx > outWidth + stepX) continue;

      if (cfg.mode === 'binary') {
        const ditherBias = cfg.binaryDither ? BAYER_4X4[row & 3][col & 3] * 64 : 0;
        const effectiveLum = lum + ditherBias;
        let bit = effectiveLum >= cfg.binaryThreshold ? '1' : '0';
        if (cfg.invert) {
          bit = bit === '1' ? '0' : '1';
        }

        const bitAlpha = bit === '1' ? 0.98 : bgSpec.light ? 0.42 : 0.36;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${bitAlpha.toFixed(2)})`;
        ctx.fillText(bit, cx, cy);

        if (textLines) lineStr += bit;
        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: bit, alpha: bitAlpha, radius: 0 });
        }
      } else if (cfg.mode === 'ascii') {
        let norm = lum / 255;
        const shouldInvert = bgSpec.light ? !cfg.invert : cfg.invert;
        if (!shouldInvert) {
          norm = 1 - norm;
        }
        const charIndex = Math.min(rampLen - 1, Math.max(0, Math.floor(norm * (rampLen - 1))));
        const ch = rampStr[charIndex];

        if (ch !== ' ') {
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          ctx.fillText(ch, cx, cy);
        }

        if (textLines) lineStr += ch;
        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: ch, alpha: 1, radius: 0 });
        }
      } else {
        const normLum = lum / 255;
        const maxRadius = (Math.min(stepX, stepY) * 0.52) * cfg.dotScale;
        let radius = maxRadius;
        let dotAlpha = 1;

        if (cfg.dotStyle === 'brightness') {
          const factor = cfg.invert ? 1 - normLum : normLum;
          radius = maxRadius * (0.14 + 0.86 * Math.pow(factor, 0.85));
          dotAlpha = 0.28 + 0.72 * factor;
        } else if (cfg.dotStyle === 'darkness') {
          const factor = cfg.invert ? normLum : 1 - normLum;
          radius = maxRadius * (0.12 + 0.88 * Math.pow(factor, 0.85));
          dotAlpha = 0.3 + 0.7 * factor;
        } else {
          const factor = cfg.invert ? 1 - normLum : normLum;
          radius = maxRadius * (0.28 + 0.72 * factor);
          dotAlpha = 0.12 + 0.88 * Math.pow(factor, 1.15);
        }

        if (radius > 0.35) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${dotAlpha.toFixed(3)})`;
          ctx.fill();
        }

        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: dotAlpha, radius });
        }
      }
    }

    if (textLines) {
      textLines.push(lineStr);
    }
  }

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));

  return {
    baseCanvas,
    cells,
    cols,
    rows,
    width: outWidth,
    height: outHeight,
    fontSize,
    stepX,
    stepY,
    bgHex: bgSpec.hex,
    renderMs,
    textOutput: textLines ? textLines.join('\n') : ''
  };
}

/**
 * Composites the cached base render plus the interactive cursor spotlight effect at 60fps.
 * Uses AABB pre-filtering and font-size caching to avoid per-frame DOM/GC stalls.
 */
export function compositeWithSpotlight(displayCanvas, renderResult, sourceImage, config, pointer) {
  const ctx = displayCanvas.getContext('2d');
  if (displayCanvas.width !== renderResult.width || displayCanvas.height !== renderResult.height) {
    displayCanvas.width = renderResult.width;
    displayCanvas.height = renderResult.height;
  }

  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  ctx.drawImage(renderResult.baseCanvas, 0, 0);

  if (!pointer || !pointer.active || config.spotlightMode === 'off') {
    return;
  }

  const { x, y } = pointer;
  const radius = config.spotlightRadius || 115;

  if (config.spotlightMode === 'reveal' && sourceImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sourceImage, 0, 0, displayCanvas.width, displayCanvas.height);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (config.spotlightMode === 'glow') {
    ctx.save();
    ctx.globalCompositeOperation = config.mode === 'outline' ? 'multiply' : 'lighter';
    const glow = ctx.createRadialGradient(x, y, 4, x, y, radius * 1.25);
    if (config.mode === 'outline') {
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
      glow.addColorStop(0.55, 'rgba(167, 139, 250, 0.1)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
      glow.addColorStop(0.48, 'rgba(167, 139, 250, 0.16)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (!renderResult.cells) return;
  const r2 = radius * radius;
  const cells = renderResult.cells;
  const minX = x - radius;
  const maxX = x + radius;
  const minY = y - radius;
  const maxY = y + radius;

  if (config.mode === 'aquarelle') {
    // Fast translucent wet-bloom circles (zero per-cell radial gradient allocations on mousemove)
    ctx.save();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.cx < minX || cell.cx > maxX || cell.cy < minY || cell.cy > maxY) continue;
      const dx = cell.cx - x;
      const dy = cell.cy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const t = 1 - Math.sqrt(dist2) / radius;
      const smooth = t * t * (3 - 2 * t);
      const bloomR = Math.max(4, cell.radius * (1 + smooth * 0.5));
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${(smooth * 0.2).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, bloomR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (config.mode === 'outline') {
    ctx.save();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.cx < minX || cell.cx > maxX || cell.cy < minY || cell.cy > maxY) continue;
      const dx = cell.cx - x;
      const dy = cell.cy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const t = 1 - Math.sqrt(dist2) / radius;
      const smooth = t * t * (3 - 2 * t);
      const scaledR = Math.max(1.1, cell.radius * (1 + smooth * 0.9));
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${Math.min(1, cell.alpha + smooth * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, scaledR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  const clearGrad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
  clearGrad.addColorStop(0, renderResult.bgHex);
  clearGrad.addColorStop(0.75, renderResult.bgHex);
  clearGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = clearGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let lastFontSize = -1;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.cx < minX || cell.cx > maxX || cell.cy < minY || cell.cy > maxY) continue;
    const dx = cell.cx - x;
    const dy = cell.cy - y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > r2) continue;

    const dist = Math.sqrt(dist2);
    const t = 1 - dist / radius;
    const smooth = t * t * (3 - 2 * t);

    const push = smooth * 7;
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : 0;
    const px = cell.cx + nx * push;
    const py = cell.cy + ny * push;

    const boost = Math.round(smooth * 68);
    const br = clamp255(cell.r + boost);
    const bg = clamp255(cell.g + boost);
    const bb = clamp255(cell.b + boost);

    if (config.mode === 'dots') {
      const scaledR = Math.max(1.2, cell.radius * (1 + smooth * 0.45));
      ctx.beginPath();
      ctx.arc(px, py, scaledR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, cell.alpha + smooth * 0.35).toFixed(3)})`;
      ctx.fill();
    } else if (cell.char && cell.char !== ' ') {
      const scaledFont = Math.round(renderResult.fontSize * (1 + smooth * 0.42));
      if (scaledFont !== lastFontSize) {
        ctx.font = `700 ${scaledFont}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        lastFontSize = scaledFont;
      }
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, cell.alpha + smooth * 0.45).toFixed(3)})`;
      ctx.fillText(cell.char, px, py);
    }
  }

  ctx.restore();
}
