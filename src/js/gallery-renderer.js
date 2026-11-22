/**
 * Hydrates or renders Curated Gallery Cards (on Home & /gallery) and powers filtering + lightbox inspector.
 * Engineered for zero memory leaks and zero main-thread blocking:
 *  - Lazy-renders thumbnails only when scrolled near the viewport via IntersectionObserver + idle queue
 *  - Uses skipCells: true for thumbnails and immediately releases temporary offscreen canvases
 *  - Cleans up modal canvas buffers on close and guards against stale async opens
 */

import { GALLERY_ITEMS } from './gallery-data.js';
import { loadSampleImage } from './samples.js';
import { renderArtwork } from './renderer.js';

function badgeClass(mode) {
  if (mode === 'binary') return 'badge-binary';
  if (mode === 'dots') return 'badge-dots';
  if (mode === 'aquarelle') return 'badge-aquarelle';
  if (mode === 'outline') return 'badge-outline';
  return 'badge-ascii';
}

function createCardElement(item) {
  const article = document.createElement('article');
  article.className = 'gallery-card';
  article.dataset.mode = item.mode;
  article.dataset.galleryId = item.id;

  const specsHtml = item.techNotes
    .map((n) => `<span class="spec-chip">${n.label}: <strong>${n.value}</strong></span>`)
    .join('');

  article.innerHTML = `
    <div class="gallery-visual" role="button" tabindex="0" aria-label="Inspect ${item.title} artwork">
      <canvas width="360" height="270" aria-label="${item.title} rendered in ${item.modeLabel} mode"></canvas>
      <div class="gallery-visual-overlay">
        <span class="btn btn-sm btn-secondary">Inspect Artwork</span>
      </div>
    </div>
    <div class="gallery-card-body">
      <div class="gallery-card-head">
        <h3 class="gallery-card-title">${item.title}</h3>
        <span class="badge ${badgeClass(item.mode)}">${item.modeLabel}</span>
      </div>
      <div class="tech-specs" aria-label="Technical settings used">${specsHtml}</div>
      <p class="gallery-card-desc">${item.description}</p>
      <div class="gallery-card-actions">
        <button type="button" class="btn btn-sm btn-ghost js-inspect-btn">Inspect Details</button>
        <a class="btn btn-sm btn-primary" href="/?preset=${encodeURIComponent(item.id)}#studio">Open in Studio</a>
      </div>
    </div>
  `;

  return article;
}

let activeModalBaseCanvas = null;
let modalToken = 0;

function ensureModal() {
  let backdrop = document.getElementById('gallery-modal');
  if (backdrop) return backdrop;

  backdrop = document.createElement('div');
  backdrop.id = 'gallery-modal';
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'modal-art-title');
  backdrop.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-stage">
        <canvas id="modal-canvas" width="840" height="630"></canvas>
      </div>
      <div class="modal-sidebar">
        <div class="modal-close-row">
          <span id="modal-mode-badge" class="badge badge-ascii">ASCII</span>
          <button type="button" id="modal-close-btn" class="icon-btn" aria-label="Close inspector">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <h2 id="modal-art-title" style="font-size:1.35rem;margin:0;">Artwork Title</h2>
        <p id="modal-art-desc" style="color:var(--text-secondary);font-size:0.92rem;margin:0;"></p>
        <div>
          <p class="control-group-title" style="margin-bottom:0.5rem;">Technical Recipe</p>
          <div id="modal-specs" class="tech-specs"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.55rem;margin-top:auto;">
          <button type="button" id="modal-compare-btn" class="btn btn-secondary">Compare Original Photo</button>
          <a id="modal-studio-link" class="btn btn-primary" href="/#studio">Load Recipe in Live Studio</a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => {
    modalToken++;
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    if (activeModalBaseCanvas) {
      activeModalBaseCanvas.width = 0;
      activeModalBaseCanvas.height = 0;
      activeModalBaseCanvas = null;
    }
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) {
      closeModal();
    }
  });

  return backdrop;
}

async function openInspector(item) {
  const token = ++modalToken;
  const backdrop = ensureModal();
  const canvas = backdrop.querySelector('#modal-canvas');
  const titleEl = backdrop.querySelector('#modal-art-title');
  const descEl = backdrop.querySelector('#modal-art-desc');
  const badgeEl = backdrop.querySelector('#modal-mode-badge');
  const specsEl = backdrop.querySelector('#modal-specs');
  const studioLink = backdrop.querySelector('#modal-studio-link');
  const compareBtn = backdrop.querySelector('#modal-compare-btn');

  titleEl.textContent = item.title;
  descEl.textContent = item.description;
  badgeEl.className = `badge ${badgeClass(item.mode)}`;
  badgeEl.textContent = item.modeLabel;
  specsEl.innerHTML = item.techNotes
    .map((n) => `<span class="spec-chip">${n.label}: <strong>${n.value}</strong></span>`)
    .join('');
  studioLink.href = `/?preset=${encodeURIComponent(item.id)}#studio`;

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';

  const img = await loadSampleImage(item.sampleId);
  if (token !== modalToken) return;

  if (activeModalBaseCanvas) {
    activeModalBaseCanvas.width = 0;
    activeModalBaseCanvas.height = 0;
  }

  const result = renderArtwork(img, item.settings, {
    maxDimension: 860,
    maxCells: 7200,
    skipCells: true
  });
  activeModalBaseCanvas = result.baseCanvas;

  let showOriginal = false;
  compareBtn.textContent = 'Compare Original Photo';

  const drawModal = () => {
    const ctx = canvas.getContext('2d');
    canvas.width = result.width;
    canvas.height = result.height;
    if (showOriginal) {
      ctx.drawImage(img, 0, 0, result.width, result.height);
    } else if (activeModalBaseCanvas) {
      ctx.drawImage(activeModalBaseCanvas, 0, 0);
    }
  };

  drawModal();

  compareBtn.onclick = () => {
    showOriginal = !showOriginal;
    compareBtn.textContent = showOriginal ? 'Show Rendered Artwork' : 'Compare Original Photo';
    drawModal();
  };
}

export async function mountGallery(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container || container.dataset.galleryMounted === '1') return;
  container.dataset.galleryMounted = '1';

  const items = options.featuredOnly
    ? GALLERY_ITEMS.filter((item) => item.featured)
    : GALLERY_ITEMS;

  const existingCards = new Map();
  container.querySelectorAll('[data-gallery-id]').forEach((el) => {
    existingCards.set(el.dataset.galleryId, el);
  });

  if (existingCards.size === 0) {
    container.innerHTML = '';
  }

  const cardEntries = [];

  for (const item of items) {
    let card = existingCards.get(item.id);
    if (!card) {
      card = createCardElement(item);
      container.appendChild(card);
    }

    const visual = card.querySelector('.gallery-visual');
    const canvas = visual ? visual.querySelector('canvas') : null;
    const inspectBtn = card.querySelector('.js-inspect-btn');

    const handleInspect = () => openInspector(item);
    if (visual) {
      visual.addEventListener('click', handleInspect);
      visual.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleInspect();
        }
      });
    }
    if (inspectBtn) {
      inspectBtn.addEventListener('click', handleInspect);
    }

    if (canvas) {
      cardEntries.push({ item, card, canvas, rendered: false, queued: false });
    }
  }

  // Lazy-render lightweight thumbnails (skipCells: true + immediate offscreen canvas release)
  const renderEntry = async (entry) => {
    if (entry.rendered) return;
    entry.rendered = true;
    try {
      const img = await loadSampleImage(entry.item.sampleId);
      const result = renderArtwork(img, entry.item.settings, {
        maxDimension: 360,
        maxCells: 2600,
        skipCells: true
      });
      const ctx = entry.canvas.getContext('2d');
      entry.canvas.width = result.width;
      entry.canvas.height = result.height;
      ctx.drawImage(result.baseCanvas, 0, 0);
      // Release offscreen canvas immediately so thumbnails leak zero GPU/RAM buffers
      result.baseCanvas.width = 0;
      result.baseCanvas.height = 0;
    } catch (err) {
      console.error('Gallery thumbnail render error:', err);
    }
  };

  const renderQueue = [];
  let queueRunning = false;
  const pumpQueue = () => {
    if (queueRunning || renderQueue.length === 0) return;
    queueRunning = true;
    const next = renderQueue.shift();
    const runNext = async () => {
      await renderEntry(next);
      queueRunning = false;
      if (renderQueue.length > 0) {
        setTimeout(pumpQueue, 32);
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => runNext(), { timeout: 300 });
    } else {
      setTimeout(runNext, 32);
    }
  };

  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const ioEntry of entries) {
          if (!ioEntry.isIntersecting) continue;
          const match = cardEntries.find((e) => e.card === ioEntry.target);
          if (match && !match.queued) {
            match.queued = true;
            observer.unobserve(ioEntry.target);
            renderQueue.push(match);
            pumpQueue();
          }
        }
      },
      { rootMargin: '180px 0px' }
    );
    cardEntries.forEach((entry) => observer.observe(entry.card));
  } else {
    cardEntries.forEach((entry) => renderQueue.push(entry));
    pumpQueue();
  }

  // Mode filter buttons (on /gallery page)
  const filterButtons = document.querySelectorAll('[data-gallery-filter]');
  if (filterButtons.length > 0) {
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-gallery-filter');
        filterButtons.forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });

        cardEntries.forEach(({ item, card }) => {
          const match = filter === 'all' || item.mode === filter;
          card.style.display = match ? '' : 'none';
        });
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('full-gallery-grid')) {
      mountGallery('full-gallery-grid', { featuredOnly: false });
    }
    if (document.getElementById('featured-gallery-grid')) {
      mountGallery('featured-gallery-grid', { featuredOnly: true });
    }
  });
} else {
  if (document.getElementById('full-gallery-grid')) {
    mountGallery('full-gallery-grid', { featuredOnly: false });
  }
  if (document.getElementById('featured-gallery-grid')) {
    mountGallery('featured-gallery-grid', { featuredOnly: true });
  }
}
