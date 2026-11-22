/**
 * ChromaGlyph Studio — Authentic, Non-Blocking Multi-Mode Rendering Engine
 * Modes:
 *  - binary:    0/1 character art mapped by luminance threshold (with optional Bayer 4x4 dithering)
 *  - ascii:     Multi-ramp character art mapped by optical density & real RGB or curated palettes
 *  - dots:      Halftone dot matrix with radius/opacity response and square or hexagonal grids
 *  - aquarelle: Edge-preserving bilateral watercolor washes (distinct color regions, darker backrun rims & paper tooth)
 *  - outline:   Geometric line-first contour simplification (RDP polylines + clean hollow polygon fallback on #FFFFFF)
 *
 * Anti-freeze architecture:
 *  - Intermediate caches for Aquarelle bilateral regions & Outline Sobel/NMS edge fields (< 4ms slider drags)
 *  - Zero giant Skia compound paths (strictly chunked <= 24 segments / <= 64 dots per beginPath())
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

// Intermediate caches for responsive, non-blocking slider updates
let outlineEdgeCache = null;
let aquarelleRegionCache = null;

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

/**
 * Fast separable edge-preserving bilateral filter (rational range kernel — zero Math.exp calls).
 * Smooths interior watercolor regions into clean flat washes WITHOUT bleeding/mushing across color edges!
 */
function bilateralWashFilter(srcR, srcG, srcB, w, h, radius, colorSigma) {
  const len = w * h;
  const invSigma2 = 1 / Math.max(120, colorSigma * colorSigma);
  const tmpR = new Float32Array(len);
  const tmpG = new Float32Array(len);
  const tmpB = new Float32Array(len);
  const outR = new Float32Array(len);
  const outG = new Float32Array(len);
  const outB = new Float32Array(len);

  // Horizontal edge-preserving pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const ci = rowOff + x;
      const cr = srcR[ci];
      const cg = srcG[ci];
      const cb = srcB[ci];
      let sr = cr;
      let sg = cg;
      let sb = cb;
      let wSum = 1;
      const x0 = x - radius < 0 ? 0 : x - radius;
      const x1 = x + radius >= w ? w - 1 : x + radius;
      for (let k = x0; k <= x1; k++) {
        if (k === x) continue;
        const i = rowOff + k;
        const dr = srcR[i] - cr;
        const dg = srcG[i] - cg;
        const db = srcB[i] - cb;
        const dist2 = dr * dr + dg * dg + db * db;
        const weight = 1 / (1 + dist2 * invSigma2);
        sr += srcR[i] * weight;
        sg += srcG[i] * weight;
        sb += srcB[i] * weight;
        wSum += weight;
      }
      tmpR[ci] = sr / wSum;
      tmpG[ci] = sg / wSum;
      tmpB[ci] = sb / wSum;
    }
  }

  // Vertical edge-preserving pass
  for (let y = 0; y < h; y++) {
    const y0 = y - radius < 0 ? 0 : y - radius;
    const y1 = y + radius >= h ? h - 1 : y + radius;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const ci = rowOff + x;
      const cr = tmpR[ci];
      const cg = tmpG[ci];
      const cb = tmpB[ci];
      let sr = cr;
      let sg = cg;
      let sb = cb;
      let wSum = 1;
      for (let k = y0; k <= y1; k++) {
        if (k === y) continue;
        const i = k * w + x;
        const dr = tmpR[i] - cr;
        const dg = tmpG[i] - cg;
        const db = tmpB[i] - cb;
        const dist2 = dr * dr + dg * dg + db * db;
        const weight = 1 / (1 + dist2 * invSigma2);
        sr += tmpR[i] * weight;
        sg += tmpG[i] * weight;
        sb += tmpB[i] * weight;
        wSum += weight;
      }
      outR[ci] = sr / wSum;
      outG[ci] = sg / wSum;
      outB[ci] = sb / wSum;
    }
  }

  return { r: outR, g: outG, b: outB };
}

// Fast deterministic cold-press watercolor paper tooth table (64x64 tiled via bitwise mask)
const PAPER_NOISE_64 = (() => {
  const arr = new Int8Array(64 * 64);
  const rand = mulberry32(42197);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const fiber = Math.sin(x * 0.29 + y * 0.11) * 4 + Math.cos(y * 0.31 - x * 0.09) * 3;
      const tooth = (rand() - 0.5) * 16;
      arr[(y << 6) | x] = Math.round(fiber + tooth);
    }
  }
  return arr;
})();

/**
 * Authentic Aquarelle (Watercolor) Rendering Mode
 * - Edge-preserving bilateral filtering keeps distinct color regions crisp (zero muddy over-fusion!)
 * - Soft tonal glaze quantization gives genuine layered watercolor wash clarity
 * - True capillary backrun rim darkening accumulates along drying wash edges
 * - Cold-press paper grain & boundary-aware subtle pigment accents stay fast (< 10ms)
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

  const aspect = outHeight / outWidth;
  const targetW = isDraft
    ? Math.min(180, 120 + detailLevel * 12)
    : options.exportScale > 1
    ? Math.min(420, 240 + detailLevel * 36)
    : Math.min(280, 160 + detailLevel * 24);
  const w = Math.max(80, Math.min(outWidth, targetW));
  const h = Math.max(60, Math.round(w * aspect));
  const len = w * h;

  // Bucket softness into 5 clean steps for instant cache hits during Pigment/Paper slider drags
  const softnessStep = Math.round(softnessNorm * 4);
  const cacheHit =
    aquarelleRegionCache &&
    aquarelleRegionCache.source === source &&
    aquarelleRegionCache.w === w &&
    aquarelleRegionCache.h === h &&
    aquarelleRegionCache.softnessStep === softnessStep &&
    aquarelleRegionCache.contrast === cfg.contrast &&
    aquarelleRegionCache.brightness === cfg.brightness &&
    aquarelleRegionCache.saturation === cfg.saturation &&
    aquarelleRegionCache.colorMode === cfg.colorMode &&
    aquarelleRegionCache.lightBg === bgSpec.light;

  let wR;
  let wG;
  let wB;
  let rimStrength;

  if (cacheHit) {
    wR = aquarelleRegionCache.wR;
    wG = aquarelleRegionCache.wG;
    wB = aquarelleRegionCache.wB;
    rimStrength = aquarelleRegionCache.rimStrength;
  } else {
    const sCanvas = getScratchCanvas('aq-raw', w, h);
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, 0, 0, w, h);
    const raw = sCtx.getImageData(0, 0, w, h).data;

    const srcR = new Float32Array(len);
    const srcG = new Float32Array(len);
    const srcB = new Float32Array(len);

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
      const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
      const [cr, cg, cb] = mapPaletteColor(ar, ag, ab, lum, cfg.colorMode, bgSpec.light);
      srcR[i] = cr;
      srcG[i] = cg;
      srcB[i] = cb;
    }

    // Edge-preserving bilateral passes: flatten interior washes while keeping distinct color boundaries sharp!
    const radius = softnessStep >= 3 ? 2 : 1;
    const colorSigma = 28 + softnessStep * 9; // Strict enough to keep orange/indigo or cyan/magenta cleanly separated
    const pass1 = bilateralWashFilter(srcR, srcG, srcB, w, h, radius, colorSigma);
    const finalPass = !isDraft && softnessStep >= 2
      ? bilateralWashFilter(pass1.r, pass1.g, pass1.b, w, h, 1, colorSigma * 0.85)
      : pass1;

    wR = finalPass.r;
    wG = finalPass.g;
    wB = finalPass.b;

    // Precompute capillary backrun / pigment-edge accumulation along wash region boundaries
    rimStrength = new Float32Array(len);
    for (let y = 1; y < h - 1; y++) {
      const rowOff = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = rowOff + x;
        const drX = wR[i + 1] - wR[i - 1];
        const dgX = wG[i + 1] - wG[i - 1];
        const dbX = wB[i + 1] - wB[i - 1];
        const drY = wR[i + w] - wR[i - w];
        const dgY = wG[i + w] - wG[i - w];
        const dbY = wB[i + w] - wB[i - w];
        const grad = Math.sqrt(drX * drX + dgX * dgX + dbX * dbX + drY * drY + dgY * dgY + dbY * dbY);
        if (grad > 28) {
          rimStrength[i] = Math.min(1, (grad - 28) / 115);
        }
      }
    }

    aquarelleRegionCache = {
      source,
      w,
      h,
      softnessStep,
      contrast: cfg.contrast,
      brightness: cfg.brightness,
      saturation: cfg.saturation,
      colorMode: cfg.colorMode,
      lightBg: bgSpec.light,
      wR,
      wG,
      wB,
      rimStrength
    };
  }

  // Paper base color
  const paperR = bgSpec.hex === '#f7f2e8' ? 248 : bgSpec.light ? 255 : 10;
  const paperG = bgSpec.hex === '#f7f2e8' ? 243 : bgSpec.light ? 255 : 14;
  const paperB = bgSpec.hex === '#f7f2e8' ? 233 : bgSpec.light ? 255 : 22;

  const washCanvas = getScratchCanvas('aq-wash', w, h);
  const wCtx = washCanvas.getContext('2d');
  const outImg = wCtx.createImageData(w, h);
  const outD = outImg.data;

  // Soft tonal step quantization gives distinct hand-painted watercolor wash tiers without harsh posterization
  const glazeLevels = Math.max(5, Math.round(11 - softnessNorm * 4));
  const quantBlend = 0.24 + softnessNorm * 0.22;
  const washOpacity = Math.min(0.96, 0.56 + pigmentNorm * 0.3);
  const paperLift = bgSpec.light ? 16 + softnessNorm * 10 : 0;
  const chromaBoost = 1.08 + pigmentNorm * 0.14;
  const useGrain = cfg.aquarellePaperGrain;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    const ny = (y & 63) << 6;
    for (let x = 0; x < w; x++) {
      const i = rowOff + x;
      let r = wR[i];
      let g = wG[i];
      let b = wB[i];

      // Soft watercolor tonal quantization (preserves distinct color shapes & crisp midtone clarity)
      const qr = Math.round((r / 255) * glazeLevels) * (255 / glazeLevels);
      const qg = Math.round((g / 255) * glazeLevels) * (255 / glazeLevels);
      const qb = Math.round((b / 255) * glazeLevels) * (255 / glazeLevels);
      r = r * (1 - quantBlend) + qr * quantBlend;
      g = g * (1 - quantBlend) + qg * quantBlend;
      b = b * (1 - quantBlend) + qb * quantBlend;

      // Boost pigment clarity and gently lift deep shadows on cotton paper
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = clamp255(paperLift + (luma + (r - luma) * chromaBoost) * (bgSpec.light ? 0.92 : 1));
      g = clamp255(paperLift + (luma + (g - luma) * chromaBoost) * (bgSpec.light ? 0.92 : 1));
      b = clamp255(paperLift + (luma + (b - luma) * chromaBoost) * (bgSpec.light ? 0.94 : 1));

      // Authentic capillary backrun effect: pigment accumulates & slightly darkens/saturates at wash edges
      const rim = rimStrength[i];
      if (rim > 0) {
        const rimFactor = 1 - rim * Math.min(0.32, 0.18 * pigmentNorm + 0.06);
        const rimLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = clamp255((rimLuma + (r - rimLuma) * (1 + rim * 0.22)) * rimFactor);
        g = clamp255((rimLuma + (g - rimLuma) * (1 + rim * 0.22)) * rimFactor);
        b = clamp255((rimLuma + (b - rimLuma) * (1 + rim * 0.22)) * rimFactor);
      }

      // Subtle watercolor wash density variation inside regions (gentle paper granulation, zero muddiness)
      const grainVal = PAPER_NOISE_64[ny | (x & 63)];
      const granulation = useGrain ? 1 + grainVal * 0.0045 : 1;
      // Reserve bright paper highlights cleanly like real watercolor
      const highlightFade = bgSpec.light && luma > 224 ? Math.max(0, (255 - luma) / 31) : 1;
      const a = Math.max(0, Math.min(1, washOpacity * highlightFade * granulation));

      let fr = paperR * (1 - a) + r * a;
      let fg = paperG * (1 - a) + g * a;
      let fb = paperB * (1 - a) + b * a;

      if (useGrain) {
        const tooth = grainVal * (bgSpec.light ? 0.72 : 0.35);
        fr = clamp255(fr + tooth);
        fg = clamp255(fg + tooth);
        fb = clamp255(fb + tooth);
      }

      const p = i * 4;
      outD[p] = fr;
      outD[p + 1] = fg;
      outD[p + 2] = fb;
      outD[p + 3] = 255;
    }
  }

  wCtx.putImageData(outImg, 0, 0);

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

  // Stage 2: Boundary-respecting subtle watercolor bloom accents (ONLY inside calm regions, never mushing across borders!)
  const rand = mulberry32(133791);
  const cells = options.skipCells ? null : [];
  const dabCols = isDraft ? 10 : Math.min(16, 10 + detailLevel);
  const dabRows = Math.max(7, Math.round(dabCols * aspect));
  const stepX = outWidth / dabCols;
  const stepY = outHeight / dabRows;
  const dabAlpha = Math.min(0.16, 0.065 * pigmentNorm + 0.03);

  ctx.save();
  for (let gy = 0; gy < dabRows; gy++) {
    for (let gx = 0; gx < dabCols; gx++) {
      const sx = Math.min(w - 1, Math.floor(((gx + 0.5) / dabCols) * w));
      const sy = Math.min(h - 1, Math.floor(((gy + 0.5) / dabRows) * h));
      const si = sy * w + sx;

      // Skip dabs directly straddling strong region borders so distinct colors NEVER mush together
      if (rimStrength[si] > 0.35) continue;

      const cr = Math.round(wR[si]);
      const cg = Math.round(wG[si]);
      const cb = Math.round(wB[si]);
      const lum = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      if (bgSpec.light && lum > 232) continue;

      const cx = (gx + 0.5) * stepX + (rand() - 0.5) * stepX * 0.35;
      const cy = (gy + 0.5) * stepY + (rand() - 0.5) * stepY * 0.35;
      const r = ((stepX + stepY) * 0.5) * (0.48 + softnessNorm * 0.28) * (0.8 + rand() * 0.35);

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${dabAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Delicate capillary rim on occasional blooms
      if (!isDraft && rand() > 0.65) {
        ctx.strokeStyle = `rgba(${Math.round(cr * 0.74)},${Math.round(cg * 0.74)},${Math.round(cb * 0.74)},${(dabAlpha * 0.65).toFixed(2)})`;
        ctx.lineWidth = Math.max(0.8, 1.15 * scaleMultiplier);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (cells) {
        cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: dabAlpha, radius: r * 0.65 });
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
 * Ramer–Douglas–Peucker (RDP) Polyline Simplification
 * Converts traced pixel chains into clean, crisp straight geometric line segments.
 */
function simplifyPolylineRDP(pts, epsilon) {
  const n = pts.length;
  if (n <= 2) return pts;
  const eps2 = epsilon * epsilon;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  // Iterative stack avoids recursion overhead
  const stack = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start <= 1) continue;

    const ax = pts[start][0];
    const ay = pts[start][1];
    const bx = pts[end][0];
    const by = pts[end][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let maxDist2 = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const px = pts[i][0];
      const py = pts[i][1];
      let d2;
      if (len2 < 1e-6) {
        d2 = (px - ax) * (px - ax) + (py - ay) * (py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const projX = ax + t * dx;
        const projY = ay + t * dy;
        d2 = (px - projX) * (px - projX) + (py - projY) * (py - projY);
      }
      if (d2 > maxDist2) {
        maxDist2 = d2;
        maxIdx = i;
      }
    }

    if (maxDist2 > eps2 && maxIdx > start) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i]);
  }
  return out;
}

/**
 * Geometric Shape / Line-First Outline Rendering Mode (Pure White #FFFFFF Interior)
 * 1. Cached color-aware Sobel + 8-way NMS edge map
 * 2. Linear chain tracing + Ramer–Douglas–Peucker (RDP) simplification -> crisp straight line segments first
 * 3. Clean hollow geometric polygon/segment fallback in regions where subject structure exists but clear edges are scarce
 * 4. Chunked drawing (<= 24 segments per beginPath()) -> crisp vector lines with zero Skia path freezes!
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

  // Always keep interior crisp pure white (#FFFFFF) so geometric line structure stands out cleanly
  const isWarm = cfg.background === 'warm';
  const interiorHex = isWarm ? '#faf8f4' : '#ffffff';
  ctx.fillStyle = interiorHex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity * 0.35;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  const detail = Math.max(1, Math.min(5, Math.round(cfg.outlineDetail)));
  const isDraft = Boolean(options.isDraft);
  const aspect = outHeight / outWidth;

  const targetW = isDraft
    ? Math.min(200, 120 + detail * 16)
    : options.exportScale > 1
    ? Math.min(400, 200 + detail * 40)
    : Math.min(310, 150 + detail * 32);
  const w = Math.max(80, Math.min(outWidth, targetW));
  const h = Math.max(60, Math.round(w * aspect));
  const len = w * h;

  // Step 1: Cached Sobel + 8-way NMS edge map (slider drags on Threshold/Thickness/Ink hit cache in < 2ms!)
  let edgeStrength;
  let fR;
  let fG;
  let fB;
  let fL;
  let gradAngle;
  let p97;
  let borderR;
  let borderG;
  let borderB;

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
    ({ edgeStrength, fR, fG, fB, fL, gradAngle, p97, borderR, borderG, borderB } = outlineEdgeCache);
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

    // Estimate perimeter background color so geometric fallback only activates on real subject regions
    let bR = 0;
    let bG = 0;
    let bB = 0;
    let bCnt = 0;
    for (let x = 0; x < w; x += 2) {
      for (const y of [0, h - 1]) {
        const idx = y * w + x;
        bR += fR[idx];
        bG += fG[idx];
        bB += fB[idx];
        bCnt++;
      }
    }
    borderR = bR / Math.max(1, bCnt);
    borderG = bG / Math.max(1, bCnt);
    borderB = bB / Math.max(1, bCnt);

    const mag = new Float32Array(len);
    const dir = new Uint8Array(len);
    gradAngle = new Float32Array(len);
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

        const rad = Math.atan2(bestGy, bestGx);
        gradAngle[i] = rad;
        let deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 180;
        if (deg < 22.5 || deg >= 157.5) dir[i] = 0;
        else if (deg < 67.5) dir[i] = 1;
        else if (deg < 112.5) dir[i] = 2;
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
        if (d === 0) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
        else if (d === 1) { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
        else if (d === 2) { n1 = mag[i - w]; n2 = mag[i + w]; }
        else { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
        if (m >= n1 && m >= n2) edgeStrength[i] = m;
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
      gradAngle,
      p97,
      borderR,
      borderG,
      borderB
    };
  }

  // Step 2: Hysteresis edge mask -> Linear chain tracing -> RDP Straight-Line Simplification
  const sliderNorm = Math.max(0.05, Math.min(0.95, cfg.outlineThreshold / 100));
  const threshold = Math.max(7, p97 * (0.22 + sliderNorm * 0.92));
  const softFloor = threshold * 0.48;

  const active = new Uint8Array(len);
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const m = edgeStrength[i];
      if (m < softFloor) continue;
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
    if (cfg.outlineInkStyle === 'ink') return [15, 23, 42];
    if (cfg.outlineInkStyle === 'palette') {
      const [pr, pg, pb] = mapPaletteColor(fR[i], fG[i], fB[i], fL[i], cfg.colorMode, true);
      return [Math.round(pr * 0.68), Math.round(pg * 0.68), Math.round(pb * 0.68)];
    }
    const lum = fL[i];
    const darken = lum > 175 ? 0.5 : lum > 120 ? 0.66 : 0.84;
    const luma = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
    return [
      Math.round(clamp255((luma + (fR[i] - luma) * 1.35) * darken)),
      Math.round(clamp255((luma + (fG[i] - luma) * 1.35) * darken)),
      Math.round(clamp255((luma + (fB[i] - luma) * 1.35) * darken))
    ];
  };

  // Track which macro-tiles already have strong geometric line coverage (for clean shape fallback)
  const tileCols = 10;
  const tileRows = Math.max(6, Math.round(tileCols * aspect));
  const tileLineCounts = new Uint16Array(tileCols * tileRows);

  const visited = new Uint8Array(len);
  const dirs8 = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1]
  ];

  // Discard tiny noise specks; simplify every real contour into crisp straight geometric segments!
  const minChainLen = Math.max(3, 8 - detail); // Detail 1: >=7px clean lines; Detail 5: >=3px
  const rdpEpsilon = Math.max(0.85, 2.75 - detail * 0.36);
  const sx = outWidth / w;
  const sy = outHeight / h;

  const lineSegments = []; // [x1, y1, x2, y2, r, g, b]
  const maxSegments = isDraft ? 420 : 880;

  for (let y = 1; y < h - 1 && lineSegments.length < maxSegments; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1 && lineSegments.length < maxSegments; x++) {
      const startIdx = rowOff + x;
      if (!active[startIdx] || visited[startIdx]) continue;

      // Follow connected edge chain greedily (preferring strongest ridge continuation)
      const chain = [[x, y]];
      visited[startIdx] = 1;
      let cx = x;
      let cy = y;
      let prevDx = 0;
      let prevDy = 0;

      for (let step = 0; step < 180; step++) {
        let bestX = -1;
        let bestY = -1;
        let bestScore = -1;
        for (let k = 0; k < 8; k++) {
          const nx = cx + dirs8[k][0];
          const ny = cy + dirs8[k][1];
          if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;
          const ni = ny * w + nx;
          if (!active[ni] || visited[ni]) continue;
          // Favor straight continuation along previous direction for clean geometric line tracing
          const alignBonus = (dirs8[k][0] === prevDx && dirs8[k][1] === prevDy) ? 28 : 0;
          const score = edgeStrength[ni] + alignBonus;
          if (score > bestScore) {
            bestScore = score;
            bestX = nx;
            bestY = ny;
          }
        }
        if (bestX < 0) break;
        prevDx = bestX - cx;
        prevDy = bestY - cy;
        cx = bestX;
        cy = bestY;
        visited[cy * w + cx] = 1;
        chain.push([cx, cy]);
      }

      if (chain.length < minChainLen) continue;

      // Simplify jagged pixels into crisp straight geometric line segments via RDP
      const simplified = simplifyPolylineRDP(chain, rdpEpsilon);
      if (simplified.length < 2) continue;

      // Sample representative contour color from chain midpoint
      const midPt = chain[chain.length >> 1];
      const [cr, cg, cb] = getContourColor(midPt[1] * w + midPt[0]);

      for (let s = 0; s < simplified.length - 1 && lineSegments.length < maxSegments; s++) {
        let x1 = (simplified[s][0] + 0.5) * sx;
        let y1 = (simplified[s][1] + 0.5) * sy;
        let x2 = (simplified[s + 1][0] + 0.5) * sx;
        let y2 = (simplified[s + 1][1] + 0.5) * sy;

        // Gentle axis snap (±5°) on bold/medium detail for architectural crispness
        if (detail <= 3) {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const segLen = Math.hypot(dx, dy);
          if (segLen > 12) {
            if (Math.abs(dy) < segLen * 0.085) {
              const my = (y1 + y2) * 0.5;
              y1 = my;
              y2 = my;
            } else if (Math.abs(dx) < segLen * 0.085) {
              const mx = (x1 + x2) * 0.5;
              x1 = mx;
              x2 = mx;
            }
          }
        }

        lineSegments.push([x1, y1, x2, y2, cr, cg, cb]);

        // Mark tile coverage
        const tx = Math.min(tileCols - 1, Math.floor(((simplified[s][0] + simplified[s + 1][0]) * 0.5 / w) * tileCols));
        const ty = Math.min(tileRows - 1, Math.floor(((simplified[s][1] + simplified[s + 1][1]) * 0.5 / h) * tileRows));
        tileLineCounts[ty * tileCols + tx]++;
      }
    }
  }

  // Step 3: Clean Hollow Geometric Shape Fallback in regions where subject exists but clear lines are scarce
  const fallbackPolygons = []; // { cx, cy, r, sides, rot, cr, cg, cb }
  const sparseMode = lineSegments.length < 28;
  const tileW = outWidth / tileCols;
  const tileH = outHeight / tileRows;

  for (let ty = 0; ty < tileRows; ty++) {
    for (let tx = 0; tx < tileCols; tx++) {
      // Only add clean geometric shape fallback where line segments are scarce (0 lines, or <=1 when whole image is soft)
      const count = tileLineCounts[ty * tileCols + tx];
      if (count > (sparseMode ? 1 : 0)) continue;

      const sx0 = Math.floor((tx / tileCols) * w);
      const sx1 = Math.min(w - 1, Math.floor(((tx + 1) / tileCols) * w));
      const sy0 = Math.floor((ty / tileRows) * h);
      const sy1 = Math.min(h - 1, Math.floor(((ty + 1) / tileRows) * h));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumL = 0;
      let sumCos = 0;
      let sumSin = 0;
      let samples = 0;

      for (let py = sy0; py <= sy1; py += 2) {
        const ro = py * w;
        for (let px = sx0; px <= sx1; px += 2) {
          const i = ro + px;
          sumR += fR[i];
          sumG += fG[i];
          sumB += fB[i];
          sumL += fL[i];
          const a = gradAngle[i];
          sumCos += Math.cos(a);
          sumSin += Math.sin(a);
          samples++;
        }
      }
      if (samples === 0) continue;

      const avgR = sumR / samples;
      const avgG = sumG / samples;
      const avgB = sumB / samples;
      const avgL = sumL / samples;

      // Skip uniform background tiles so white negative space stays clean!
      const bgDist = Math.hypot(avgR - borderR, avgG - borderG, avgB - borderB);
      if (bgDist < 42 && !sparseMode) continue;
      if (bgDist < 22 && sparseMode) continue;

      const centerSampleIdx = Math.min(len - 1, ((sy0 + sy1) >> 1) * w + ((sx0 + sx1) >> 1));
      const [cr, cg, cb] = getContourColor(centerSampleIdx);
      const cx = (tx + 0.5) * tileW;
      const cy = (ty + 0.5) * tileH;
      const normProminence = Math.min(1, bgDist / 160);
      const polyRadius = Math.min(tileW, tileH) * (0.24 + normProminence * 0.2);
      // Choose clean geometric primitive: 3 (triangle), 4 (diamond/square), or 6 (hexagon) by tonal band
      const sides = avgL > 165 ? 3 : avgL > 90 ? 4 : 6;
      const rot = Math.atan2(sumSin, sumCos) + Math.PI * 0.25;

      fallbackPolygons.push({ cx, cy, r: polyRadius, sides, rot, cr, cg, cb });
    }
  }

  // Step 4: Crisp Chunked Vector Drawing (<= 24 segments per beginPath() -> zero Skia GPU freezes!)
  const strokeWidth = Math.max(1.0, cfg.outlineThickness * scaleMultiplier);
  const cells = options.skipCells ? null : [];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 3;

  // Group straight line segments by color bucket and flush in small <= 24-segment chunks
  const segBuckets = new Map();
  for (let i = 0; i < lineSegments.length; i++) {
    const [x1, y1, x2, y2, cr, cg, cb] = lineSegments[i];
    const qr = cfg.outlineInkStyle === 'ink' ? 15 : cr & 0xf0;
    const qg = cfg.outlineInkStyle === 'ink' ? 23 : cg & 0xf0;
    const qb = cfg.outlineInkStyle === 'ink' ? 42 : cb & 0xf0;
    const key = (qr << 16) | (qg << 8) | qb;
    let list = segBuckets.get(key);
    if (!list) {
      list = [];
      segBuckets.set(key, list);
    }
    list.push(x1, y1, x2, y2);

    if (cells && cells.length < 440) {
      cells.push({
        cx: (x1 + x2) * 0.5,
        cy: (y1 + y2) * 0.5,
        r: cr,
        g: cg,
        b: cb,
        lum: 80,
        char: '',
        alpha: 0.94,
        radius: strokeWidth * 0.7
      });
    }
  }

  ctx.lineWidth = strokeWidth;
  for (const [key, list] of segBuckets) {
    ctx.strokeStyle = `rgb(${(key >> 16) & 255},${(key >> 8) & 255},${key & 255})`;
    for (let start = 0; start < list.length; start += 96) {
      const end = Math.min(list.length, start + 96);
      ctx.beginPath();
      for (let k = start; k < end; k += 4) {
        ctx.moveTo(list[k], list[k + 1]);
        ctx.lineTo(list[k + 2], list[k + 3]);
      }
      ctx.stroke();
    }
  }

  // Draw clean hollow geometric fallback polygons (white #FFFFFF interior preserved!)
  if (fallbackPolygons.length > 0) {
    ctx.lineWidth = Math.max(1.0, strokeWidth * 0.78);
    for (let i = 0; i < fallbackPolygons.length; i++) {
      const poly = fallbackPolygons[i];
      ctx.strokeStyle = `rgba(${poly.cr},${poly.cg},${poly.cb},0.72)`;
      ctx.beginPath();
      for (let s = 0; s < poly.sides; s++) {
        const a = poly.rot + (s * Math.PI * 2) / poly.sides;
        const px = poly.cx + Math.cos(a) * poly.r;
        const py = poly.cy + Math.sin(a) * poly.r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      if (cells && cells.length < 480) {
        cells.push({
          cx: poly.cx,
          cy: poly.cy,
          r: poly.cr,
          g: poly.cg,
          b: poly.cb,
          lum: 100,
          char: '',
          alpha: 0.8,
          radius: strokeWidth * 0.8
        });
      }
    }
  }

  ctx.restore();

  const renderMs = Math.max(1, Math.round(performance.now() - startTime));
  return {
    baseCanvas,
    cells,
    cols: lineSegments.length,
    rows: fallbackPolygons.length,
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
      const scaledR = Math.max(1.2, cell.radius * (1 + smooth * 0.9));
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
