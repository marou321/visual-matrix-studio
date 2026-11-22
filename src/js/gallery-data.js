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
    id: 'botanical-aquarelle-wash',
    title: 'Tropical Petal Aquarelle Wash',
    mode: 'aquarelle',
    modeLabel: 'Aquarelle',
    sampleId: 'botanical-macro',
    featured: true,
    settings: {
      mode: 'aquarelle',
      cellSize: 11,
      spacing: 1.0,
      contrast: 14,
      brightness: 12,
      saturation: 134,
      background: 'warm',
      colorMode: 'rgb',
      invert: false,
      underlayOpacity: 0,
      aquarelleSoftness: 68,
      aquarellePigment: 96,
      aquarelleDetail: 4,
      aquarellePaperGrain: true,
      spotlightMode: 'magnify'
    },
    techNotes: [
      { label: 'Softness', value: '68% Bleed' },
      { label: 'Pigment', value: '96%' },
      { label: 'Detail', value: 'Level 4' },
      { label: 'Paper', value: 'Cold-Press' },
      { label: 'Color', value: 'True RGB' }
    ],
    description:
      'Layered translucent radial washes in Multiply blend mode let coral, hibiscus magenta, and teal pigments bloom organically across warm cold-press paper. Setting Detail to Level 4 preserves delicate capillary edge rings along overlapping petals without losing painterly softness.'
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
      outlineThreshold: 30,
      outlineThickness: 2.4,
      outlineDetail: 3,
      outlineInkStyle: 'rgb',
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Interior', value: '#FFFFFF' },
      { label: 'Threshold', value: '30' },
      { label: 'Thickness', value: '2.4px' },
      { label: 'Detail', value: 'Level 3' },
      { label: 'Ink', value: 'Real RGB' }
    ],
    description:
      'Color-aware Sobel edge extraction with non-maximum ridge thinning traces the graceful S-curve of the Koi and surrounding water ripples while keeping every interior shape crisp pure white (#FFFFFF). Deepened real-RGB outlines preserve the vermilion and indigo palette cleanly against bright paper.'
  },
  {
    id: 'brutalist-hollow-ink',
    title: 'Brutalist Minimalist Line Study',
    mode: 'outline',
    modeLabel: 'Hollow Outline',
    sampleId: 'brutalist-sunbeam',
    featured: true,
    settings: {
      mode: 'outline',
      cellSize: 10,
      spacing: 1.0,
      contrast: 32,
      brightness: 0,
      saturation: 105,
      background: 'paper',
      colorMode: 'mono',
      invert: false,
      underlayOpacity: 0,
      outlineThreshold: 36,
      outlineThickness: 2.2,
      outlineDetail: 4,
      outlineInkStyle: 'ink',
      spotlightMode: 'reveal'
    },
    techNotes: [
      { label: 'Interior', value: '#FFFFFF' },
      { label: 'Threshold', value: '36' },
      { label: 'Thickness', value: '2.2px' },
      { label: 'Detail', value: 'Level 4' },
      { label: 'Ink', value: 'Studio Black' }
    ],
    description:
      'Architectural arches and razor-sharp sunlight diagonals translate naturally into pure hollow ink drawings. A mid-high threshold (36) strips out raw concrete surface noise while preserving crisp cantilevered stairs and geometric shadow silhouettes over a pure white interior.'
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
