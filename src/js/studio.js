/**
 * ChromaGlyph Studio — Interactive Multi-Mode Canvas Studio Controller
 * Supports Binary (0/1), ASCII, Dots / Halftone, Aquarelle (Watercolor), and Shape / Hollow Outline modes.
 */

import { SAMPLE_IMAGES, loadSampleImage, getSampleById } from './samples.js';
import {
  DEFAULT_CONFIG,
  renderArtwork,
  compositeWithSpotlight
} from './renderer.js';
import { getGalleryItemById } from './gallery-data.js';
import { showToast } from './theme.js';

const MODE_LABELS = {
  binary: 'Binary 0/1',
  ascii: 'ASCII',
  dots: 'Dots / Halftone',
  aquarelle: 'Aquarelle',
  outline: 'Hollow Outline'
};

function initStudio() {
  const canvas = document.getElementById('studio-canvas');
  if (!canvas || canvas.dataset.studioReady === '1') return;
  canvas.dataset.studioReady = '1';

  const state = {
    config: { ...DEFAULT_CONFIG },
    sourceImage: null,
    workingSource: null,
    sourceLabel: 'Neon Portrait',
    activeSampleId: 'neon-portrait',
    renderResult: null,
    showOriginal: false,
    pointer: { active: false, x: 0, y: 0 },
    rafId: null,
    renderRafId: null,
    renderTimer: null,
    settleTimer: null,
    renderVersion: 0,
    lastRenderEnd: 0,
    lastRenderMs: 10,
    loadToken: 0,
    canvasRect: null
  };

  // Persistent offscreen buffer reused across interactive preview frames (zero GC churn)
  const previewBaseCanvas = document.createElement('canvas');

  function buildWorkingSource(img) {
    const w = Math.max(1, img.naturalWidth || img.width || 960);
    const h = Math.max(1, img.naturalHeight || img.height || 720);
    const maxWorking = 960;
    if (Math.max(w, h) <= maxWorking) {
      return img;
    }
    const scale = maxWorking / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const cctx = c.getContext('2d');
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function invalidateCanvasRect() {
    state.canvasRect = null;
  }

  // DOM References
  const sampleStrip = document.getElementById('sample-strip');
  const fileInput = document.getElementById('image-upload-input');
  const uploadBtn = document.getElementById('upload-trigger-btn');
  const viewport = document.getElementById('canvas-viewport');
  const compareBtn = document.getElementById('compare-original-btn');
  const resetBtn = document.getElementById('reset-controls-btn');
  const randomizeBtn = document.getElementById('randomize-recipe-btn');
  const downloadBtn = document.getElementById('download-png-btn');
  const exportScaleSelect = document.getElementById('export-scale-select');
  const copyTextBtn = document.getElementById('copy-text-btn');
  const spotlightHint = document.getElementById('spotlight-hint');

  // Telemetry
  const statDims = document.getElementById('stat-dims');
  const statGrid = document.getElementById('stat-grid');
  const statMode = document.getElementById('stat-mode');
  const statTime = document.getElementById('stat-time');

  // Mode Tabs & Mode-Specific Panels
  const modeTabs = document.querySelectorAll('.mode-tab');
  const binaryPanel = document.getElementById('panel-binary-options');
  const asciiPanel = document.getElementById('panel-ascii-options');
  const dotsPanel = document.getElementById('panel-dots-options');
  const aquarellePanel = document.getElementById('panel-aquarelle-options');
  const outlinePanel = document.getElementById('panel-outline-options');

  // Inputs
  const inputs = {
    cellSize: document.getElementById('ctrl-cell-size'),
    spacing: document.getElementById('ctrl-spacing'),
    contrast: document.getElementById('ctrl-contrast'),
    brightness: document.getElementById('ctrl-brightness'),
    saturation: document.getElementById('ctrl-saturation'),
    underlayOpacity: document.getElementById('ctrl-underlay'),
    colorMode: document.getElementById('ctrl-color-mode'),
    invert: document.getElementById('ctrl-invert'),
    binaryThreshold: document.getElementById('ctrl-binary-threshold'),
    binaryDither: document.getElementById('ctrl-binary-dither'),
    asciiRamp: document.getElementById('ctrl-ascii-ramp'),
    dotStyle: document.getElementById('ctrl-dot-style'),
    dotHexGrid: document.getElementById('ctrl-dot-hex'),
    dotScale: document.getElementById('ctrl-dot-scale'),
    aquarelleSoftness: document.getElementById('ctrl-aquarelle-softness'),
    aquarellePigment: document.getElementById('ctrl-aquarelle-pigment'),
    aquarelleDetail: document.getElementById('ctrl-aquarelle-detail'),
    aquarellePaperGrain: document.getElementById('ctrl-aquarelle-grain'),
    outlineThreshold: document.getElementById('ctrl-outline-threshold'),
    outlineThickness: document.getElementById('ctrl-outline-thickness'),
    outlineDetail: document.getElementById('ctrl-outline-detail'),
    outlineInkStyle: document.getElementById('ctrl-outline-ink'),
    spotlightMode: document.getElementById('ctrl-spotlight-mode'),
    spotlightRadius: document.getElementById('ctrl-spotlight-radius')
  };

  const outputs = {
    cellSize: document.getElementById('val-cell-size'),
    spacing: document.getElementById('val-spacing'),
    contrast: document.getElementById('val-contrast'),
    brightness: document.getElementById('val-brightness'),
    saturation: document.getElementById('val-saturation'),
    underlayOpacity: document.getElementById('val-underlay'),
    binaryThreshold: document.getElementById('val-binary-threshold'),
    dotScale: document.getElementById('val-dot-scale'),
    aquarelleSoftness: document.getElementById('val-aquarelle-softness'),
    aquarellePigment: document.getElementById('val-aquarelle-pigment'),
    aquarelleDetail: document.getElementById('val-aquarelle-detail'),
    outlineThreshold: document.getElementById('val-outline-threshold'),
    outlineThickness: document.getElementById('val-outline-thickness'),
    outlineDetail: document.getElementById('val-outline-detail'),
    spotlightRadius: document.getElementById('val-spotlight-radius')
  };

  const bgSwatches = document.querySelectorAll('[data-bg-swatch]');

  // Build sample picker buttons
  function renderSampleStrip() {
    if (!sampleStrip) return;
    sampleStrip.innerHTML = '<span class="sample-strip-label">Samples</span>';
    SAMPLE_IMAGES.forEach((sample) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sample-thumb-btn${state.activeSampleId === sample.id ? ' active' : ''}`;
      btn.dataset.sampleId = sample.id;
      btn.innerHTML = `<img src="${sample.src}" alt="" loading="lazy" /><span>${sample.name}</span>`;
      btn.addEventListener('click', () => selectSample(sample.id));
      sampleStrip.appendChild(btn);
    });
  }

  function updateSampleActiveState() {
    document.querySelectorAll('.sample-thumb-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sampleId === state.activeSampleId);
    });
  }

  function syncControlsFromConfig() {
    const c = state.config;

    modeTabs.forEach((tab) => {
      const active = tab.dataset.mode === c.mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    binaryPanel.classList.toggle('hidden-panel', c.mode !== 'binary');
    asciiPanel.classList.toggle('hidden-panel', c.mode !== 'ascii');
    dotsPanel.classList.toggle('hidden-panel', c.mode !== 'dots');
    aquarellePanel.classList.toggle('hidden-panel', c.mode !== 'aquarelle');
    outlinePanel.classList.toggle('hidden-panel', c.mode !== 'outline');

    if (copyTextBtn) {
      copyTextBtn.style.display = c.mode === 'binary' || c.mode === 'ascii' ? 'inline-flex' : 'none';
    }

    inputs.cellSize.value = c.cellSize;
    inputs.spacing.value = c.spacing;
    inputs.contrast.value = c.contrast;
    inputs.brightness.value = c.brightness;
    inputs.saturation.value = c.saturation;
    inputs.underlayOpacity.value = Math.round(c.underlayOpacity * 100);
    inputs.colorMode.value = c.colorMode;
    inputs.invert.checked = c.invert;
    inputs.binaryThreshold.value = c.binaryThreshold;
    inputs.binaryDither.checked = c.binaryDither;
    inputs.asciiRamp.value = c.asciiRamp;
    inputs.dotStyle.value = c.dotStyle;
    inputs.dotHexGrid.checked = c.dotHexGrid;
    inputs.dotScale.value = Math.round(c.dotScale * 100);
    inputs.aquarelleSoftness.value = c.aquarelleSoftness;
    inputs.aquarellePigment.value = c.aquarellePigment;
    inputs.aquarelleDetail.value = c.aquarelleDetail;
    inputs.aquarellePaperGrain.checked = c.aquarellePaperGrain;
    inputs.outlineThreshold.value = c.outlineThreshold;
    inputs.outlineThickness.value = c.outlineThickness;
    inputs.outlineDetail.value = c.outlineDetail;
    inputs.outlineInkStyle.value = c.outlineInkStyle;
    inputs.spotlightMode.value = c.spotlightMode;
    inputs.spotlightRadius.value = c.spotlightRadius;

    outputs.cellSize.textContent = `${c.cellSize}px`;
    outputs.spacing.textContent = `${Number(c.spacing).toFixed(2)}×`;
    outputs.contrast.textContent = `${c.contrast > 0 ? '+' : ''}${c.contrast}%`;
    outputs.brightness.textContent = `${c.brightness > 0 ? '+' : ''}${c.brightness}%`;
    outputs.saturation.textContent = `${c.saturation}%`;
    outputs.underlayOpacity.textContent = `${Math.round(c.underlayOpacity * 100)}%`;
    outputs.binaryThreshold.textContent = `${c.binaryThreshold}`;
    outputs.dotScale.textContent = `${Math.round(c.dotScale * 100)}%`;
    outputs.aquarelleSoftness.textContent = `${c.aquarelleSoftness}%`;
    outputs.aquarellePigment.textContent = `${c.aquarellePigment}%`;
    outputs.aquarelleDetail.textContent = `Level ${c.aquarelleDetail}`;
    outputs.outlineThreshold.textContent = `${c.outlineThreshold}`;
    outputs.outlineThickness.textContent = `${Number(c.outlineThickness).toFixed(1)}px`;
    outputs.outlineDetail.textContent = `Level ${c.outlineDetail}`;
    outputs.spotlightRadius.textContent = `${c.spotlightRadius}px`;

    bgSwatches.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bgSwatch === c.background);
    });

    if (spotlightHint) {
      if (c.spotlightMode === 'off') {
        spotlightHint.textContent = 'Hover spotlight: Off';
      } else if (c.spotlightMode === 'reveal') {
        spotlightHint.textContent = 'Hover canvas: Original reveal lens';
      } else if (c.spotlightMode === 'glow') {
        spotlightHint.textContent = 'Hover canvas: Chromatic glow';
      } else if (c.mode === 'aquarelle') {
        spotlightHint.textContent = 'Hover canvas: Watercolor bloom spotlight';
      } else if (c.mode === 'outline') {
        spotlightHint.textContent = 'Hover canvas: Contour highlight lens';
      } else {
        spotlightHint.textContent = 'Hover canvas: Interactive spotlight active';
      }
    }
  }

  function paintFrame() {
    if (!state.renderResult) return;

    if (state.showOriginal && state.workingSource) {
      const ctx = canvas.getContext('2d');
      canvas.width = state.renderResult.width;
      canvas.height = state.renderResult.height;
      ctx.drawImage(state.workingSource, 0, 0, canvas.width, canvas.height);
      return;
    }

    compositeWithSpotlight(
      canvas,
      state.renderResult,
      state.workingSource || state.sourceImage,
      state.config,
      state.pointer
    );
  }

  function runRender(maxDimension, isDraft = false) {
    const src = state.workingSource || state.sourceImage;
    if (!src) return;
    try {
      state.renderResult = renderArtwork(src, state.config, {
        maxDimension,
        maxCells: isDraft ? 3200 : 7200,
        isDraft,
        targetCanvas: previewBaseCanvas
      });
      paintFrame();
      invalidateCanvasRect();

      const r = state.renderResult;
      state.lastRenderMs = r.renderMs || 12;
      state.lastRenderEnd = performance.now();

      if (statDims) statDims.textContent = `${r.width}×${r.height}px`;
      if (statGrid) {
        if (state.config.mode === 'aquarelle') {
          statGrid.textContent = `${r.cols}×${r.rows} pigment washes`;
        } else if (state.config.mode === 'outline') {
          statGrid.textContent = `${r.cols} lines · ${r.rows} shapes`;
        } else {
          statGrid.textContent = `${r.cols}×${r.rows} (${(r.cols * r.rows).toLocaleString()} cells)`;
        }
      }
      if (statMode) statMode.textContent = MODE_LABELS[state.config.mode] || state.config.mode;
      if (statTime) statTime.textContent = `${r.renderMs}ms`;
    } catch (err) {
      console.error('ChromaGlyph render error:', err);
    }
  }

  function scheduleFullRender(immediate = false) {
    if (!state.sourceImage) return;

    // Coalesce & cancel all stale pending renders via monotonic version token
    const version = ++state.renderVersion;
    state.pointer.active = false;
    clearTimeout(state.renderTimer);
    clearTimeout(state.settleTimer);
    state.renderTimer = null;
    state.settleTimer = null;
    if (state.renderRafId) {
      cancelAnimationFrame(state.renderRafId);
      state.renderRafId = null;
    }

    if (immediate) {
      state.renderRafId = requestAnimationFrame(() => {
        state.renderRafId = null;
        if (version !== state.renderVersion) return;
        runRender(780, false);
      });
      return;
    }

    // Coalesced debounced draft render during rapid slider drag (never queues overlapping frames)
    const elapsed = performance.now() - state.lastRenderEnd;
    const minGap = Math.max(40, Math.min(160, state.lastRenderMs * 1.5));
    const delay = Math.max(20, Math.round(minGap - elapsed));

    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      if (version !== state.renderVersion) return;
      state.renderRafId = requestAnimationFrame(() => {
        state.renderRafId = null;
        if (version !== state.renderVersion) return;
        runRender(520, true);
      });
    }, delay);

    // Final crisp settled render after slider stops moving
    state.settleTimer = setTimeout(() => {
      state.settleTimer = null;
      if (version !== state.renderVersion) return;
      state.renderRafId = requestAnimationFrame(() => {
        state.renderRafId = null;
        if (version !== state.renderVersion) return;
        runRender(780, false);
      });
    }, 180);
  }

  function scheduleSpotlightPaint() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(() => {
      state.rafId = null;
      paintFrame();
    });
  }

  async function selectSample(sampleId) {
    const token = ++state.loadToken;
    const sample = getSampleById(sampleId);
    state.activeSampleId = sample.id;
    state.sourceLabel = sample.name;
    updateSampleActiveState();
    const img = await loadSampleImage(sample.id);
    if (token !== state.loadToken) return;
    state.sourceImage = img;
    state.workingSource = buildWorkingSource(img);
    scheduleFullRender(true);
  }

  function handleUploadedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP, or GIF).');
      return;
    }
    const token = ++state.loadToken;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (token !== state.loadToken) return;
      state.sourceImage = img;
      state.workingSource = buildWorkingSource(img);
      state.activeSampleId = '';
      state.sourceLabel = file.name.replace(/\.[^.]+$/, '');
      updateSampleActiveState();
      scheduleFullRender(true);
      showToast(`Loaded "${file.name}" locally in browser.`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showToast('Could not decode that image file. Try PNG, JPG, or WebP.');
    };
    img.src = objectUrl;
  }

  // Event Listeners: Mode Tabs with smart backdrop adaptation & Compare-Original auto-exit
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const prevMode = state.config.mode;
      const nextMode = tab.dataset.mode;
      state.config.mode = nextMode;

      // Exit "Compare Original" automatically when switching modes so the new mode renders immediately
      if (state.showOriginal) {
        state.showOriginal = false;
        if (compareBtn) {
          compareBtn.classList.remove('btn-active');
          compareBtn.setAttribute('aria-pressed', 'false');
          compareBtn.textContent = 'Compare Original';
        }
      }

      // Adapt canvas backdrop automatically for ideal first impression when switching between dark-native and paper-native modes
      if (nextMode === 'aquarelle' && ['obsidian', 'black', 'slate'].includes(state.config.background)) {
        state.config.background = 'warm';
      } else if (nextMode === 'outline') {
        state.config.background = 'paper';
      } else if (
        (prevMode === 'aquarelle' || prevMode === 'outline') &&
        (nextMode === 'binary' || nextMode === 'ascii' || nextMode === 'dots') &&
        (state.config.background === 'warm' || state.config.background === 'paper')
      ) {
        state.config.background = 'obsidian';
      }

      syncControlsFromConfig();
      scheduleFullRender(true);
    });
  });

  // Range & Input Listeners
  inputs.cellSize.addEventListener('input', (e) => {
    state.config.cellSize = Number(e.target.value);
    outputs.cellSize.textContent = `${state.config.cellSize}px`;
    scheduleFullRender();
  });

  inputs.spacing.addEventListener('input', (e) => {
    state.config.spacing = Number(e.target.value);
    outputs.spacing.textContent = `${state.config.spacing.toFixed(2)}×`;
    scheduleFullRender();
  });

  inputs.contrast.addEventListener('input', (e) => {
    state.config.contrast = Number(e.target.value);
    outputs.contrast.textContent = `${state.config.contrast > 0 ? '+' : ''}${state.config.contrast}%`;
    scheduleFullRender();
  });

  inputs.brightness.addEventListener('input', (e) => {
    state.config.brightness = Number(e.target.value);
    outputs.brightness.textContent = `${state.config.brightness > 0 ? '+' : ''}${state.config.brightness}%`;
    scheduleFullRender();
  });

  inputs.saturation.addEventListener('input', (e) => {
    state.config.saturation = Number(e.target.value);
    outputs.saturation.textContent = `${state.config.saturation}%`;
    scheduleFullRender();
  });

  inputs.underlayOpacity.addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    state.config.underlayOpacity = pct / 100;
    outputs.underlayOpacity.textContent = `${pct}%`;
    scheduleFullRender();
  });

  inputs.colorMode.addEventListener('change', (e) => {
    state.config.colorMode = e.target.value;
    scheduleFullRender(true);
  });

  inputs.invert.addEventListener('change', (e) => {
    state.config.invert = e.target.checked;
    scheduleFullRender(true);
  });

  inputs.binaryThreshold.addEventListener('input', (e) => {
    state.config.binaryThreshold = Number(e.target.value);
    outputs.binaryThreshold.textContent = `${state.config.binaryThreshold}`;
    scheduleFullRender();
  });

  inputs.binaryDither.addEventListener('change', (e) => {
    state.config.binaryDither = e.target.checked;
    scheduleFullRender(true);
  });

  inputs.asciiRamp.addEventListener('change', (e) => {
    state.config.asciiRamp = e.target.value;
    scheduleFullRender(true);
  });

  inputs.dotStyle.addEventListener('change', (e) => {
    state.config.dotStyle = e.target.value;
    scheduleFullRender(true);
  });

  inputs.dotHexGrid.addEventListener('change', (e) => {
    state.config.dotHexGrid = e.target.checked;
    scheduleFullRender(true);
  });

  inputs.dotScale.addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    state.config.dotScale = pct / 100;
    outputs.dotScale.textContent = `${pct}%`;
    scheduleFullRender();
  });

  // Aquarelle Mode Controls
  inputs.aquarelleSoftness.addEventListener('input', (e) => {
    state.config.aquarelleSoftness = Number(e.target.value);
    outputs.aquarelleSoftness.textContent = `${state.config.aquarelleSoftness}%`;
    scheduleFullRender();
  });

  inputs.aquarellePigment.addEventListener('input', (e) => {
    state.config.aquarellePigment = Number(e.target.value);
    outputs.aquarellePigment.textContent = `${state.config.aquarellePigment}%`;
    scheduleFullRender();
  });

  inputs.aquarelleDetail.addEventListener('input', (e) => {
    state.config.aquarelleDetail = Number(e.target.value);
    outputs.aquarelleDetail.textContent = `Level ${state.config.aquarelleDetail}`;
    scheduleFullRender();
  });

  inputs.aquarellePaperGrain.addEventListener('change', (e) => {
    state.config.aquarellePaperGrain = e.target.checked;
    scheduleFullRender(true);
  });

  // Shape / Hollow Outline Mode Controls
  inputs.outlineThreshold.addEventListener('input', (e) => {
    state.config.outlineThreshold = Number(e.target.value);
    outputs.outlineThreshold.textContent = `${state.config.outlineThreshold}`;
    scheduleFullRender();
  });

  inputs.outlineThickness.addEventListener('input', (e) => {
    state.config.outlineThickness = Number(e.target.value);
    outputs.outlineThickness.textContent = `${state.config.outlineThickness.toFixed(1)}px`;
    scheduleFullRender();
  });

  inputs.outlineDetail.addEventListener('input', (e) => {
    state.config.outlineDetail = Number(e.target.value);
    outputs.outlineDetail.textContent = `Level ${state.config.outlineDetail}`;
    scheduleFullRender();
  });

  inputs.outlineInkStyle.addEventListener('change', (e) => {
    state.config.outlineInkStyle = e.target.value;
    scheduleFullRender(true);
  });

  inputs.spotlightMode.addEventListener('change', (e) => {
    state.config.spotlightMode = e.target.value;
    syncControlsFromConfig();
    paintFrame();
  });

  inputs.spotlightRadius.addEventListener('input', (e) => {
    state.config.spotlightRadius = Number(e.target.value);
    outputs.spotlightRadius.textContent = `${state.config.spotlightRadius}px`;
    paintFrame();
  });

  bgSwatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.config.background = btn.dataset.bgSwatch;
      syncControlsFromConfig();
      scheduleFullRender(true);
    });
  });

  // Upload & Drag-and-Drop
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleUploadedFile(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  if (viewport) {
    ['dragenter', 'dragover'].forEach((evt) => {
      viewport.addEventListener(evt, (e) => {
        e.preventDefault();
        viewport.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      viewport.addEventListener(evt, (e) => {
        e.preventDefault();
        viewport.classList.remove('drag-over');
      });
    });
    viewport.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleUploadedFile(file);
    });
  }

  // Interactive Mouse / Touch Spotlight Tracking (zero forced layout on scroll/resize)
  window.addEventListener('resize', invalidateCanvasRect, { passive: true });
  window.addEventListener('scroll', invalidateCanvasRect, { passive: true });

  canvas.addEventListener('pointerenter', () => {
    state.canvasRect = canvas.getBoundingClientRect();
  }, { passive: true });

  canvas.addEventListener('pointermove', (e) => {
    if (!state.renderResult || state.config.spotlightMode === 'off') return;
    const rect = state.canvasRect || canvas.getBoundingClientRect();
    state.canvasRect = rect;
    if (!rect.width || !rect.height) return;
    state.pointer.active = true;
    state.pointer.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    state.pointer.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    scheduleSpotlightPaint();
  }, { passive: true });

  canvas.addEventListener('pointerleave', () => {
    if (!state.pointer.active) return;
    state.pointer.active = false;
    scheduleSpotlightPaint();
  }, { passive: true });

  // Compare Original Toggle
  if (compareBtn) {
    compareBtn.addEventListener('click', () => {
      state.showOriginal = !state.showOriginal;
      compareBtn.classList.toggle('btn-active', state.showOriginal);
      compareBtn.setAttribute('aria-pressed', String(state.showOriginal));
      compareBtn.textContent = state.showOriginal ? 'Viewing Original' : 'Compare Original';
      paintFrame();
    });
  }

  // Reset Controls
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const currentMode = state.config.mode;
      const defaultBg =
        currentMode === 'aquarelle' ? 'warm' : currentMode === 'outline' ? 'paper' : 'obsidian';
      state.config = { ...DEFAULT_CONFIG, mode: currentMode, background: defaultBg };
      syncControlsFromConfig();
      scheduleFullRender(true);
      showToast('Studio parameters reset to defaults.');
    });
  }

  // Randomize Creative Recipe (all 5 modes)
  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', () => {
      const modes = ['binary', 'ascii', 'dots', 'aquarelle', 'outline'];
      const ramps = ['classic', 'extended', 'blocks', 'geometric'];
      const palettes = ['rgb', 'rgb', 'vibrant', 'duotone', 'matrix', 'amber'];
      const bgs = ['obsidian', 'black', 'slate', 'paper'];
      const dotStyles = ['brightness', 'darkness', 'opacity'];
      const inkStyles = ['rgb', 'ink', 'palette'];

      const mode = modes[Math.floor(Math.random() * modes.length)];
      const bg =
        mode === 'aquarelle'
          ? Math.random() > 0.4 ? 'warm' : 'paper'
          : mode === 'outline'
          ? 'paper'
          : bgs[Math.floor(Math.random() * bgs.length)];

      state.config = {
        ...state.config,
        mode,
        cellSize: 7 + Math.floor(Math.random() * 8),
        spacing: Number((0.92 + Math.random() * 0.25).toFixed(2)),
        contrast: 10 + Math.floor(Math.random() * 26),
        brightness: -4 + Math.floor(Math.random() * 16),
        saturation: 108 + Math.floor(Math.random() * 36),
        background: bg,
        colorMode: palettes[Math.floor(Math.random() * palettes.length)],
        binaryThreshold: 85 + Math.floor(Math.random() * 55),
        binaryDither: Math.random() > 0.35,
        asciiRamp: ramps[Math.floor(Math.random() * ramps.length)],
        dotStyle: bg === 'paper' ? 'darkness' : dotStyles[Math.floor(Math.random() * dotStyles.length)],
        dotHexGrid: Math.random() > 0.45,
        aquarelleSoftness: 42 + Math.floor(Math.random() * 48),
        aquarellePigment: 72 + Math.floor(Math.random() * 52),
        aquarelleDetail: 2 + Math.floor(Math.random() * 4),
        aquarellePaperGrain: true,
        outlineThreshold: 22 + Math.floor(Math.random() * 30),
        outlineThickness: Number((1.5 + Math.random() * 2.2).toFixed(1)),
        outlineDetail: 2 + Math.floor(Math.random() * 4),
        outlineInkStyle: inkStyles[Math.floor(Math.random() * inkStyles.length)]
      };

      syncControlsFromConfig();
      scheduleFullRender(true);
      showToast(`Generated a random ${MODE_LABELS[mode]} recipe!`);
    });
  }

  // Download High-Res PNG Export (async toBlob encoding — never freezes main thread)
  if (downloadBtn) {
    let exporting = false;
    downloadBtn.addEventListener('click', () => {
      if (!state.sourceImage || exporting) return;
      exporting = true;
      const originalHtml = downloadBtn.innerHTML;
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Exporting PNG...';

      setTimeout(() => {
        try {
          const scale = exportScaleSelect ? Number(exportScaleSelect.value) || 1 : 1;
          const exportResult = renderArtwork(state.sourceImage, state.config, {
            maxDimension: 1100,
            maxCells: scale > 1 ? 15000 : 9000,
            exportScale: scale,
            skipCells: true
          });

          const slug = state.sourceLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'artwork';
          const filename = `chromaglyph-${state.config.mode}-${slug}-${scale}x.png`;

          const finalize = () => {
            exportResult.baseCanvas.width = 0;
            exportResult.baseCanvas.height = 0;
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = originalHtml;
            exporting = false;
          };

          if (typeof exportResult.baseCanvas.toBlob === 'function') {
            exportResult.baseCanvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = filename;
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
                showToast(`Exported ${exportResult.width}×${exportResult.height} PNG!`);
              }
              finalize();
            }, 'image/png');
          } else {
            const link = document.createElement('a');
            link.download = filename;
            link.href = exportResult.baseCanvas.toDataURL('image/png');
            link.click();
            showToast(`Exported ${exportResult.width}×${exportResult.height} PNG!`);
            finalize();
          }
        } catch (err) {
          console.error('PNG export failed:', err);
          showToast('PNG export failed — try 1× HD scale.');
          downloadBtn.disabled = false;
          downloadBtn.innerHTML = originalHtml;
          exporting = false;
        }
      }, 16);
    });
  }

  // Copy Plain Text (Binary / ASCII)
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', async () => {
      if (!state.sourceImage || (state.config.mode !== 'binary' && state.config.mode !== 'ascii')) return;
      const textResult = renderArtwork(state.sourceImage, state.config, {
        maxDimension: 900,
        skipCells: true,
        includeText: true
      });
      try {
        await navigator.clipboard.writeText(textResult.textOutput);
        showToast(`Copied ${textResult.cols}×${textResult.rows} ${state.config.mode.toUpperCase()} text to clipboard!`);
      } catch {
        showToast('Clipboard blocked by browser — try downloading PNG instead.');
      }
    });
  }

  // Boot: Check for ?preset=<gallery-id> URL parameter
  renderSampleStrip();
  const params = new URLSearchParams(window.location.search);
  const presetId = params.get('preset');
  const preset = presetId ? getGalleryItemById(presetId) : null;

  if (preset) {
    state.config = { ...DEFAULT_CONFIG, ...preset.settings };
    syncControlsFromConfig();
    selectSample(preset.sampleId).then(() => {
      showToast(`Loaded "${preset.title}" preset in Studio.`);
    });
  } else {
    syncControlsFromConfig();
    selectSample('neon-portrait');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStudio);
} else {
  initStudio();
}
