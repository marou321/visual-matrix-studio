/**
 * ChromaGlyph Studio — Core Color-True Rendering Engine
 * Modes:
 *  - binary: 0/1 character art mapped by luminance threshold (with optional Bayer 4x4 dithering)
 *  - ascii:  Multi-ramp character art mapped by optical density & real RGB or curated palettes
 *  - dots:   Halftone dot matrix with radius/opacity response and square or hexagonal grids
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
  paper: { label: 'Gallery Paper', hex: '#f8fafc', light: true },
  warm: { label: 'Warm Cream', hex: '#f5f0e6', light: true }
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

function adjustPixelColor(r, g, b, contrastFactor, brightnessOffset, satFactor) {
  // Contrast + brightness
  let nr = (r - 128) * contrastFactor + 128 + brightnessOffset;
  let ng = (g - 128) * contrastFactor + 128 + brightnessOffset;
  let nb = (b - 128) * contrastFactor + 128 + brightnessOffset;

  nr = clamp255(nr);
  ng = clamp255(ng);
  nb = clamp255(nb);

  // Saturation around Rec. 709 luma
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
      // Blend deep violet-indigo shadows into electric cyan/pink highlights
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

  const cellSize = Math.max(4, Math.round(cfg.cellSize * scaleMultiplier));
  const stepX = Math.max(4, Math.round(cellSize * cfg.spacing));
  // Monospace characters are naturally taller than wide; keep dots square
  const stepY =
    cfg.mode === 'dots'
      ? stepX
      : Math.max(4, Math.round(cellSize * cfg.spacing * 1.05));

  const cols = Math.max(8, Math.floor(outWidth / stepX));
  const rows = Math.max(6, Math.floor(outHeight / stepY));

  // Sample source into a tiny grid canvas matching cols x rows for fast block averaging
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(source, 0, 0, cols, rows);
  const pixelData = sampleCtx.getImageData(0, 0, cols, rows).data;

  // Base output canvas
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = outWidth;
  baseCanvas.height = outHeight;
  const ctx = baseCanvas.getContext('2d');

  const bgSpec = CANVAS_BACKGROUNDS[cfg.background] || CANVAS_BACKGROUNDS.obsidian;
  ctx.fillStyle = bgSpec.hex;
  ctx.fillRect(0, 0, outWidth, outHeight);

  // Optional dimmed original underlay
  if (cfg.underlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = cfg.underlayOpacity;
    ctx.drawImage(source, 0, 0, outWidth, outHeight);
    ctx.restore();
  }

  // Contrast formula: classic -100..100 mapping
  const cVal = cfg.contrast * 2.55;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const brightnessOffset = cfg.brightness * 2.1;
  const satFactor = cfg.saturation / 100;

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

      // Rec. 709 relative luminance
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

        // Subtle opacity nuance so dark 0s recede slightly while bright 1s pop
        const bitAlpha = bit === '1' ? 0.98 : bgSpec.light ? 0.42 : 0.36;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${bitAlpha.toFixed(2)})`;
        ctx.fillText(bit, cx, cy);

        if (textLines) lineStr += bit;
        if (cells) {
          cells.push({ cx, cy, r: cr, g: cg, b: cb, lum, char: bit, alpha: bitAlpha, radius: 0 });
        }
      } else if (cfg.mode === 'ascii') {
        // On dark bg, brighter pixels get denser glyphs (@, #); on light bg or inverted, darker pixels do
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
          // opacity + size harmonic
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
    // Feathered radial lens revealing the crisp original photograph
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(sourceImage, 0, 0, displayCanvas.width, displayCanvas.height);
    ctx.restore();

    // Subtle lens ring
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
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y, 4, x, y, radius * 1.25);
    glow.addColorStop(0, 'rgba(56, 189, 248, 0.32)');
    glow.addColorStop(0.48, 'rgba(167, 139, 250, 0.16)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Default: 'magnify' — illuminate & dynamically scale/repel glyphs or dots inside radius
  if (!renderResult.cells) return;
  const r2 = radius * radius;

  // Mask out base cells softly inside the spotlight core so magnified ones look razor-sharp
  ctx.save();
  const clearGrad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
  clearGrad.addColorStop(0, renderResult.bgHex);
  clearGrad.addColorStop(0.75, renderResult.bgHex);
  clearGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = clearGrad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle radial glow halo
  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
  halo.addColorStop(0, 'rgba(56, 189, 248, 0.14)');
  halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cells = renderResult.cells;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const dx = cell.cx - x;
    const dy = cell.cy - y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > r2) continue;

    const dist = Math.sqrt(dist2);
    const t = 1 - dist / radius; // 1 at center, 0 at rim
    const smooth = t * t * (3 - 2 * t);

    // Subtle radial magnification displacement
    const push = smooth * 7;
    const nx = dist > 0.001 ? dx / dist : 0;
    const ny = dist > 0.001 ? dy / dist : 0;
    const px = cell.cx + nx * push;
    const py = cell.cy + ny * push;

    // Brighten cell RGB gently toward highlight
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
