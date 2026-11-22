/**
 * Curated Pre-Generated Gallery Catalog
 * 13 hand-tuned artworks spanning Binary (0/1), ASCII, Dots / Halftone, Aquarelle (Watercolor),
 * and Shape / Hollow Outline modes. Each item includes exact engine settings so users can open
 * any recipe directly in the Studio.
 */

export const GALLERY_ITEMS = [
  {
    id: 'neon-binary-matrix',
    title: 'Cyber Rim-Light Bitstream',
    mode: 'binary',
    modeLabel: 'Binary 0/1',
    sampleId: 'neon-portrait',
    featured: true,
    settings: {
      mode: 'binary',
      cellSize: 9,
      spacing: 1.0,
      contrast: 26,
      brightness: 6,
      saturation: 132,
      background: 'obsidian',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      binaryThreshold: 102,
      binaryDither: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '9px · 1.0x' },
      { label: 'Threshold', value: '102 / 255' },
      { label: 'Dither', value: 'Bayer 4×4' },
      { label: 'Contrast', value: '+26%' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Because this studio portrait relies on razor-sharp cyan and magenta rim lighting against a deep black backdrop, a low threshold (102) paired with 4×4 Bayer ordered dithering transitions cleanly from dense bright "1" bits on the cheekbone into receding "0" bits across the shadowed core—all while preserving the original RGB neon hues.'
  },
  {
    id: 'aurora-ascii-tapestry',
    title: 'Aurora Chromatic ASCII',
    mode: 'ascii',
    modeLabel: 'ASCII Art',
    sampleId: 'aurora-peak',
    featured: true,
    settings: {
      mode: 'ascii',
      cellSize: 9,
      spacing: 1.0,
      contrast: 22,
      brightness: 8,
      saturation: 128,
      background: 'obsidian',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      asciiRamp: 'classic',
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '9px · 1.0x' },
      { label: 'Ramp', value: '@#%*+=-:.' },
      { label: 'Contrast', value: '+22%' },
      { label: 'Saturation', value: '128%' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Northern lights contain wide mid-tone gradients that collapse under harsh binary thresholds. Mapping Rec. 709 luminance onto the 10-step classic ASCII ramp (@#%*+=-:.) lets dense "@" and "#" glyphs anchor the snow-covered ridge and bright emerald curtains, while ":" and "." softly render the faint starry sky.'
  },
  {
    id: 'koi-hex-halftone',
    title: 'Midnight Koi Hex-Halftone',
    mode: 'dots',
    modeLabel: 'Dots / Halftone',
    sampleId: 'crimson-koi',
    featured: true,
    settings: {
      mode: 'dots',
      cellSize: 10,
      spacing: 1.05,
      contrast: 24,
      brightness: 4,
      saturation: 135,
      background: 'obsidian',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      dotStyle: 'brightness',
      dotHexGrid: true,
      dotScale: 0.96,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '10px Hex' },
      { label: 'Response', value: 'Size by Luma' },
      { label: 'Dot Scale', value: '0.96×' },
      { label: 'Saturation', value: '135%' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Enabling the staggered hexagonal grid offsets alternating rows by half a cell—eliminating harsh horizontal banding along the curved spine of the Koi fish. Bright vermilion scales expand into full-radius dots while deep indigo water recedes into delicate pinpoints.'
  },
  {
    id: 'venice-aquarelle-morning',
    title: 'Venice Morning Aquarelle',
    mode: 'aquarelle',
    modeLabel: 'Aquarelle',
    sampleId: 'venice-canal',
    featured: true,
    settings: {
      mode: 'aquarelle',
      cellSize: 10,
      spacing: 1.0,
      contrast: 16,
      brightness: 6,
      saturation: 126,
      background: 'warm',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      aquarelleSoftness: 56,
      aquarellePigment: 100,
      aquarelleRim: 72,
      aquarelleBleed: 48,
      aquarelleDetail: 4,
      aquarellePaperGrain: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Softness', value: '56%' },
      { label: 'Backrun Rim', value: '72%' },
      { label: 'Bleed', value: '48%' },
      { label: 'Paper', value: 'Warm Cream' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Edge-preserving bilateral watercolor washes keep the warm terracotta facades cleanly separated from the turquoise Venetian canal while capillary backrun rims (72%) trace the stone bridge arches and gondola reflections across textured warm cotton paper.'
  },
  {
    id: 'cathedral-cad-elevation',
    title: 'Cathedral Architectural CAD',
    mode: 'outline',
    modeLabel: 'Architectural CAD',
    sampleId: 'cathedral-facade',
    featured: true,
    settings: {
      mode: 'outline',
      cellSize: 10,
      spacing: 1.0,
      contrast: 26,
      brightness: 0,
      saturation: 105,
      background: 'paper',
      colorMode: 'mono',
      invert: false,
      underlayOpacity: 0,
      outlineSubMode: 'cad',
      outlineThreshold: 24,
      outlineThickness: 1.8,
      outlineDetail: 5,
      outlineNoiseFilter: 3,
      outlineCadGrid: true,
      outlineInkStyle: 'blueprint',
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Style', value: 'Arch CAD' },
      { label: 'Interior', value: '#FFFFFF' },
      { label: 'Detail', value: 'Level 5' },
      { label: 'Weight', value: '1.8px 3-Tier' },
      { label: 'Ink', value: 'Blueprint' }
    ],
    description:
      'Architectural CAD mode separates the symmetrical cathedral facade into three technical line weights—bold primary stone contours, medium arches and columns, and fine hairline tracery—with orthogonal drafting snap, subtle corner overshoots, and a faint blueprint grid on pure white paper.'
  },
  {
    id: 'botanical-aquarelle-wash',
    title: 'Tropical Petal Aquarelle Wash',
    mode: 'aquarelle',
    modeLabel: 'Aquarelle',
    sampleId: 'botanical-macro',
    featured: false,
    settings: {
      mode: 'aquarelle',
      cellSize: 11,
      spacing: 1.0,
      contrast: 14,
      brightness: 14,
      saturation: 132,
      background: 'warm',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      aquarelleSoftness: 62,
      aquarellePigment: 98,
      aquarelleRim: 68,
      aquarelleBleed: 44,
      aquarelleDetail: 4,
      aquarellePaperGrain: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Softness', value: '62%' },
      { label: 'Backrun Rim', value: '68%' },
      { label: 'Detail', value: 'Level 4' },
      { label: 'Paper', value: 'Cold-Press' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Edge-preserving bilateral washes let coral, hibiscus magenta, and teal pigments bloom cleanly across warm cold-press paper without muddying overlapping petals, accented by delicate darker capillary drying rims.'
  },
  {
    id: 'koi-hollow-contour',
    title: 'Crimson Koi Hollow Silhouette',
    mode: 'outline',
    modeLabel: 'Hollow Outline',
    sampleId: 'crimson-koi',
    featured: true,
    settings: {
      mode: 'outline',
      cellSize: 10,
      spacing: 1.0,
      contrast: 26,
      brightness: 6,
      saturation: 132,
      background: 'paper',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      outlineSubMode: 'normal',
      outlineThreshold: 30,
      outlineThickness: 2.4,
      outlineDetail: 3,
      outlineNoiseFilter: 4,
      outlineInkStyle: 'rgb',
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Style', value: 'Normal Line' },
      { label: 'Interior', value: '#FFFFFF' },
      { label: 'Threshold', value: '30' },
      { label: 'Thickness', value: '2.4px' },
      { label: 'Ink', value: 'Real RGB' }
    ],
    description:
      'Line-first RDP simplification traces the graceful S-curve of the Koi and surrounding water ripples into clean geometric segments over a crisp pure white (#FFFFFF) interior, using deepened real-RGB outlines to retain the vermilion and indigo palette.'
  },
  {
    id: 'brutalist-hollow-ink',
    title: 'Brutalist Architectural Line Study',
    mode: 'outline',
    modeLabel: 'Architectural CAD',
    sampleId: 'brutalist-sunbeam',
    featured: false,
    settings: {
      mode: 'outline',
      cellSize: 10,
      spacing: 1.0,
      contrast: 30,
      brightness: 0,
      saturation: 105,
      background: 'paper',
      colorMode: 'mono',
      invert: false,
      underlayOpacity: 0,
      outlineSubMode: 'cad',
      outlineThreshold: 32,
      outlineThickness: 2.0,
      outlineDetail: 4,
      outlineNoiseFilter: 4,
      outlineCadGrid: true,
      outlineInkStyle: 'ink',
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Style', value: 'Arch CAD' },
      { label: 'Interior', value: '#FFFFFF' },
      { label: 'Threshold', value: '32' },
      { label: 'Weight', value: '2.0px 3-Tier' },
      { label: 'Ink', value: 'Studio Black' }
    ],
    description:
      'Modernist concrete arches and razor-sharp sunlight diagonals snap cleanly into orthogonal CAD drafting elevations with primary structural edges, delicate secondary shadow lines, and crisp 45° section hatching on pure white paper.'
  },
  {
    id: 'aurora-aquarelle-dream',
    title: 'Aurora Alpine Watercolor',
    mode: 'aquarelle',
    modeLabel: 'Aquarelle',
    sampleId: 'aurora-peak',
    featured: false,
    settings: {
      mode: 'aquarelle',
      cellSize: 12,
      spacing: 1.05,
      contrast: 16,
      brightness: 16,
      saturation: 128,
      background: 'paper',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      aquarelleSoftness: 80,
      aquarellePigment: 88,
      aquarelleDetail: 3,
      aquarellePaperGrain: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Softness', value: '80% Bleed' },
      { label: 'Pigment', value: '88%' },
      { label: 'Detail', value: 'Level 3' },
      { label: 'Paper', value: 'Gallery White' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Pushing Wash Softness to 80% lets emerald green and violet aurora ribbons diffuse into airy wet-on-wet skies while the bright snow-capped mountain peaks remain untouched white paper highlights—closely mimicking traditional landscape glazing techniques.'
  },
  {
    id: 'botanical-extended-ascii',
    title: 'Tropical Petal Micro-Glyphs',
    mode: 'ascii',
    modeLabel: 'ASCII Art',
    sampleId: 'botanical-macro',
    featured: false,
    settings: {
      mode: 'ascii',
      cellSize: 8,
      spacing: 0.95,
      contrast: 16,
      brightness: 6,
      saturation: 124,
      background: 'black',
      colorMode: 'vibrant',
      invert: false,
      underlayOpacity: 0,
      asciiRamp: 'extended',
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '8px · 0.95x' },
      { label: 'Ramp', value: 'Extended 70ch' },
      { label: 'Contrast', value: '+16%' },
      { label: 'Palette', value: 'Vibrant RGB' },
      { label: 'Backdrop', value: 'Pure Black' }
    ],
    description:
      'Macro botanical photography benefits from tighter 8px cells and the extended 70-character optical density ramp. Fine shading transitions across overlapping coral, magenta, and turquoise petals stay legible without over-compressing delicate highlights.'
  },
  {
    id: 'brutalist-paper-halftone',
    title: 'Offset Print Brutalist Study',
    mode: 'dots',
    modeLabel: 'Dots / Halftone',
    sampleId: 'brutalist-sunbeam',
    featured: false,
    settings: {
      mode: 'dots',
      cellSize: 11,
      spacing: 1.05,
      contrast: 30,
      brightness: -2,
      saturation: 112,
      background: 'paper',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      dotStyle: 'darkness',
      dotHexGrid: true,
      dotScale: 0.94,
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Grid', value: '11px Hex' },
      { label: 'Response', value: 'Size by Darkness' },
      { label: 'Canvas', value: 'Gallery Paper' },
      { label: 'Contrast', value: '+30%' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Modeled after mid-century architectural lithographs, this recipe switches to a light Gallery Paper canvas and reverses dot sizing to "Size by Darkness." Deep concrete shadows swell into bold ink circles while sunlit ledges open up into airy white space.'
  },
  {
    id: 'astronaut-binary-visor',
    title: 'Nebula Visor Binary Telemetry',
    mode: 'binary',
    modeLabel: 'Binary 0/1',
    sampleId: 'cosmic-astronaut',
    featured: false,
    settings: {
      mode: 'binary',
      cellSize: 8,
      spacing: 1.0,
      contrast: 20,
      brightness: 10,
      saturation: 126,
      background: 'black',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0.08,
      binaryThreshold: 94,
      binaryDither: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '8px · 1.0x' },
      { label: 'Threshold', value: '94 / 255' },
      { label: 'Underlay', value: '8% Original' },
      { label: 'Dither', value: 'Bayer 4×4' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Adding a subtle 8% dimmed photographic underlay beneath dense 8px binary digits preserves the spherical glass sheen of the astronaut visor while letting fiery amber and turquoise nebula reflections read like live spacecraft telemetry.'
  },
  {
    id: 'koi-binary-minimal',
    title: 'Vermilion Bitfield Contrast',
    mode: 'binary',
    modeLabel: 'Binary 0/1',
    sampleId: 'crimson-koi',
    featured: false,
    settings: {
      mode: 'binary',
      cellSize: 11,
      spacing: 1.08,
      contrast: 36,
      brightness: 2,
      saturation: 140,
      background: 'obsidian',
      colorMode: 'vibrant',
      invert: false,
      underlayOpacity: 0,
      binaryThreshold: 118,
      binaryDither: false,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '11px · 1.08x' },
      { label: 'Threshold', value: '118 / 255' },
      { label: 'Dither', value: 'Hard Cutoff' },
      { label: 'Contrast', value: '+36%' },
      { label: 'Palette', value: 'Vibrant RGB' }
    ],
    description:
      'Turning off dithering creates a crisp, graphic hard-threshold boundary between the luminous orange-and-white Koi ("1" digits) and the dark pond ripples ("0" digits). Ideal for bold poster art and high-legibility social thumbnails.'
  },
  {
    id: 'brutalist-block-ascii',
    title: 'Concrete Sunbeam Block-ASCII',
    mode: 'ascii',
    modeLabel: 'ASCII Art',
    sampleId: 'brutalist-sunbeam',
    featured: false,
    settings: {
      mode: 'ascii',
      cellSize: 10,
      spacing: 1.0,
      contrast: 24,
      brightness: 0,
      saturation: 115,
      background: 'slate',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      asciiRamp: 'blocks',
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Grid', value: '10px · 1.0x' },
      { label: 'Ramp', value: 'Blocks (█▓▒░)' },
      { label: 'Contrast', value: '+24%' },
      { label: 'Backdrop', value: 'Deep Slate' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Geometric architecture pairs naturally with Unicode block-shading characters (█▓▒░). The rectangular glyph footprint accentuates diagonal concrete shadows and golden sunlight beams like a high-resolution retro ANSI mural.'
  },
  {
    id: 'neon-opacity-dots',
    title: 'LED Matrix Opacity Portrait',
    mode: 'dots',
    modeLabel: 'Dots / Halftone',
    sampleId: 'neon-portrait',
    featured: false,
    settings: {
      mode: 'dots',
      cellSize: 12,
      spacing: 1.12,
      contrast: 20,
      brightness: 8,
      saturation: 138,
      background: 'black',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      dotStyle: 'opacity',
      dotHexGrid: false,
      dotScale: 0.9,
      spotlightMode: 'glow'
    },
    techNotes: [
      { label: 'Grid', value: '12px Square' },
      { label: 'Response', value: 'Size + Opacity' },
      { label: 'Spacing', value: '1.12×' },
      { label: 'Backdrop', value: 'Pure Black' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Using a wider 1.12× square grid and harmonic Size + Opacity dot response simulates a physical architectural LED wall. Cyan and magenta edge pixels glow at full intensity while shadowed regions softly fade into pure black.'
  }
];

export function getGalleryItemById(id) {
  return GALLERY_ITEMS.find((item) => item.id === id) || null;
}
