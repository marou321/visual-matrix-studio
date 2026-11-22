/**
 * Hydrates or renders Curated Gallery Cards (on Home & /gallery) and powers filtering + lightbox inspector.
 * Supports progressive enhancement: if semantic HTML cards with [data-gallery-id] are already present
 * in the document, they are hydrated in place with live Canvas rendering and hover spotlight.
 */

import { GALLERY_ITEMS } from './gallery-data.js';
import { loadSampleImage } from './samples.js';
import { renderArtwork, compositeWithSpotlight } from './renderer.js';

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
      <canvas width="640" height="480" aria-label="${item.title} rendered in ${item.modeLabel} mode"></canvas>
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

/**
 * Lightbox Modal Controller
 */
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
        <canvas id="modal-canvas" width="960" height="720"></canvas>
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
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
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
  const result = renderArtwork(img, item.settings, { maxDimension: 960 });

  let showOriginal = false;
  compareBtn.textContent = 'Compare Original Photo';

  const drawModal = () => {
    const ctx = canvas.getContext('2d');
    canvas.width = result.width;
    canvas.height = result.height;
    if (showOriginal) {
      ctx.drawImage(img, 0, 0, result.width, result.height);
    } else {
      ctx.drawImage(result.baseCanvas, 0, 0);
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
  if (!container) return;

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
      cardEntries.push({ item, card, canvas });
    }
  }

  // Render crisp canvases asynchronously without blocking initial paint
  for (const entry of cardEntries) {
    const img = await loadSampleImage(entry.item.sampleId);
    const result = renderArtwork(img, entry.item.settings, { maxDimension: 620 });
    const ctx = entry.canvas.getContext('2d');
    entry.canvas.width = result.width;
    entry.canvas.height = result.height;
    ctx.drawImage(result.baseCanvas, 0, 0);

    // Subtle interactive spotlight right on gallery cards
    const pointer = { active: false, x: 0, y: 0 };
    const cardSpotlightCfg = { ...entry.item.settings, spotlightRadius: 85 };

    entry.canvas.addEventListener('pointermove', (e) => {
      const rect = entry.canvas.getBoundingClientRect();
      pointer.active = true;
      pointer.x = ((e.clientX - rect.left) / rect.width) * entry.canvas.width;
      pointer.y = ((e.clientY - rect.top) / rect.height) * entry.canvas.height;
      compositeWithSpotlight(entry.canvas, result, img, cardSpotlightCfg, pointer);
    });

    entry.canvas.addEventListener('pointerleave', () => {
      pointer.active = false;
      compositeWithSpotlight(entry.canvas, result, img, cardSpotlightCfg, pointer);
    });
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

// Auto-hydrate/mount when DOM is ready
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
