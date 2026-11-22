/**
 * ChromaGlyph Studio — Interactive Multi-Mode Canvas Studio Controller
 */

import { SAMPLE_IMAGES, loadSampleImage, getSampleById } from './samples.js';
import {
  DEFAULT_CONFIG,
  renderArtwork,
  compositeWithSpotlight
} from './renderer.js';
import { getGalleryItemById } from './gallery-data.js';
import { showToast } from './theme.js';

function initStudio() {
  const canvas = document.getElementById('studio-canvas');
  if (!canvas) return;

  const state = {
    config: { ...DEFAULT_CONFIG },
    sourceImage: null,
    sourceLabel: 'Neon Portrait',
    activeSampleId: 'neon-portrait',
    renderResult: null,
    showOriginal: false,
    pointer: { active: false, x: 0, y: 0 },
    rafId: null
  };

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

  // Mode Tabs & Panels
  const modeTabs = document.querySelectorAll('.mode-tab');
  const binaryPanel = document.getElementById('panel-binary-options');
  const asciiPanel = document.getElementById('panel-ascii-options');
  const dotsPanel = document.getElementById('panel-dots-options');

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

    if (copyTextBtn) {
      copyTextBtn.style.display = c.mode === 'dots' ? 'none' : 'inline-flex';
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
      } else {
        spotlightHint.textContent = 'Hover canvas: Interactive spotlight active';
      }
    }
  }

  function paintFrame() {
    if (!state.renderResult) return;

    if (state.showOriginal && state.sourceImage) {
      const ctx = canvas.getContext('2d');
      canvas.width = state.renderResult.width;
      canvas.height = state.renderResult.height;
      ctx.drawImage(state.sourceImage, 0, 0, canvas.width, canvas.height);
      return;
    }

    compositeWithSpotlight(
      canvas,
      state.renderResult,
      state.sourceImage,
      state.config,
      state.pointer
    );
  }

  let renderDebounce = null;

  function scheduleFullRender(immediate = false) {
    if (!state.sourceImage) return;
    const execute = () => {
      state.renderResult = renderArtwork(state.sourceImage, state.config, {
        maxDimension: 1080
      });
      paintFrame();

      const r = state.renderResult;
      const modeName =
        state.config.mode === 'binary'
          ? 'Binary 0/1'
          : state.config.mode === 'dots'
          ? 'Dots / Halftone'
          : 'ASCII';

      if (statDims) statDims.textContent = `${r.width}×${r.height}px`;
      if (statGrid) statGrid.textContent = `${r.cols}×${r.rows} (${(r.cols * r.rows).toLocaleString()} cells)`;
      if (statMode) statMode.textContent = modeName;
      if (statTime) statTime.textContent = `${r.renderMs}ms`;
    };

    clearTimeout(renderDebounce);
    if (immediate) {
      execute();
    } else {
      renderDebounce = setTimeout(execute, 18);
    }
  }

  function scheduleSpotlightPaint() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(() => {
      state.rafId = null;
      paintFrame();
    });
  }

  async function selectSample(sampleId) {
    const sample = getSampleById(sampleId);
    state.activeSampleId = sample.id;
    state.sourceLabel = sample.name;
    updateSampleActiveState();
    state.sourceImage = await loadSampleImage(sample.id);
    scheduleFullRender(true);
  }

  function handleUploadedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP, or GIF).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.sourceImage = img;
        state.activeSampleId = '';
        state.sourceLabel = file.name.replace(/\.[^.]+$/, '');
        updateSampleActiveState();
        scheduleFullRender(true);
        showToast(`Loaded "${file.name}" locally in browser.`);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Event Listeners: Mode Tabs
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.config.mode = tab.dataset.mode;
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

  // Interactive Mouse / Touch Spotlight Tracking
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.pointer.active = true;
    state.pointer.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    state.pointer.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    scheduleSpotlightPaint();
  });

  canvas.addEventListener('pointerleave', () => {
    state.pointer.active = false;
    scheduleSpotlightPaint();
  });

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
      state.config = { ...DEFAULT_CONFIG, mode: currentMode };
      syncControlsFromConfig();
      scheduleFullRender(true);
      showToast('Studio parameters reset to defaults.');
    });
  }

  // Randomize Creative Recipe
  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', () => {
      const modes = ['binary', 'ascii', 'dots'];
      const ramps = ['classic', 'extended', 'blocks', 'geometric'];
      const palettes = ['rgb', 'rgb', 'vibrant', 'duotone', 'matrix', 'amber'];
      const bgs = ['obsidian', 'black', 'slate', 'paper'];
      const dotStyles = ['brightness', 'darkness', 'opacity'];

      const mode = modes[Math.floor(Math.random() * modes.length)];
      const bg = bgs[Math.floor(Math.random() * bgs.length)];

      state.config = {
        ...state.config,
        mode,
        cellSize: 7 + Math.floor(Math.random() * 8),
        spacing: Number((0.92 + Math.random() * 0.25).toFixed(2)),
        contrast: 8 + Math.floor(Math.random() * 28),
        brightness: -6 + Math.floor(Math.random() * 18),
        saturation: 105 + Math.floor(Math.random() * 40),
        background: bg,
        colorMode: palettes[Math.floor(Math.random() * palettes.length)],
        binaryThreshold: 85 + Math.floor(Math.random() * 55),
        binaryDither: Math.random() > 0.35,
        asciiRamp: ramps[Math.floor(Math.random() * ramps.length)],
        dotStyle: bg === 'paper' ? 'darkness' : dotStyles[Math.floor(Math.random() * dotStyles.length)],
        dotHexGrid: Math.random() > 0.45
      };

      syncControlsFromConfig();
      scheduleFullRender(true);
      showToast(`Generated a random ${mode.toUpperCase()} recipe!`);
    });
  }

  // Download High-Res PNG Export
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (!state.sourceImage) return;
      const scale = exportScaleSelect ? Number(exportScaleSelect.value) || 1 : 1;
      const exportResult = renderArtwork(state.sourceImage, state.config, {
        maxDimension: 1200,
        exportScale: scale,
        skipCells: true
      });

      const slug = state.sourceLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'artwork';
      const filename = `chromaglyph-${state.config.mode}-${slug}-${scale}x.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = exportResult.baseCanvas.toDataURL('image/png');
      link.click();
      showToast(`Exported ${exportResult.width}×${exportResult.height} PNG!`);
    });
  }

  // Copy Plain Text (Binary / ASCII)
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', async () => {
      if (!state.sourceImage || state.config.mode === 'dots') return;
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
