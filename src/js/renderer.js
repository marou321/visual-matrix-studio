/**
 * ChromaGlyph Studio — Non-Blocking, Freeze-Proof Rendering Engine
 * Modes:
 *  - binary:    0/1 character art mapped by luminance threshold (with optional Bayer 4x4 dithering)
 *  - ascii:     Multi-ramp character art mapped by optical density & real RGB or curated palettes
 *  - dots:      Halftone dot matrix with radius/opacity response and square or hexagonal grids
 *  - aquarelle: Direct-pixel wet-on-wet watercolor wash + paper grain + <=280 soft pigment blooms
 *  - outline:   Cached color-aware Sobel + 8-way NMS + direct ImageData contour stamping over #FFFFFF interior
 *
 * Anti-freeze architecture:
 *  - Intermediate pixel/edge caching for Aquarelle & Outline (dragging sliders reuses cached buffers in <4ms)
 *  - Direct ImageData rendering for Outline & Aquarelle base (zero Skia giant compound-path tessellation freezes)
 *  - Hard cell budgets for Binary, ASCII, and Dots modes
 *  - Pooled offscreen scratch canvases & AABB-culled 60fps cursor spotlight
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

// Reusable offscreen scratch canvas pool
const scratchPool = new Map();

function getScratchCanvas(key, w, h) {
  let c = scratchPool.get(key);
  if (!c) {
    c = document.createElement('canvas');
    scratchPool.set(key, c);
  }
  const safeW = Math.max(1, w | 0);
  const safeH = Math.max(1, h | 0);
  if (c.width !== safeW) c.width = safeW;
  if (c.height !== safeH) c.height = safeH;
  return c;
}

// Single-slot intermediate caches for Aquarelle & Outline so slider drags never recompute source pixel/edge passes
let outlineEdgeCache = null;
let aquarelleSourceCache = null;

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
      const inv = 1 / (x1 - x0 + 1);
      for (let k = x0; k <= x1; k++) {
        const i = rowOff + k;
        sr += srcR[i];
        sg += srcG[i];
        sb += srcB[i];
      }
      const dst = rowOff + x;
      tmpR[dst] = sr * inv;
      tmpG[dst] = sg * inv;
      tmpB[dst] = sb * inv;
    }
  }

  for (let y = 0; y < h; y++) {
    const y0 = y - radius < 0 ? 0 : y - radius;
    const y1 = y + radius >= h ? h - 1 : y + radius;
    const inv = 1 / (y1 - y0 + 1);
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
      outR[dst] = sr * inv;
      outG[dst] = sg * inv;
      outB[dst] = sb * inv;
    }
  }

  return { r: outR, g: outG, b: outB };
}

// Fast deterministic paper tooth noise table (64x64 tiled via bitwise mask — zero allocations)
const PAPER_NOISE_64 = (() => {
  const arr = new Int8Array(64 * 64);
  const rand = mulberry32(42197);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const wave = Math.sin(x * 0.29 + y * 0.1) * 4 + Math.cos(y * 0.31 - x * 0.08) * 3;
      arr[(y << 6) | x] = Math.round(wave + (rand() - 0.5) * 14);
    }
  }
  return arr;
})();

/**
 * Non-Blocking Aquarelle (Watercolor) Rendering Mode
 * Stage 1: Direct ImageData wet-on-wet wash + pigment pooling along edges + paper grain (1 drawImage)
 * Stage 2: Strictly bounded (<= 240) lightweight translucent circular pigment blooms (zero giant paths)
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

  const softnessNorm = Math.max(0, Math.min(1, (cfg.aquarelleSoftness - 20) / 80));
  const pigmentNorm = Math.max(0.35, Math.min(1.5, cfg.aquarellePigment / 100));
  const detailLevel = Math.max(1, Math.min(5, Math.round(cfg.aquarelleDetail)));
  const isDraft = Boolean(options.isDraft);

  // Bounded working buffer for direct-pixel watercolor wash & paper tooth
  const aspect = outHeight / outWidth;
  const washMaxW = isDraft ? 140 : options.exportScale > 1 ? 320 : 220;
  const w = Math.max(64, Math.min(washMaxW, Math.round(90 + detailLevel * 32 - softnessNorm * 36)));
  const h = Math.max(48, Math.round(w * aspect));

  // Cache sampled raw pixels per (source, w, h) so dragging watercolor sliders skips getImageData
  let rawPixels;
  if (
    aquarelleSourceCache &&
    aquarelleSourceCache.source === source &&
    aquarelleSourceCache.w === w &&
    aquarelleSourceCache.h === h
  ) {
    rawPixels = aquarelleSourceCache.raw;
  } else {
    const sCanvas = getScratchCanvas('aq-raw', w, h);
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, 0, 0, w, h);
    rawPixels = new Uint8ClampedArray(sCtx.getImageData(0, 0, w, h).data);
    aquarelleSourceCache = { source, w, h, raw: rawPixels };
  }

  const len = w * h;
  const srcR = new Float32Array(len);
  const srcG = new Float32Array(len);
  const srcB = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    const p = i * 4;
    const [ar, ag, ab] = adjustPixelColor(
      rawPixels[p],
      rawPixels[p + 1],
      rawPixels[p + 2],
      contrastFactor,
      brightnessOffset,
      satFactor
    );
    const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
    const [cr, cg, cb] = mapPaletteColor(ar, ag, ab, lum, cfg.colorMode, bgSpec.light);
    srcR[i] = cr;
    srcG[i] = cg;
    srcB[i] = cb;
  }

  // Soft wet-on-wet bleed blur controlled by Wash Softness slider
  const blurRadius = softnessNorm > 0.65 ? 2 : softnessNorm > 0.25 ? 1 : 0;
  const { r: wR, g: wG, b: wB } = smoothField(srcR, srcG, srcB, w, h, blurRadius);

  // Paper base RGB
  const paperR = bgSpec.hex === '#f7f2e8' ? 247 : bgSpec.light ? 255 : 10;
  const paperG = bgSpec.hex === '#f7f2e8' ? 242 : bgSpec.light ? 255 : 14;
  const paperB = bgSpec.hex === '#f7f2e8' ? 232 : bgSpec.light ? 255 : 22;

  const washCanvas = getScratchCanvas('aq-wash', w, h);
  const wCtx = washCanvas.getContext('2d');
  const outImg = wCtx.createImageData(w, h);
  const outD = outImg.data;
  const washBlend = Math.min(0.95, 0.45 + pigmentNorm * 0.36);
  const paperLift = bgSpec.light ? 20 + softnessNorm * 16 : 0;
  const chromaBoost = 1.1 + pigmentNorm * 0.14;
  const useGrain = cfg.aquarellePaperGrain;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    const ny = (y & 63) << 6;
    for (let x = 0; x < w; x++) {
      const i = rowOff + x;
      let r = wR[i];
      let g = wG[i];
      let b = wB[i];

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = clamp255(paperLift + (luma + (r - luma) * chromaBoost) * (bgSpec.light ? 0.9 : 1));
      g = clamp255(paperLift + (luma + (g - luma) * chromaBoost) * (bgSpec.light ? 0.9 : 1));
      b = clamp255(paperLift + (luma + (b - luma) * chromaBoost) * (bgSpec.light ? 0.92 : 1));

      // Capillary pigment pooling along tonal transitions (fast 4-neighbor gradient — zero draw calls!)
      let edgeDarken = 1;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const dl =
          Math.abs(wR[i + 1] - wR[i - 1]) +
          Math.abs(wR[i + w] - wR[i - w]) +
          Math.abs(wG[i + 1] - wG[i - 1]) +
          Math.abs(wG[i + w] - wG[i - w]);
        if (dl > 55) {
          edgeDarken = Math.max(0.74, 1 - Math.min(0.26, ((dl - 55) / 260) * pigmentNorm));
        }
      }

      // Watercolor glaze blend onto paper + subtle organic wet-wash wave
      const organicWave = 1 + (Math.sin(x * 0.14 + y * 0.09) + Math.cos(y * 0.17 - x * 0.07)) * 0.03 * softnessNorm;
      const localAlpha = bgSpec.light && luma > 228 ? washBlend * ((255 - luma) / 27) : washBlend;
      const a = Math.max(0, Math.min(1, localAlpha * organicWave));

      let fr = paperR * (1 - a) + r * edgeDarken * a;
      let fg = paperG * (1 - a) + g * edgeDarken * a;
      let fb = paperB * (1 - a) + b * edgeDarken * a;

      if (useGrain) {
        const grain = PAPER_NOISE_64[ny | (x & 63)] * (bgSpec.light ? 0.85 : 0.45);
        fr = clamp255(fr + grain);
        fg = clamp255(fg + grain);
        fb = clamp255(fb + grain);
      }

      const p = i * 4;
      outD[p] = fr;
      outD[p + 1] = fg;
      outD[p + 2] = fb;
      outD[p + 3] = 255;
    }
  }

  wCtx.putImageData(outImg, 0, 0);

  // Single fast bilinear upscale onto output canvas (silky wet-on-wet base)
  ctx.fillStyle = bgSpec.hex;
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(washCanvas, 0, 0, outWidth, outHeight);
  ctx.restore();

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  // Stage 2: Strictly capped (<= 120 draft / <= 240 settled) soft organic pigment blooms
  const rand = mulberry32(133791);
  const cells = options.skipCells ? null : [];
  const dabCols = isDraft ? 12 : Math.min(19, 11 + detailLevel * 2);
  const dabRows = Math.max(8, Math.round(dabCols * aspect));
  const stepX = outWidth / dabCols;
  const stepY = outHeight / dabRows;
  const baseR = ((stepX + stepY) * 0.5) * (0.78 + softnessNorm * 0.55);
  const dabAlpha = Math.min(0.28, 0.11 * pigmentNorm + 0.06);

  ctx.save();
  for (let gy = 0; gy < dabRows; gy++) {
    for (let gx = 0; gx < dabCols; gx++) {
      const sx = Math.min(w - 1, Math.floor(((gx + 0.5) / dabCols) * w));
      const sy = Math.min(h - 1, Math.floor(((gy + 0.5) / dabRows) * h));
      const si = sy * w + sx;
      const cr = Math.round(wR[si]);
      const cg = Math.round(wG[si]);
      const cb = Math.round(wB[si]);
      const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      if (bgSpec.light && lum > 236) continue;

      const cx = (gx + 0.5) * stepX + (rand() - 0.5) * stepX * 0.55;
      const cy = (gy + 0.5) * stepY + (rand() - 0.5) * stepY * 0.55;
      const r = baseR * (0.76 + rand() * 0.48);

      // Soft translucent watercolor bloom (simple circle — fast GPU path, zero ellipse tessellation!)
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${dabAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Occasional delicate wet-edge capillary ring
      if (!isDraft && rand() > 0.62) {
        ctx.strokeStyle = `rgba(${Math.round(cr * 0.75)},${Math.round(cg * 0.75)},${Math.round(cb * 0.75)},${(dabAlpha * 0.48).toFixed(2)})`;
        ctx.lineWidth = Math.max(0.9, 1.3 * scaleMultiplier);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (cells) {
        cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: dabAlpha, radius: r * 0.6 });
      }
    }
  }
  ctx.restore();

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    baseCanvas,
    cells,
    cols: dabCols,
    rows: dabRows,
    width: outWidth,
    height: outHeight,
    fontSize: Math.round(cfg.cellSize * scaleMultiplier),
    stepX: Math.round(stepX),
    stepY: Math.round(stepY),
    bgHex: bgSpec.hex,
    renderMs,
    textOutput: ''
  };
}

/**
 * Precomputed circular pixel disk offsets for fast direct-pixel contour thickness stamping
 */
const diskOffsetCache = new Map();

function getDiskOffsets(radius) {
  const r = Math.max(0, Math.min(5, radius | 0));
  let cached = diskOffsetCache.get(r);
  if (cached) return cached;
  const pts = [];
  const r2 = r * r + 0.35;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        const weight = r === 0 ? 1 : Math.max(0.45, 1 - Math.sqrt(d2) / (r + 0.85));
        pts.push([dx, dy, weight]);
      }
    }
  }
  diskOffsetCache.set(r, pts);
  return pts;
}

/**
 * Non-Blocking Shape / Hollow Outline Rendering Mode
 * Caches Sobel + 8-way NMS edge maps so dragging Threshold / Thickness / Ink Style runs in 1-3ms,
 * and stamps crisp outlines directly into an ImageData pixel buffer over a pure #FFFFFF white interior
 * (1 single ctx.drawImage call — zero Skia path stroker freezes!).
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

  const detail = Math.max(1, Math.min(5, Math.round(cfg.outlineDetail)));
  const isDraft = Boolean(options.isDraft);
  const aspect = outHeight / outWidth;

  // Bounded contour resolution: super crisp yet tiny enough to finish Sobel+NMS in ~4ms
  const targetW = isDraft
    ? Math.min(240, 140 + detail * 20)
    : options.exportScale > 1
    ? Math.min(560, 260 + detail * 60)
    : Math.min(400, 180 + detail * 44);
  const w = Math.max(80, Math.min(outWidth, targetW));
  const h = Math.max(60, Math.round(w * aspect));
  const len = w * h;

  // Reuse cached Sobel + NMS edge field if source/geometry/tone hasn't changed!
  let edgeStrength;
  let fR;
  let fG;
  let fB;
  let fL;
  let p97;

  const cacheHit =
    outlineEdgeCache &&
    outlineEdgeCache.source === source &&
    outlineEdgeCache.w === w &&
    outlineEdgeCache.h === h &&
    outlineEdgeCache.detail === detail &&
    outlineEdgeCache.contrast === cfg.contrast &&
    outlineEdgeCache.brightness === cfg.brightness &&
    outlineEdgeCache.saturation === cfg.saturation;

  if (cacheHit) {
    edgeStrength = outlineEdgeCache.edgeStrength;
    fR = outlineEdgeCache.fR;
    fG = outlineEdgeCache.fG;
    fB = outlineEdgeCache.fB;
    fL = outlineEdgeCache.fL;
    p97 = outlineEdgeCache.p97;
  } else {
    const sCanvas = getScratchCanvas('outline-src', w, h);
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, 0, 0, w, h);
    const raw = sCtx.getImageData(0, 0, w, h).data;

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
    const smoothed = smoothField(rawR, rawG, rawB, w, h, smoothRadius);
    fR = smoothed.r;
    fG = smoothed.g;
    fB = smoothed.b;
    fL = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      fL[i] = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
    }

    const mag = new Float32Array(len);
    const dir = new Uint8Array(len);
    const hist = new Uint32Array(256);

    for (let y = 1; y < h - 1; y++) {
      const rowOff = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = rowOff + x;
        const ul = i - w - 1;
        const u = i - w;
        const ur = i - w + 1;
        const l = i - 1;
        const r = i + 1;
        const dl = i + w - 1;
        const d = i + w;
        const dr = i + w + 1;

        const gxL = -fL[ul] + fL[ur] - 2 * fL[l] + 2 * fL[r] - fL[dl] + fL[dr];
        const gyL = -fL[ul] - 2 * fL[u] - fL[ur] + fL[dl] + 2 * fL[d] + fL[dr];
        let bestM = Math.sqrt(gxL * gxL + gyL * gyL) * 0.25;
        let bestGx = gxL;
        let bestGy = gyL;

        const gxR = -fR[ul] + fR[ur] - 2 * fR[l] + 2 * fR[r] - fR[dl] + fR[dr];
        const gyR = -fR[ul] - 2 * fR[u] - fR[ur] + fR[dl] + 2 * fR[d] + fR[dr];
        const mR = Math.sqrt(gxR * gxR + gyR * gyR) * 0.23;
        if (mR > bestM) { bestM = mR; bestGx = gxR; bestGy = gyR; }

        const gxG = -fG[ul] + fG[ur] - 2 * fG[l] + 2 * fG[r] - fG[dl] + fG[dr];
        const gyG = -fG[ul] - 2 * fG[u] - fG[ur] + fG[dl] + 2 * fG[d] + fG[dr];
        const mG = Math.sqrt(gxG * gxG + gyG * gyG) * 0.23;
        if (mG > bestM) { bestM = mG; bestGx = gxG; bestGy = gyG; }

        const gxB = -fB[ul] + fB[ur] - 2 * fB[l] + 2 * fB[r] - fB[dl] + fB[dr];
        const gyB = -fB[ul] - 2 * fB[u] - fB[ur] + fB[dl] + 2 * fB[d] + fB[dr];
        const mB = Math.sqrt(gxB * gxB + gyB * gyB) * 0.23;
        if (mB > bestM) { bestM = mB; bestGx = gxB; bestGy = gyB; }

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
    p97 = 45;
    const target97 = totalInner * 0.97;
    for (let b = 0; b < 256; b++) {
      acc += hist[b];
      if (acc >= target97) {
        p97 = Math.max(18, b);
        break;
      }
    }

    edgeStrength = new Float32Array(len);
    for (let y = 1; y < h - 1; y++) {
      const rowOff = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = rowOff + x;
        const m = mag[i];
        if (m < 4) continue;

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

        if (m >= n1 && m >= n2) {
          edgeStrength[i] = m;
        }
      }
    }

    outlineEdgeCache = {
      source,
      w,
      h,
      detail,
      contrast: cfg.contrast,
      brightness: cfg.brightness,
      saturation: cfg.saturation,
      edgeStrength,
      fR,
      fG,
      fB,
      fL,
      p97
    };
  }

  // Pure white (#FFFFFF) interior buffer (or warm paper white if explicitly selected)
  const isWarm = cfg.background === 'warm';
  const bgR = isWarm ? 250 : 255;
  const bgG = isWarm ? 248 : 255;
  const bgB = isWarm ? 244 : 255;
  const interiorHex = isWarm ? '#faf8f4' : '#ffffff';

  const outCanvas = getScratchCanvas('outline-out', w, h);
  const oCtx = outCanvas.getContext('2d');
  const outImg = oCtx.createImageData(w, h);
  const outD = outImg.data;

  // Fill entire interior with crisp pure white (#FFFFFF)
  for (let i = 0; i < outD.length; i += 4) {
    outD[i] = bgR;
    outD[i + 1] = bgG;
    outD[i + 2] = bgB;
    outD[i + 3] = 255;
  }

  const sliderNorm = Math.max(0.05, Math.min(0.95, cfg.outlineThreshold / 100));
  const threshold = Math.max(7, p97 * (0.2 + sliderNorm * 0.92));
  const softFloor = threshold * 0.48;

  const stampRadius = Math.max(0, Math.min(3, Math.round((cfg.outlineThickness - 1) * 0.55)));
  const diskOffsets = getDiskOffsets(stampRadius);
  const sx = outWidth / w;
  const sy = outHeight / h;
  const cells = options.skipCells ? null : [];
  let contourCount = 0;

  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const m = edgeStrength[i];
      if (m < softFloor) continue;

      if (
        m < threshold &&
        edgeStrength[i - w - 1] < threshold && edgeStrength[i - w] < threshold && edgeStrength[i - w + 1] < threshold &&
        edgeStrength[i - 1] < threshold && edgeStrength[i + 1] < threshold &&
        edgeStrength[i + w - 1] < threshold && edgeStrength[i + w] < threshold && edgeStrength[i + w + 1] < threshold
      ) {
        continue;
      }

      contourCount++;
      const strength = Math.min(1, (m - softFloor) / Math.max(10, threshold * 0.8));

      let cr = 15;
      let cg = 23;
      let cb = 42;
      if (cfg.outlineInkStyle === 'palette') {
        const [pr, pg, pb] = mapPaletteColor(fR[i], fG[i], fB[i], fL[i], cfg.colorMode, true);
        cr = Math.round(pr * 0.68);
        cg = Math.round(pg * 0.68);
        cb = Math.round(pb * 0.68);
      } else if (cfg.outlineInkStyle !== 'ink') {
        const lum = fL[i];
        const darken = lum > 175 ? 0.5 : lum > 120 ? 0.66 : 0.84;
        const luma = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
        cr = Math.round(clamp255((luma + (fR[i] - luma) * 1.35) * darken));
        cg = Math.round(clamp255((luma + (fG[i] - luma) * 1.35) * darken));
        cb = Math.round(clamp255((luma + (fB[i] - luma) * 1.35) * darken));
      }

      const baseAlpha = Math.min(1, 0.58 + strength * 0.42);

      // Stamp directly into white ImageData buffer (zero Canvas path/stroke calls!)
      for (let k = 0; k < diskOffsets.length; k++) {
        const nx = x + diskOffsets[k][0];
        const ny = y + diskOffsets[k][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const a = baseAlpha * diskOffsets[k][2];
        const p = (ny * w + nx) * 4;
        // Alpha-blend darker ink over existing white pixel (preserving strongest overlapping contour)
        const invA = 1 - a;
        const nr = outD[p] * invA + cr * a;
        const ng = outD[p + 1] * invA + cg * a;
        const nb = outD[p + 2] * invA + cb * a;
        if (nr < outD[p]) outD[p] = nr;
        if (ng < outD[p + 1]) outD[p + 1] = ng;
        if (nb < outD[p + 2]) outD[p + 2] = nb;
      }

      if (cells && cells.length < 480 && (contourCount % 4 === 0 || detail <= 2)) {
        cells.push({
          cx: (x + 0.5) * sx,
          cy: (y + 0.5) * sy,
          r: cr,
          g: cg,
          b: cb,
          lum: fL[i],
          char: '',
          alpha: baseAlpha,
          radius: Math.max(1.2, cfg.outlineThickness * 0.65 * scaleMultiplier)
        });
      }
    }
  }

  oCtx.putImageData(outImg, 0, 0);

  ctx.fillStyle = interiorHex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity * 0.42;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  // Single crisp drawImage onto baseCanvas (ZERO Skia path stroker overhead!)
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(outCanvas, 0, 0, outWidth, outHeight);
  ctx.restore();

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    baseCanvas,
    cells,
    cols: w,
    rows: h,
    width: outWidth,
    height: outHeight,
    fontSize: Math.round(cfg.outlineThickness * 4 * scaleMultiplier),
    stepX: sx,
    stepY: sy,
    bgHex: interiorHex,
    renderMs,
    textOutput: ''
  };
}

/**
 * Computes the artwork onto an offscreen base canvas with strict anti-freeze budgets
 * across all 5 rendering modes.
 */
export function renderArtwork(source, config, options = {}) {
  const startTime = performance.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const srcWidth = Math.max(1, source.naturalWidth || source.width || 960);
  const srcHeight = Math.max(1, source.naturalHeight || source.height || 720);
  const maxDim = options.maxDimension || 820;

  let outWidth = srcWidth;
  let outHeight = srcHeight;
  if (Math.max(outWidth, outHeight) > maxDim) {
    const scale = maxDim / Math.max(outWidth, outHeight);
    outWidth = Math.round(outWidth * scale);
    outHeight = Math.round(outHeight * scale);
  }
  const scaleMultiplier = options.exportScale || 1;
  outWidth = Math.max(160, Math.round(outWidth * scaleMultiplier));
  outHeight = Math.max(120, Math.round(outHeight * scaleMultiplier));

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

  // Matrix Modes: Binary, ASCII, Dots — strict cell cap prevents small cellSize freezes
  const maxCells = options.maxCells || (options.isDraft ? 3200 : scaleMultiplier > 1 ? 15000 : 7000);
  let cellSize = Math.max(4, Math.round(cfg.cellSize * scaleMultiplier));
  let stepX = Math.max(4, Math.round(cellSize * cfg.spacing));
  let stepY = cfg.mode === 'dots' ? stepX : Math.max(4, Math.round(cellSize * cfg.spacing * 1.05));

  const rawCells = (outWidth / stepX) * (outHeight / stepY);
  if (rawCells > maxCells) {
    const bump = Math.sqrt(rawCells / maxCells);
    stepX = Math.ceil(stepX * bump);
    stepY = Math.ceil(stepY * bump);
    cellSize = Math.max(cellSize, Math.round(stepX / Math.max(0.75, cfg.spacing)));
  }

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
  const offsetX = Math.floor((outWidth - cols * stepX) / 2);
  const offsetY = Math.floor((outHeight - rows * stepY) / 2);

  const cells = options.skipCells ? null : [];
  const textLines = options.includeText ? [] : null;
  const dotBuckets = cfg.mode === 'dots' ? new Map() : null;
  const glyphBuckets = cfg.mode !== 'dots' ? new Map() : null;

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
        if (cfg.invert) bit = bit === '1' ? '0' : '1';

        const bitAlpha = bit === '1' ? 0.98 : bgSpec.light ? 0.42 : 0.36;
        const styleKey = `rgba(${cr & 0xf8},${cg & 0xf8},${cb & 0xf8},${bitAlpha.toFixed(2)})`;
        let list = glyphBuckets.get(styleKey);
        if (!list) {
          list = [];
          glyphBuckets.set(styleKey, list);
        }
        list.push(bit, cx, cy);

        if (textLines) lineStr += bit;
        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: bit, alpha: bitAlpha, radius: 0 });
        }
      } else if (cfg.mode === 'ascii') {
        let norm = lum / 255;
        const shouldInvert = bgSpec.light ? !cfg.invert : cfg.invert;
        if (!shouldInvert) norm = 1 - norm;
        const charIndex = Math.min(rampLen - 1, Math.max(0, Math.floor(norm * (rampLen - 1))));
        const ch = rampStr[charIndex];

        if (ch !== ' ') {
          const styleKey = `rgb(${cr & 0xf8},${cg & 0xf8},${cb & 0xf8})`;
          let list = glyphBuckets.get(styleKey);
          if (!list) {
            list = [];
            glyphBuckets.set(styleKey, list);
          }
          list.push(ch, cx, cy);
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
          const qAlpha = Math.round(dotAlpha * 10) / 10;
          const styleKey = `rgba(${cr & 0xf0},${cg & 0xf0},${cb & 0xf0},${qAlpha.toFixed(1)})`;
          let list = dotBuckets.get(styleKey);
          if (!list) {
            list = [];
            dotBuckets.set(styleKey, list);
          }
          list.push(cx, cy, radius);
        }

        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: dotAlpha, radius });
        }
      }
    }

    if (textLines) textLines.push(lineStr);
  }

  if (glyphBuckets) {
    ctx.font = `700 ${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [styleKey, list] of glyphBuckets) {
      ctx.fillStyle = styleKey;
      for (let k = 0; k < list.length; k += 3) {
        ctx.fillText(list[k], list[k + 1], list[k + 2]);
      }
    }
  } else if (dotBuckets) {
    for (const [styleKey, list] of dotBuckets) {
      ctx.fillStyle = styleKey;
      // Flush in small chunks (<= 64 circles per path) to keep Skia GPU tessellator instant
      for (let start = 0; start < list.length; start += 192) {
        const end = Math.min(list.length, start + 192);
        ctx.beginPath();
        for (let k = start; k < end; k += 3) {
          const cx = list[k];
          const cy = list[k + 1];
          const r = list[k + 2];
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
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
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${(smooth * 0.2).toFixed(2)})`;
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
      const scaledR = Math.max(1.1, cell.radius * (1 + smooth * 0.85));
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${Math.min(1, cell.alpha + smooth * 0.35).toFixed(2)})`;
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
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, cell.alpha + smooth * 0.35).toFixed(2)})`;
      ctx.fill();
    } else if (cell.char && cell.char !== ' ') {
      const scaledFont = Math.round(renderResult.fontSize * (1 + smooth * 0.42));
      if (scaledFont !== lastFontSize) {
        ctx.font = `700 ${scaledFont}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        lastFontSize = scaledFont;
      }
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, cell.alpha + smooth * 0.45).toFixed(2)})`;
      ctx.fillText(cell.char, px, py);
    }
  }

  ctx.restore();
}
