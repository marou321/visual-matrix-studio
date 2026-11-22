/**
 * Preloaded sample image catalog (10 varied subjects) and cached image loader.
 */

export const SAMPLE_IMAGES = [
  {
    id: 'neon-portrait',
    name: 'Neon Portrait',
    src: '/assets/samples/neon-portrait.jpg',
    alt: 'Futuristic editorial profile portrait illuminated by cyan and magenta rim lighting against obsidian black',
    category: 'Portrait'
  },
  {
    id: 'venice-canal',
    name: 'Venice Canal',
    src: '/assets/samples/venice-canal.jpg',
    alt: 'Sunlit Venice canal with warm terracotta and ochre buildings, stone arch bridge, gondolas, and turquoise reflections',
    category: 'Watercolor'
  },
  {
    id: 'cathedral-facade',
    name: 'Cathedral CAD',
    src: '/assets/samples/cathedral-facade.jpg',
    alt: 'Symmetrical European limestone cathedral facade with fluted columns, stone arches, and rose window against blue sky',
    category: 'Architecture'
  },
  {
    id: 'crimson-koi',
    name: 'Crimson Koi',
    src: '/assets/samples/crimson-koi.jpg',
    alt: 'Overhead photograph of a vermilion orange and white Japanese koi fish in midnight-indigo water',
    category: 'Nature'
  },
  {
    id: 'aurora-peak',
    name: 'Aurora Peak',
    src: '/assets/samples/aurora-peak.jpg',
    alt: 'Emerald green and violet aurora borealis glowing above a snow-capped mountain peak and alpine lake',
    category: 'Landscape'
  },
  {
    id: 'botanical-macro',
    name: 'Botanical Macro',
    src: '/assets/samples/botanical-macro.jpg',
    alt: 'Macro photograph of coral-orange, magenta, and teal tropical blossoms against a dark velvet studio backdrop',
    category: 'Macro'
  },
  {
    id: 'geometric-bauhaus',
    name: 'Bauhaus Shapes',
    src: '/assets/samples/geometric-bauhaus.jpg',
    alt: 'Minimalist Bauhaus still life with vermilion sphere, cobalt cylinder, yellow pyramid, and white arch with sharp shadows',
    category: 'Graphic'
  },
  {
    id: 'brutalist-sunbeam',
    name: 'Brutalist Light',
    src: '/assets/samples/brutalist-sunbeam.jpg',
    alt: 'Modernist brutalist concrete arches bathed in warm golden-hour sunlight against a cobalt blue sky',
    category: 'Architecture'
  },
  {
    id: 'jazz-saxophonist',
    name: 'Jazz Spotlight',
    src: '/assets/samples/jazz-saxophonist.jpg',
    alt: 'Low-key portrait of a jazz saxophonist illuminated by warm tungsten rim light and cool blue stage haze',
    category: 'Portrait'
  },
  {
    id: 'cosmic-astronaut',
    name: 'Cosmic Visor',
    src: '/assets/samples/cosmic-astronaut.jpg',
    alt: 'Close-up astronaut helmet reflecting an amber-gold and turquoise nebula against deep space',
    category: 'Sci-Fi'
  }
];

const imageCache = new Map();

function createFallbackCanvas(sampleId) {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 720;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, '#090d1a');
  grad.addColorStop(0.5, '#1e1b4b');
  grad.addColorStop(1, '#0c4a6e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  const rad = ctx.createRadialGradient(480, 340, 40, 480, 340, 290);
  rad.addColorStop(0, '#f472b6');
  rad.addColorStop(0.5, '#38bdf8');
  rad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = rad;
  ctx.beginPath();
  ctx.arc(480, 340, 290, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sampleId.toUpperCase(), 480, 355);
  return c;
}

export function getSampleById(id) {
  return SAMPLE_IMAGES.find((s) => s.id === id) || SAMPLE_IMAGES[0];
}

export function loadSampleImage(id) {
  const sample = getSampleById(id);
  if (imageCache.has(sample.id)) {
    return imageCache.get(sample.id);
  }

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(createFallbackCanvas(sample.id));
    img.src = sample.src;
  });

  imageCache.set(sample.id, promise);
  return promise;
}
