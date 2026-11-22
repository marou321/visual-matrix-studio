/**
 * ChromaGlyph Studio — Core Color-True Rendering Engine
 * Modes:
 *  - binary:    0/1 character art mapped by luminance threshold (with optional Bayer 4x4 dithering)
 *  - ascii:     Multi-ramp character art mapped by optical density & real RGB or curated palettes
 *  - dots:      Halftone dot matrix with radius/opacity response and square or hexagonal grids
 *  - aquarelle: Layered translucent watercolor washes, pigment bleed, capillary rims & paper grain
 *  - outline:   Color-aware contour/silhouette extraction with pure white (#FFFFFF) hollow interior
 *
 * Includes a 60fps interactive spotlight/hover overlay powered by cached cell geometry.
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
  dotStyle: 'brightness', // 'brightness' | 'darkness' | 'opacity'
  dotHexGrid: false,
  dotScale: 0.92,
  // Aquarelle (Watercolor) specific
  aquarelleSoftness: 62, // 20..100 wash spread & wet-on-wet bleed
  aquarellePigment: 92,  // 30..150 pigment intensity & edge pooling
  aquarelleDetail: 3,    // 1..5 brush pass detail scale
  aquarellePaperGrain: true,
  // Shape / Hollow Outline specific
  outlineThreshold: 34,   // 10..90 edge/shape sensitivity threshold
  outlineThickness: 2.2,  // 1..6 outline stroke thickness
  outlineDetail: 3,       // 1..5 silhouette simplicity vs fine contour detail
  outlineInkStyle: 'rgb', // 'rgb' | 'ink' | 'palette'
  // Interactive spotlight
  spotlightMode: 'magnify', // 'magnify' | 'reveal' | 'glow' | 'off'
  spotlightRadius: 115
};

// 4x4 Bayer ordered dithering matrix (normalized -0.5 to +0.5)
const BAYER_4X4 = [
  [0 / 16 - 0.5, 8 / 16 - 0.5, 2 / 16 - 0.5, 10 / 16 - 0.5],
  [12 / 16 - 0.5, 4 / 16 - 0.5, 14 / 16 - 0.5, 6 / 16 - 0.5],
  [3 / 16 - 0.5, 11 / 16 - 0.5, 1 / 16 - 0.5, 9 / 16 - 0.5],
  [15 / 16 - 0.5, 7 / 16 - 0.5, 13 / 16 - 0.5, 5 / 16 - 0.5]
];

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Fast deterministic PRNG so watercolor washes stay steady across slider updates
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
      const vr = clamp255(luma + (r - luma) * 1.42 + 8);
      const vg = clamp255(luma + (g - luma) * 1.42 + 8);
      const vb = clamp255(luma + (b - luma) * 1.42 + 8);
      return [vr, vg, vb];
    }
    case 'mono': {
      const v = isLightBg ? Math.round(20 + (1 - t) * 40) : Math.round(95 + t * 160);
      return isLightBg ? [v, v + 4, v + 12] : [v, v, v];
    }
    case 'matrix': {
      return [
        Math.round(18 + t * 70),
        Math.round(95 + t * 160),
        Math.round(35 + t * 80)
      ];
    }
    case 'amber': {
      return [
        Math.round(130 + t * 125),
        Math.round(68 + t * 145),
        Math.round(12 + t * 40)
      ];
    }
    case 'cyanotype': {
      return [
        Math.round(24 + t * 140),
        Math.round(95 + t * 135),
        Math.round(150 + t * 105)
      ];
    }
    case 'duotone': {
      const dr = Math.round(98 + t * 146);
      const dg = Math.round(64 + t * 136);
      const db = Math.round(220 + t * 35);
      return [dr, dg, db];
    }
    case 'rgb':
    default:
      return [Math.round(r), Math.round(g), Math.round(b)];
  }
}

// Cached procedural cold-press watercolor paper grain tile
let cachedPaperPatternCanvas = null;

function getPaperGrainTile() {
  if (cachedPaperPatternCanvas) return cachedPaperPatternCanvas;
  const size = 160;
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
      // Combine fine tooth grain with subtle organic fiber wave
      const wave =
        Math.sin(x * 0.19 + y * 0.07) * 6 +
        Math.cos(y * 0.23 - x * 0.05) * 5;
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

/**
 * Separable box blur over a flat RGB + Luminance buffer for clean shape simplification.
 */
function smoothField(srcR, srcG, srcB, w, h, radius) {
  if (radius <= 0) return { r: srcR, g: srcG, b: srcB };
  const len = w * h;
  const tmpR = new Float32Array(len);
  const tmpG = new Float32Array(len);
  const tmpB = new Float32Array(len);
  const outR = new Float32Array(len);
  const outG = new Float32Array(len);
  const outB = new Float32Array(len);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      for (let k = x0; k <= x1; k++) {
        const i = rowOff + k;
        sr += srcR[i];
        sg += srcG[i];
        sb += srcB[i];
        count++;
      }
      const dst = rowOff + x;
      tmpR[dst] = sr / count;
      tmpG[dst] = sg / count;
      tmpB[dst] = sb / count;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let count = 0;
      for (let k = y0; k <= y1; k++) {
        const i = k * w + x;
        sr += tmpR[i];
        sg += tmpG[i];
        sb += tmpB[i];
        count++;
      }
      const dst = y * w + x;
      outR[dst] = sr / count;
      outG[dst] = sg / count;
      outB[dst] = sb / count;
    }
  }

  return { r: outR, g: outG, b: outB };
}

/**
 * Aquarelle (Watercolor) Rendering Mode
 * Multi-pass luminous translucent watercolor washes, organic pigment bleed,
 * capillary wet-edge blooms, delicate edge washes, and cold-press paper tooth.
 * Engineered to look genuinely painterly on both bright daylight and dark studio photos.
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
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  // Watercolor paper base (warm cream or pure paper white by default; honors dark backdrop if user selects one)
  const paperHex = bgSpec.hex;
  ctx.fillStyle = paperHex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  const softnessNorm = Math.max(0, Math.min(1, (cfg.aquarelleSoftness - 20) / 80)); // 0..1
  const pigmentNorm = Math.max(0.35, Math.min(1.5, cfg.aquarellePigment / 100));   // 0.35..1.5
  const detailLevel = Math.max(1, Math.min(5, Math.round(cfg.aquarelleDetail)));

  // Helper: map a pixel into luminous watercolor pigment space (prevents dark shadows crushing to muddy black on paper)
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
      // Gently lift deep shadows into atmospheric indigo/charcoal washes while boosting watercolor pigment vibrancy
      const lift = 22 + softnessNorm * 14;
      const luma = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
      const chromaBoost = 1.12 + pigmentNorm * 0.12;
      cr = clamp255(lift + (luma + (cr - luma) * chromaBoost) * 0.9);
      cg = clamp255(lift + (luma + (cg - luma) * chromaBoost) * 0.9);
      cb = clamp255(lift + (luma + (cb - luma) * chromaBoost) * 0.92);
    }
    return [Math.round(cr), Math.round(cg), Math.round(cb), lum];
  };

  // Pass 0: Soft wet-on-wet under-wash so real photographic composition & hues stay luminous and clear
  const underScale = 10 + softnessNorm * 16;
  const underW = Math.max(48, Math.round(outWidth / underScale));
  const underH = Math.max(36, Math.round(outHeight / underScale));
  const underCanvas = document.createElement('canvas');
  underCanvas.width = underW;
  underCanvas.height = underH;
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
    // Let very bright highlights stay translucent so white paper glows through
    if (bgSpec.light && lum > 225) {
      uData.data[i + 3] = Math.round(((255 - lum) / 30) * 200);
    }
  }
  uctx.putImageData(uData, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = Math.min(0.88, 0.42 + pigmentNorm * 0.28);
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

  // Pass 1 (Broad Wet Washes) + Pass 2 (Mid Painterly Strokes) + Pass 3 (Fine Detail Dabs & Capillary Rims)
  const basePitch = Math.max(10, Math.round((cfg.cellSize * 2.0 + (5 - detailLevel) * 2.4) * scaleMultiplier));
  const passes = [
    {
      step: Math.max(20, Math.round(basePitch * 1.75 * cfg.spacing)),
      radiusMul: 1.25 + softnessNorm * 0.95,
      alpha: Math.min(0.42, 0.16 * pigmentNorm + 0.1),
      drawRim: false,
      recordCells: false
    },
    {
      step: Math.max(12, Math.round(basePitch * 1.0 * cfg.spacing)),
      radiusMul: 0.92 + softnessNorm * 0.55,
      alpha: Math.min(0.52, 0.22 * pigmentNorm + 0.12),
      drawRim: true,
      recordCells: true
    },
    {
      step: Math.max(7, Math.round(basePitch * (0.68 - detailLevel * 0.05) * cfg.spacing)),
      radiusMul: 0.7 + softnessNorm * 0.32,
      alpha: Math.min(0.56, 0.24 * pigmentNorm + 0.12),
      drawRim: detailLevel >= 3,
      recordCells: false
    }
  ];

  let finalCols = 0;
  let finalRows = 0;

  for (let pIdx = 0; pIdx < passes.length; pIdx++) {
    const pass = passes[pIdx];
    const cols = Math.max(12, Math.floor(outWidth / pass.step));
    const rows = Math.max(9, Math.floor(outHeight / pass.step));
    if (pIdx === 1) {
      finalCols = cols;
      finalRows = rows;
    }

    const sCanvas = document.createElement('canvas');
    sCanvas.width = cols;
    sCanvas.height = rows;
    const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(source, 0, 0, cols, rows);
    const data = sCtx.getImageData(0, 0, cols, rows).data;

    ctx.save();
    // Use source-over translucent layering so vivid real colors glow without ever crushing to muddy black
    ctx.globalCompositeOperation = 'source-over';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = (row * cols + col) * 4;
        if (data[idx + 3] < 16) continue;

        const [cr, cg, cb, lum] = toWatercolorRGB(data[idx], data[idx + 1], data[idx + 2]);

        // Preserve bright specular paper highlights naturally
        if (bgSpec.light && lum > 240 && pIdx > 0) continue;

        const jitterX = (rand() - 0.5) * pass.step * (0.48 + softnessNorm * 0.34);
        const jitterY = (rand() - 0.5) * pass.step * (0.48 + softnessNorm * 0.34);
        const cx = (col + 0.5) * (outWidth / cols) + jitterX;
        const cy = (row + 0.5) * (outHeight / rows) + jitterY;
        const r = pass.step * pass.radiusMul * (0.8 + rand() * 0.42);

        // Multi-stop feathered radial wash gradient (authentic soft edge bleed)
        const grad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
        const coreAlpha = Math.min(0.68, pass.alpha * (cfg.invert ? 0.65 + (lum / 255) * 0.45 : 0.8 + (1 - lum / 255) * 0.25));
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${coreAlpha.toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},${(coreAlpha * 0.62).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);

        const scaleX = 0.78 + rand() * 0.46;
        const scaleY = 0.78 + rand() * 0.46;
        const rot = rand() * Math.PI;

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * scaleX, r * scaleY, rot, 0, Math.PI * 2);
        ctx.fill();

        // Subtle capillary pigment rim (drying watercolor edge bloom)
        if (pass.drawRim && rand() > 0.52) {
          const rimR = Math.round(cr * 0.78);
          const rimG = Math.round(cg * 0.78);
          const rimB = Math.round(cb * 0.78);
          ctx.strokeStyle = `rgba(${rimR},${rimG},${rimB},${(pass.alpha * 0.32).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, 1.25 * scaleMultiplier);
          ctx.beginPath();
          ctx.ellipse(cx, cy, r * scaleX * 0.84, r * scaleY * 0.84, rot, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (pass.recordCells && cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: '', alpha: coreAlpha, radius: r * 0.52 });
        }
      }
    }

    ctx.restore();
  }

  // Pass 4: Delicate watercolor edge wash accents along major subject contours
  const edgeW = Math.min(260, Math.max(110, Math.round(outWidth / (5 - detailLevel * 0.55))));
  const edgeH = Math.max(70, Math.round((edgeW * outHeight) / outWidth));
  const eCanvas = document.createElement('canvas');
  eCanvas.width = edgeW;
  eCanvas.height = edgeH;
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
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const edgeCutoff = 48 - detailLevel * 5;

  for (let y = 1; y < edgeH - 1; y++) {
    for (let x = 1; x < edgeW - 1; x++) {
      const i = y * edgeW + x;
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
      const strength = Math.min(1, (mag - edgeCutoff) / 70);
      const alpha = strength * Math.min(0.32, 0.16 * pigmentNorm);
      const rad = Math.max(1.2, (1.5 + softnessNorm * 1.4) * scaleMultiplier);

      ctx.fillStyle = `rgba(${Math.round(cr * 0.72)},${Math.round(cg * 0.72)},${Math.round(cb * 0.72)},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc((x + 0.5) * sx, (y + 0.5) * sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Pass 5: Subtle cold-press watercolor paper grain texture overlay
  if (cfg.aquarellePaperGrain) {
    ctx.save();
    const pattern = ctx.createPattern(getPaperGrainTile(), 'repeat');
    if (pattern) {
      ctx.globalCompositeOperation = bgSpec.light ? 'multiply' : 'overlay';
      ctx.globalAlpha = bgSpec.light ? 0.55 : 0.28;
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
    stepX: basePitch,
    stepY: basePitch,
    bgHex: paperHex,
    renderMs,
    textOutput: ''
  };
}

/**
 * Shape / Hollow Outline Rendering Mode
 * Detects main shapes, contours, and silhouettes via color-aware Sobel + corrected 8-way
 * Non-Maximum Suppression + adaptive thresholding, drawing continuous crisp contour strokes
 * while keeping the interior pure white (#FFFFFF).
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
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  // Always keep interior crisp white (#FFFFFF) so shapes & silhouettes stand out clearly
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
  // Working grid scales cleanly with detail level for crisp, clean silhouettes
  const targetMaxW = 180 + detail * 65; // 245px (bold silhouettes) -> 505px (fine contours)
  const w = Math.min(outWidth, targetMaxW);
  const h = Math.max(60, Math.round((w * outHeight) / outWidth));

  const sCanvas = document.createElement('canvas');
  sCanvas.width = w;
  sCanvas.height = h;
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

  // Smooth out micro-texture so main shapes and silhouettes stay crisp and uncluttered
  const smoothRadius = detail <= 2 ? 2 : detail <= 4 ? 1 : 0;
  const { r: fR, g: fG, b: fB } = smoothField(rawR, rawG, rawB, w, h, smoothRadius);
  const fL = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    fL[i] = 0.2126 * fR[i] + 0.7152 * fG[i] + 0.0722 * fB[i];
  }

  // Color-aware + Luminance Sobel gradient magnitude & angle
  const mag = new Float32Array(len);
  const dir = new Uint8Array(len); // 0:0°, 1:45°, 2:90°, 3:135°
  let maxMag = 1;
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
      if (bestM > maxMag) maxMag = bestM;
      hist[Math.min(255, Math.floor(bestM))]++;

      // Quantize gradient normal angle to 4 axes (in image coordinates where +y is down)
      let angle = (Math.atan2(bestGy, bestGx) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      if (angle < 22.5 || angle >= 157.5) dir[i] = 0;       // Horizontal gradient (left/right)
      else if (angle < 67.5) dir[i] = 1;                    // +45° gradient (top-left / bottom-right)
      else if (angle < 112.5) dir[i] = 2;                   // Vertical gradient (top/bottom)
      else dir[i] = 3;                                      // +135° gradient (top-right / bottom-left)
    }
  }

  // Adaptive 97th-percentile reference magnitude so both subtle and high-contrast photos yield crisp contours
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

  // Map user outlineThreshold (10..88) cleanly into adaptive threshold
  const sliderNorm = Math.max(0.05, Math.min(0.95, cfg.outlineThreshold / 100));
  const threshold = Math.max(7, p97 * (0.22 + sliderNorm * 0.95));
  const softFloor = threshold * 0.48;

  // Non-Maximum Suppression with CORRECT normal neighbors across all 4 axes
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
        // +45° in screen space (+x,+y) and (-x,-y)
        n1 = mag[i - w - 1];
        n2 = mag[i + w + 1];
      } else if (d === 2) {
        n1 = mag[i - w];
        n2 = mag[i + w];
      } else {
        // +135° in screen space (-x,+y) and (+x,-y)
        n1 = mag[i - w + 1];
        n2 = mag[i + w - 1];
      }

      if (m < n1 || m < n2) continue;
      edgeStrength[i] = m;
    }
  }

  // Dual-threshold hysteresis mask (preserve continuous contour curves)
  const active = new Uint8Array(len);
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = rowOff + x;
      const m = edgeStrength[i];
      if (m <= 0) continue;
      if (m >= threshold) {
        active[i] = 1;
      } else if (
        edgeStrength[i - w - 1] >= threshold || edgeStrength[i - w] >= threshold || edgeStrength[i - w + 1] >= threshold ||
        edgeStrength[i - 1] >= threshold || edgeStrength[i + 1] >= threshold ||
        edgeStrength[i + w - 1] >= threshold || edgeStrength[i + w] >= threshold || edgeStrength[i + w + 1] >= threshold
      ) {
        active[i] = 1;
      }
    }
  }

  // Compute crisp contour color helper (guaranteed high visibility against pure #FFFFFF interior)
  const getContourColor = (i) => {
    if (cfg.outlineInkStyle === 'ink') {
      return [15, 23, 42];
    }
    if (cfg.outlineInkStyle === 'palette') {
      const [pr, pg, pb] = mapPaletteColor(fR[i], fG[i], fB[i], fL[i], cfg.colorMode, true);
      return [Math.round(pr * 0.68), Math.round(pg * 0.68), Math.round(pb * 0.68)];
    }
    // 'rgb' — Real subject contour colors deepened for razor-sharp contrast on white paper
    const lum = fL[i];
    const darken = lum > 175 ? 0.52 : lum > 120 ? 0.68 : 0.85;
    // Boost chromatic saturation slightly so edges stay vivid rather than gray
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

  // Render continuous connected contour strokes over pure white #FFFFFF interior
  const sx = outWidth / w;
  const sy = outHeight / h;
  const strokeWidth = Math.max(1.0, cfg.outlineThickness * scaleMultiplier);
  const cells = options.skipCells ? null : [];
  let contourCount = 0;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Forward 4-neighbor offsets to connect every adjacent contour pair exactly once without gaps
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
      const strength = Math.min(1, (edgeStrength[i] - softFloor) / Math.max(10, threshold * 0.85));
      const [cr, cg, cb] = getContourColor(i);
      const alpha = Math.min(1, 0.52 + strength * 0.48);
      const cx = (x + 0.5) * sx;
      const cy = (y + 0.5) * sy;

      let connected = false;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
      ctx.lineWidth = strokeWidth * (0.78 + strength * 0.34);

      for (let k = 0; k < 4; k++) {
        const nx = x + forwardOffsets[k][0];
        const ny = y + forwardOffsets[k][1];
        const ni = ny * w + nx;
        if (active[ni]) {
          connected = true;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo((nx + 0.5) * sx, (ny + 0.5) * sy);
          ctx.stroke();
        }
      }

      if (!connected) {
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, strokeWidth * 0.52, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cells && (contourCount % 2 === 0 || detail <= 2)) {
        cells.push({ cx, cy, r: cr, g: cg, b: cb, lum: fL[i], char: '', alpha, radius: strokeWidth * 0.62 });
      }
    }
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
  const maxDim = options.maxDimension || 1100;

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

  // Dispatch to specialized painterly / contour pipelines
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

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(source, 0, 0, cols, rows);
  const pixelData = sampleCtx.getImageData(0, 0, cols, rows).data;

  const baseCanvas = document.createElement('canvas');
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
        // Dots / Halftone Mode
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
 * Composites the cached base render plus the interactive cursor spotlight effect
 * onto the visible display canvas at 60fps.
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
    const ringGrad = ctx.createRadialGradient(x, y, radius * 0.72, x, y, radius);
    ringGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    ringGrad.addColorStop(0.92, 'rgba(56, 189, 248, 0.22)');
    ringGrad.addColorStop(1, 'rgba(255, 255, 255, 0.65)');
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = ringGrad;
    ctx.fill();
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

  // 'magnify' mode across all 5 rendering engines
  if (!renderResult.cells) return;
  const r2 = radius * radius;
  const cells = renderResult.cells;

  if (config.mode === 'aquarelle') {
    // Wet watercolor bloom shimmer inside spotlight
    ctx.save();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const dx = cell.cx - x;
      const dy = cell.cy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const t = 1 - Math.sqrt(dist2) / radius;
      const smooth = t * t * (3 - 2 * t);
      const bloomR = Math.max(4, cell.radius * (1 + smooth * 0.65));
      const grad = ctx.createRadialGradient(cell.cx, cell.cy, bloomR * 0.1, cell.cx, cell.cy, bloomR);
      grad.addColorStop(0, `rgba(${cell.r},${cell.g},${cell.b},${(smooth * 0.34).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${cell.r},${cell.g},${cell.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, bloomR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (config.mode === 'outline') {
    // Crisp contour thickening & subtle highlight inside spotlight over pure white interior
    ctx.save();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const dx = cell.cx - x;
      const dy = cell.cy - y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > r2) continue;
      const t = 1 - Math.sqrt(dist2) / radius;
      const smooth = t * t * (3 - 2 * t);
      const scaledR = Math.max(1.1, cell.radius * (1 + smooth * 0.95));
      ctx.fillStyle = `rgba(${cell.r},${cell.g},${cell.b},${Math.min(1, cell.alpha + smooth * 0.35).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cell.cx, cell.cy, scaledR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Binary, ASCII, Dots: Mask core softly and draw magnified luminous cells
  ctx.save();
  const clearGrad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
  clearGrad.addColorStop(0, renderResult.bgHex);
  clearGrad.addColorStop(0.75, renderResult.bgHex);
  clearGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = clearGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
  halo.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
  halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
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
      ctx.font = `700 ${scaledFont}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(1, cell.alpha + smooth * 0.45).toFixed(3)})`;
      ctx.fillText(cell.char, px, py);
    }
  }

  ctx.restore();
}
