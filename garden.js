(() => {
  'use strict';

  // =========================================================================
  // ASCII BUTTERFLY GARDEN — Original Typographic Living Meadow
  // Shader-like per-cell main(x, y, t, pointer) composited over deterministic
  // botanical growth, flapping butterflies, drifting petals, and preset moods.
  // =========================================================================

  const FIXED_DT = 1 / 60;
  const CELL_W = 10;
  const CELL_H = 18;
  const FONT_SPEC = "600 16px 'Liberation Mono', 'SFMono-Regular', 'JetBrains Mono', 'Fira Code', 'DejaVu Sans Mono', 'Consolas', monospace";

  // Seeded deterministic PRNG (Mulberry32)
  function createRng(seed) {
    let a = seed >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic 2D hash for procedural field texture (zero state)
  function hash2(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerpRgb(c1, c2, t, out) {
    out[0] = c1[0] + (c2[0] - c1[0]) * t;
    out[1] = c1[1] + (c2[1] - c1[1]) * t;
    out[2] = c1[2] + (c2[2] - c1[2]) * t;
    return out;
  }

  function rgbCss(r, g, b) {
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // =========================================================================
  // PRESETS (1: Dawn, 2: Noon, 3: Night Fireflies, 4: Wind Gust)
  // =========================================================================
  const PRESETS = [
    {
      id: 0,
      key: '1',
      code: '01',
      name: 'DAWN',
      subtitle: 'Rose Mist',
      bgTop: [13, 9, 24],
      bgMid: [25, 16, 36],
      bgBot: [36, 20, 34],
      horizonGlow: [92, 46, 62],
      soil: [[54, 34, 44], [38, 24, 32], [24, 15, 22]],
      grass: [[66, 92, 74], [96, 134, 96], [156, 178, 122]],
      stem: [[74, 114, 82], [116, 158, 108]],
      leaf: [[84, 132, 92], [142, 184, 124]],
      trellis: [48, 34, 54],
      flowers: [
        { core: [255, 228, 146], inner: [255, 148, 166], outer: [232, 102, 132], tip: [255, 198, 192] },
        { core: [255, 242, 188], inner: [255, 184, 114], outer: [234, 132, 94], tip: [255, 218, 168] },
        { core: [255, 222, 162], inner: [226, 144, 212], outer: [178, 104, 176], tip: [248, 194, 236] },
        { core: [255, 240, 170], inner: [248, 166, 138], outer: [216, 114, 108], tip: [255, 210, 194] },
        { core: [255, 232, 154], inner: [246, 206, 140], outer: [218, 154, 108], tip: [255, 234, 196] },
        { core: [255, 218, 158], inner: [244, 126, 156], outer: [196, 86, 124], tip: [255, 182, 200] },
      ],
      butterflySat: 0.92,
      butterflyBright: 1.0,
      butterflyWarmth: [255, 214, 188],
      butterflyWarmthMix: 0.24,
      skyAccent: [228, 162, 168],
      pointerColor: [255, 226, 166],
      hudAccent: [255, 184, 152],
      hudText: [236, 212, 216],
      hudMuted: [148, 122, 136],
      windBase: 0.45,
      windGustAmp: 0.35,
      windFreq: 0.75,
      wingSpeedMult: 0.92,
      flightSpeedMult: 0.88,
      petalSpawnMult: 0.75,
      petalDriftX: 2.8,
      fireflyAlpha: 0.0,
      starAlpha: 0.38,
      sunbeamAlpha: 0.55,
      mistAlpha: 0.72,
      streakAlpha: 0.0,
    },
    {
      id: 1,
      key: '2',
      code: '02',
      name: 'NOON',
      subtitle: 'Sunlit Meadow',
      bgTop: [7, 20, 22],
      bgMid: [11, 30, 27],
      bgBot: [15, 38, 28],
      horizonGlow: [36, 84, 58],
      soil: [[44, 62, 42], [28, 42, 30], [16, 26, 20]],
      grass: [[52, 136, 76], [88, 194, 98], [166, 238, 124]],
      stem: [[64, 156, 86], [116, 214, 114]],
      leaf: [[74, 178, 92], [156, 240, 128]],
      trellis: [28, 62, 48],
      flowers: [
        { core: [255, 248, 126], inner: [255, 116, 108], outer: [236, 62, 92], tip: [255, 188, 162] },
        { core: [255, 250, 162], inner: [255, 206, 56], outer: [248, 146, 36], tip: [255, 236, 128] },
        { core: [255, 244, 142], inner: [248, 106, 216], outer: [198, 56, 178], tip: [255, 178, 240] },
        { core: [255, 244, 128], inner: [102, 208, 255], outer: [56, 146, 236], tip: [188, 238, 255] },
        { core: [255, 252, 182], inner: [255, 152, 74], outer: [236, 94, 54], tip: [255, 206, 136] },
        { core: [255, 246, 156], inner: [164, 246, 112], outer: [94, 212, 118], tip: [222, 255, 178] },
      ],
      butterflySat: 1.15,
      butterflyBright: 1.12,
      butterflyWarmth: [255, 246, 204],
      butterflyWarmthMix: 0.12,
      skyAccent: [166, 232, 178],
      pointerColor: [255, 244, 132],
      hudAccent: [132, 242, 146],
      hudText: [216, 246, 224],
      hudMuted: [112, 164, 132],
      windBase: 0.85,
      windGustAmp: 0.5,
      windFreq: 1.15,
      wingSpeedMult: 1.24,
      flightSpeedMult: 1.26,
      petalSpawnMult: 1.15,
      petalDriftX: 4.5,
      fireflyAlpha: 0.0,
      starAlpha: 0.0,
      sunbeamAlpha: 0.78,
      mistAlpha: 0.12,
      streakAlpha: 0.0,
    },
    {
      id: 2,
      key: '3',
      code: '03',
      name: 'NIGHT',
      subtitle: 'Firefly Hollow',
      bgTop: [4, 7, 17],
      bgMid: [6, 12, 26],
      bgBot: [9, 18, 32],
      horizonGlow: [18, 36, 62],
      soil: [[20, 32, 46], [13, 21, 34], [8, 13, 24]],
      grass: [[26, 56, 72], [40, 86, 102], [72, 132, 148]],
      stem: [[32, 68, 86], [56, 106, 126]],
      leaf: [[38, 82, 98], [76, 136, 152]],
      trellis: [20, 34, 56],
      flowers: [
        { core: [196, 236, 255], inner: [122, 168, 248], outer: [76, 108, 198], tip: [176, 214, 255] },
        { core: [224, 255, 236], inner: [108, 214, 228], outer: [64, 148, 176], tip: [174, 242, 248] },
        { core: [232, 224, 255], inner: [176, 138, 246], outer: [118, 82, 192], tip: [216, 194, 255] },
        { core: [238, 250, 222], inner: [152, 218, 198], outer: [84, 152, 146], tip: [208, 246, 234] },
        { core: [228, 236, 255], inner: [148, 184, 238], outer: [88, 122, 186], tip: [198, 222, 255] },
        { core: [244, 226, 255], inner: [196, 136, 222], outer: [132, 78, 168], tip: [232, 192, 248] },
      ],
      butterflySat: 0.78,
      butterflyBright: 0.84,
      butterflyWarmth: [156, 210, 255],
      butterflyWarmthMix: 0.36,
      skyAccent: [142, 182, 232],
      pointerColor: [222, 255, 126],
      hudAccent: [214, 252, 118],
      hudText: [196, 218, 242],
      hudMuted: [98, 124, 158],
      windBase: 0.32,
      windGustAmp: 0.22,
      windFreq: 0.55,
      wingSpeedMult: 0.62,
      flightSpeedMult: 0.68,
      petalSpawnMult: 0.45,
      petalDriftX: 1.6,
      fireflyAlpha: 1.0,
      starAlpha: 1.0,
      sunbeamAlpha: 0.0,
      mistAlpha: 0.28,
      streakAlpha: 0.0,
    },
    {
      id: 3,
      key: '4',
      code: '04',
      name: 'GUST',
      subtitle: 'Silver Squall',
      bgTop: [10, 14, 20],
      bgMid: [15, 21, 29],
      bgBot: [21, 28, 36],
      horizonGlow: [46, 58, 70],
      soil: [[44, 50, 56], [30, 35, 42], [18, 22, 28]],
      grass: [[64, 88, 86], [96, 124, 118], [154, 178, 172]],
      stem: [[74, 102, 98], [122, 152, 144]],
      leaf: [[84, 114, 108], [146, 174, 166]],
      trellis: [40, 48, 58],
      flowers: [
        { core: [232, 226, 206], inner: [194, 144, 150], outer: [148, 104, 114], tip: [224, 198, 204] },
        { core: [238, 234, 212], inner: [196, 176, 134], outer: [152, 132, 98], tip: [226, 216, 186] },
        { core: [226, 234, 242], inner: [154, 172, 196], outer: [110, 128, 152], tip: [204, 218, 234] },
        { core: [236, 228, 236], inner: [178, 156, 186], outer: [130, 112, 142], tip: [218, 206, 226] },
        { core: [234, 238, 232], inner: [164, 192, 182], outer: [116, 146, 138], tip: [214, 230, 224] },
        { core: [240, 228, 216], inner: [202, 158, 138], outer: [154, 114, 100], tip: [232, 204, 190] },
      ],
      butterflySat: 0.52,
      butterflyBright: 1.02,
      butterflyWarmth: [214, 228, 240],
      butterflyWarmthMix: 0.44,
      skyAccent: [188, 208, 224],
      pointerColor: [232, 244, 255],
      hudAccent: [186, 218, 242],
      hudText: [214, 224, 234],
      hudMuted: [116, 132, 146],
      windBase: 2.75,
      windGustAmp: 1.45,
      windFreq: 2.35,
      wingSpeedMult: 1.62,
      flightSpeedMult: 1.42,
      petalSpawnMult: 4.2,
      petalDriftX: 22.0,
      fireflyAlpha: 0.0,
      starAlpha: 0.12,
      sunbeamAlpha: 0.0,
      mistAlpha: 0.22,
      streakAlpha: 1.0,
    },
  ];

  // =========================================================================
  // BUTTERFLY WING ART (Original Multi-Pose Pure ASCII)
  // Legend in mask: 'B' = body, 'W' = wing edge, 'S' = wing spot/accent
  // =========================================================================
  const LARGE_BUTTERFLY_POSES = {
    open: [
      { ch: '/~\\ /~\\', mk: 'WWW WWW' },
      { ch: '(@)|(@)', mk: 'WSWBWSW' },
      { ch: '\\_/ \\_/', mk: 'WWW WWW' },
    ],
    midUp: [
      { ch: ' /\\ /\\ ', mk: ' WW WW ' },
      { ch: ' (o|o) ', mk: ' WSBWS ' },
      { ch: '  \\v/  ', mk: '  WKW  ' },
    ],
    closed: [
      { ch: '   ^   ', mk: '   W   ' },
      { ch: '  (|)  ', mk: '  WBW  ' },
      { ch: '   v   ', mk: '   B   ' },
    ],
    midDown: [
      { ch: '  \\ /  ', mk: '  W W  ' },
      { ch: ' (o|o) ', mk: ' WSBWS ' },
      { ch: '  / \\  ', mk: '  W W  ' },
    ],
    bankRight: [
      { ch: '  /~\\  ', mk: '  WWW  ' },
      { ch: '  (@)\\ ', mk: '  WSWW ' },
      { ch: '   \\_\\ ', mk: '   WWW ' },
    ],
    bankLeft: [
      { ch: '  /~\\  ', mk: '  WWW  ' },
      { ch: ' /(@)  ', mk: ' WWSW  ' },
      { ch: ' /_/   ', mk: ' WWW   ' },
    ],
  };

  // Fix typo in midUp/midDown mask ('WKW' -> 'WBW') cleanly
  LARGE_BUTTERFLY_POSES.midUp[1].mk = ' WSBWS ';
  LARGE_BUTTERFLY_POSES.midUp[2].mk = '  WBW  ';
  LARGE_BUTTERFLY_POSES.midDown[1].mk = ' WSBWS ';

  const MED_BUTTERFLY_POSES = {
    open: [
      { ch: '/\\ /\\', mk: 'WW WW' },
      { ch: '(*|*)', mk: 'WSBSW' },
      { ch: '\\/ \\/', mk: 'WW WW' },
    ],
    midUp: [
      { ch: ' \\ / ', mk: ' W W ' },
      { ch: ' (|) ', mk: ' WBW ' },
      { ch: '  v  ', mk: '  B  ' },
    ],
    closed: [
      { ch: ' \\|/ ', mk: ' WBW ' },
      { ch: ' (|) ', mk: ' WBW ' },
      { ch: '  v  ', mk: '  B  ' },
    ],
    midDown: [
      { ch: ' / \\ ', mk: ' W W ' },
      { ch: '(*|*)', mk: 'WSBSW' },
      { ch: '  v  ', mk: '  B  ' },
    ],
    bankRight: [
      { ch: ' /~\\ ', mk: ' WWW ' },
      { ch: ' (*)\\', mk: ' WSWW' },
      { ch: '  \\\\ ', mk: '  WW ' },
    ],
    bankLeft: [
      { ch: ' /~\\ ', mk: ' WWW ' },
      { ch: '/(*) ', mk: 'WWSW ' },
      { ch: ' //  ', mk: ' WW  ' },
    ],
  };

  // Distinct original butterfly species colorways
  const BUTTERFLY_SPECIES = [
    { name: 'Monarch', wing: [255, 162, 66], spot: [255, 238, 152], body: [248, 212, 166], large: true },
    { name: 'Morpho', wing: [82, 206, 255], spot: [224, 250, 255], body: [176, 218, 248], large: true },
    { name: 'Rosewing', wing: [255, 118, 168], spot: [255, 224, 178], body: [248, 198, 212], large: true },
    { name: 'Swallowtail', wing: [248, 226, 94], spot: [255, 148, 86], body: [255, 244, 196], large: true },
    { name: 'Luna', wing: [132, 244, 186], spot: [232, 255, 216], body: [204, 246, 222], large: false },
    { name: 'Amethyst', wing: [204, 134, 255], spot: [255, 212, 248], body: [232, 202, 255], large: false },
    { name: 'Copper', wing: [255, 136, 96], spot: [255, 232, 162], body: [252, 208, 184], large: false },
    { name: 'Pierid', wing: [246, 244, 212], spot: [255, 196, 112], body: [232, 224, 198], large: false },
    { name: 'Azure', wing: [118, 224, 236], spot: [255, 236, 146], body: [202, 240, 244], large: false },
  ];

  // =========================================================================
  // GARDEN ENGINE
  // =========================================================================
  class AsciiButterflyGarden {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.width = 1920;
      this.height = 1080;
      this.cols = 192;
      this.rows = 60;
      this.offsetX = 0;
      this.offsetY = 0;

      this.seed = 42073;
      this.frame = 0;
      this.t = 0;
      this.paused = false;
      this.captureMode = false;

      // Preset blending
      this.targetPresetIdx = 0;
      this.fromPresetIdx = 0;
      this.presetBlend = 1;
      this.presetBlendDur = 0.45;
      this.blended = this._clonePreset(PRESETS[0]);

      // Pointer state (in cell coordinates)
      this.pointer = {
        x: 96,
        y: 28,
        prevX: 96,
        prevY: 28,
        vx: 0,
        vy: 0,
        speed: 0,
        active: false,
        alpha: 0,
        trail: [],
      };

      // World entities
      this.flowers = [];
      this.butterflies = [];
      this.petals = [];
      this.fireflies = [];
      this.groundContour = [];
      this.grassBlades = [];

      // Per-cell stamped layer buffer (reused every frame, zero alloc)
      // Each cell holds highest-priority entity stamp
      this.layerChar = [];
      this.layerR = [];
      this.layerG = [];
      this.layerB = [];
      this.layerPrio = [];
      this.layerGlowR = [];
      this.layerGlowG = [];
      this.layerGlowB = [];

      // Reusable output object for shader-like main(x, y, t, pointer)
      this._cellOut = { ch: ' ', r: 0, g: 0, b: 0, bgR: 0, bgG: 0, bgB: 0, hasBg: false };

      // Reusable RGB scratch arrays
      this._tmpRgb = [0, 0, 0];

      // Color bucket cache for ultra-fast batched Canvas 2D text drawing
      this._buckets = new Map();

      this.resize(window.innerWidth || 1920, window.innerHeight || 1080);
      this.reset(this.seed);
    }

    _clonePreset(p) {
      return {
        bgTop: [...p.bgTop],
        bgMid: [...p.bgMid],
        bgBot: [...p.bgBot],
        horizonGlow: [...p.horizonGlow],
        soil: p.soil.map((c) => [...c]),
        grass: p.grass.map((c) => [...c]),
        stem: p.stem.map((c) => [...c]),
        leaf: p.leaf.map((c) => [...c]),
        trellis: [...p.trellis],
        flowers: p.flowers.map((f) => ({
          core: [...f.core],
          inner: [...f.inner],
          outer: [...f.outer],
          tip: [...f.tip],
        })),
        butterflySat: p.butterflySat,
        butterflyBright: p.butterflyBright,
        butterflyWarmth: [...p.butterflyWarmth],
        butterflyWarmthMix: p.butterflyWarmthMix,
        skyAccent: [...p.skyAccent],
        pointerColor: [...p.pointerColor],
        hudAccent: [...p.hudAccent],
        hudText: [...p.hudText],
        hudMuted: [...p.hudMuted],
        windBase: p.windBase,
        windGustAmp: p.windGustAmp,
        windFreq: p.windFreq,
        wingSpeedMult: p.wingSpeedMult,
        flightSpeedMult: p.flightSpeedMult,
        petalSpawnMult: p.petalSpawnMult,
        petalDriftX: p.petalDriftX,
        fireflyAlpha: p.fireflyAlpha,
        starAlpha: p.starAlpha,
        sunbeamAlpha: p.sunbeamAlpha,
        mistAlpha: p.mistAlpha,
        streakAlpha: p.streakAlpha,
      };
    }

    resize(w, h) {
      this.width = Math.max(320, Math.floor(w));
      this.height = Math.max(240, Math.floor(h));
      this.canvas.width = this.width;
      this.canvas.height = this.height;

      this.cols = Math.max(48, Math.floor(this.width / CELL_W));
      this.rows = Math.max(24, Math.floor(this.height / CELL_H));
      this.offsetX = Math.floor((this.width - this.cols * CELL_W) / 2);
      this.offsetY = Math.floor((this.height - this.rows * CELL_H) / 2);

      const total = this.cols * this.rows;
      this.layerChar = new Array(total).fill('');
      this.layerR = new Float32Array(total);
      this.layerG = new Float32Array(total);
      this.layerB = new Float32Array(total);
      this.layerPrio = new Uint8Array(total);
      this.layerGlowR = new Float32Array(total);
      this.layerGlowG = new Float32Array(total);
      this.layerGlowB = new Float32Array(total);

      this._buildTerrain();
      if (this.flowers.length > 0) {
        this._reprojectEntitiesToGrid();
      }
    }

    _buildTerrain() {
      const cols = this.cols;
      const rows = this.rows;
      this.groundContour = new Float32Array(cols);
      for (let x = 0; x < cols; x++) {
        const u = x / cols;
        const hill =
          Math.sin(u * Math.PI * 2.4 + 0.4) * 1.45 +
          Math.cos(u * Math.PI * 5.2 - 0.8) * 0.65 +
          Math.sin(u * Math.PI * 1.1) * 0.9;
        this.groundContour[x] = rows - 6.2 + hill;
      }

      // Deterministic meadow grass tufts across entire width
      const rng = createRng(this.seed + 901);
      this.grassBlades = [];
      for (let x = 1; x < cols - 1; x++) {
        if (rng() < 0.72) {
          this.grassBlades.push({
            x,
            height: 2 + Math.floor(rng() * 4.6),
            phase: rng() * Math.PI * 2,
            stiffness: 0.65 + rng() * 0.7,
            tone: Math.floor(rng() * 3),
          });
        }
      }
    }

    reset(seed = this.seed) {
      this.seed = seed;
      this.rng = createRng(seed);
      this.frame = 0;
      this.t = 0;

      this.targetPresetIdx = 0;
      this.fromPresetIdx = 0;
      this.presetBlend = 1;
      this.blended = this._clonePreset(PRESETS[0]);

      this.pointer.x = this.cols * 0.5;
      this.pointer.y = this.rows * 0.44;
      this.pointer.prevX = this.pointer.x;
      this.pointer.prevY = this.pointer.y;
      this.pointer.vx = 0;
      this.pointer.vy = 0;
      this.pointer.speed = 0;
      this.pointer.active = false;
      this.pointer.alpha = 0;
      this.pointer.trail = [];

      this._buildTerrain();
      this._initFlowers();
      this._initButterflies();
      this._initFireflies();
      this.petals = [];
    }

    _reprojectEntitiesToGrid() {
      for (const f of this.flowers) {
        f.rootX = clamp(Math.round(f.normX * this.cols), 6, this.cols - 7);
        f.groundY = this.groundContour[f.rootX];
        f.maxHeight = Math.round(f.normHeight * this.rows);
      }
    }

    _initFlowers() {
      const rng = this.rng;
      this.flowers = [];

      // 20 thoughtfully composed flowers across 3 depth layers so the meadow feels lush & balanced
      const layout = [
        // Background layer (depth 0)
        { nx: 0.08, h: 0.27, type: 'rosette', depth: 0, ci: 2, sprout: 0.10, dur: 2.0 },
        { nx: 0.17, h: 0.30, type: 'bell', depth: 0, ci: 4, sprout: 0.25, dur: 2.1 },
        { nx: 0.30, h: 0.28, type: 'chalice', depth: 0, ci: 3, sprout: 0.15, dur: 2.2 },
        { nx: 0.44, h: 0.31, type: 'rosette', depth: 0, ci: 5, sprout: 0.35, dur: 2.0 },
        { nx: 0.56, h: 0.29, type: 'bell', depth: 0, ci: 1, sprout: 0.18, dur: 2.3 },
        { nx: 0.71, h: 0.30, type: 'chalice', depth: 0, ci: 2, sprout: 0.40, dur: 2.0 },
        { nx: 0.84, h: 0.27, type: 'rosette', depth: 0, ci: 0, sprout: 0.22, dur: 2.1 },
        { nx: 0.93, h: 0.25, type: 'chalice', depth: 0, ci: 4, sprout: 0.48, dur: 1.9 },

        // Midground layer (depth 1)
        { nx: 0.12, h: 0.36, type: 'chalice', depth: 1, ci: 0, sprout: 0.05, dur: 2.3 },
        { nx: 0.24, h: 0.41, type: 'sunburst', depth: 1, ci: 1, sprout: 0.12, dur: 2.4 },
        { nx: 0.38, h: 0.38, type: 'bell', depth: 1, ci: 2, sprout: 0.28, dur: 2.2 },
        { nx: 0.51, h: 0.42, type: 'rosette', depth: 1, ci: 3, sprout: 0.08, dur: 2.4 },
        { nx: 0.66, h: 0.39, type: 'chalice', depth: 1, ci: 5, sprout: 0.20, dur: 2.3 },
        { nx: 0.78, h: 0.41, type: 'sunburst', depth: 1, ci: 4, sprout: 0.14, dur: 2.5 },
        { nx: 0.89, h: 0.35, type: 'bell', depth: 1, ci: 1, sprout: 0.36, dur: 2.1 },

        // Foreground hero blooms (depth 2)
        { nx: 0.20, h: 0.46, type: 'sunburst', depth: 2, ci: 0, sprout: 0.00, dur: 2.5 },
        { nx: 0.34, h: 0.49, type: 'rosette', depth: 2, ci: 1, sprout: 0.06, dur: 2.6 },
        { nx: 0.47, h: 0.45, type: 'chalice', depth: 2, ci: 2, sprout: 0.16, dur: 2.5 },
        { nx: 0.62, h: 0.51, type: 'sunburst', depth: 2, ci: 3, sprout: 0.02, dur: 2.6 },
        { nx: 0.75, h: 0.47, type: 'rosette', depth: 2, ci: 5, sprout: 0.10, dur: 2.5 },
      ];

      for (let i = 0; i < layout.length; i++) {
        const spec = layout[i];
        const rootX = clamp(Math.round(spec.nx * this.cols), 6, this.cols - 7);
        const groundY = this.groundContour[rootX];
        const maxHeight = Math.round(spec.h * this.rows);

        this.flowers.push({
          id: i,
          normX: spec.nx,
          normHeight: spec.h,
          rootX,
          groundY,
          maxHeight,
          type: spec.type,
          depth: spec.depth,
          colorIdx: spec.ci,
          sproutTime: spec.sprout,
          bloomDur: spec.dur,
          swayPhase: rng() * Math.PI * 2,
          swayFreq: 0.9 + rng() * 0.45,
          curveBias: (rng() - 0.5) * 6.2,
          leafSides: rng() > 0.5 ? 1 : -1,
          // Live computed geometry
          grow: 0.24,
          bloom: 0,
          headX: rootX,
          headY: groundY - 4,
          bend: 0,
          pointerBend: 0,
          shedCooldown: rng() * 1.4,
        });
      }
    }

    _initButterflies() {
      const rng = this.rng;
      this.butterflies = [];

      for (let i = 0; i < BUTTERFLY_SPECIES.length; i++) {
        const sp = BUTTERFLY_SPECIES[i];
        const startX = this.cols * (0.1 + (i / BUTTERFLY_SPECIES.length) * 0.8) + (rng() - 0.5) * 10;
        const startY = this.rows * (0.16 + rng() * 0.34);
        const targetFlower = Math.floor(rng() * this.flowers.length);

        this.butterflies.push({
          id: i,
          species: sp,
          x: startX,
          y: startY,
          vx: (rng() - 0.5) * 10,
          vy: (rng() - 0.5) * 4,
          wingPhase: rng() * Math.PI * 2,
          baseWingFreq: sp.large ? 5.6 + rng() * 1.4 : 6.8 + rng() * 1.8,
          facing: rng() > 0.5 ? 1 : -1,
          bank: 0,
          targetFlower,
          hoverTimer: 0,
          retargetTimer: 1.4 + rng() * 2.6,
          orbitAngle: (i / BUTTERFLY_SPECIES.length) * Math.PI * 2,
          orbitRadiusX: (sp.large ? 10 : 7) + (i % 3) * 4.5,
          orbitRadiusY: (sp.large ? 4.2 : 3.2) + (i % 3) * 1.8,
          orbitDir: i % 2 === 0 ? 1 : -1,
          bobPhase: rng() * Math.PI * 2,
          trail: [],
        });
      }
    }

    _initFireflies() {
      const rng = this.rng;
      this.fireflies = [];
      for (let i = 0; i < 34; i++) {
        this.fireflies.push({
          anchorX: 8 + rng() * (this.cols - 16),
          anchorY: 10 + rng() * (this.rows - 18),
          ampX: 5 + rng() * 14,
          ampY: 2.5 + rng() * 6.5,
          freqX: 0.25 + rng() * 0.45,
          freqY: 0.35 + rng() * 0.55,
          phaseX: rng() * Math.PI * 2,
          phaseY: rng() * Math.PI * 2,
          pulsePhase: rng() * Math.PI * 2,
          pulseFreq: 1.3 + rng() * 1.6,
          warmth: rng(),
          x: 0,
          y: 0,
          glow: 0,
        });
      }
    }

    setPreset(idx, immediate = false) {
      const clamped = clamp(idx | 0, 0, PRESETS.length - 1);
      if (immediate) {
        this.fromPresetIdx = clamped;
        this.targetPresetIdx = clamped;
        this.presetBlend = 1;
        this.blended = this._clonePreset(PRESETS[clamped]);
        return;
      }
      if (clamped !== this.targetPresetIdx) {
        this.fromPresetIdx = this.targetPresetIdx;
        this.targetPresetIdx = clamped;
        this.presetBlend = 0;
      }
    }

    setPointerCells(cx, cy, active = true) {
      this.pointer.x = clamp(cx, 1, this.cols - 2);
      this.pointer.y = clamp(cy, 1, this.rows - 2);
      this.pointer.active = active;
    }

    setPointerPixels(px, py, active = true) {
      const cx = (px - this.offsetX) / CELL_W;
      const cy = (py - this.offsetY) / CELL_H;
      this.setPointerCells(cx, cy, active);
    }

    _updateBlendedPreset(dt) {
      if (this.presetBlend >= 1) return;
      this.presetBlend = clamp(this.presetBlend + dt / this.presetBlendDur, 0, 1);
      const e = smoothstep(0, 1, this.presetBlend);
      const a = PRESETS[this.fromPresetIdx];
      const b = PRESETS[this.targetPresetIdx];
      const out = this.blended;

      lerpRgb(a.bgTop, b.bgTop, e, out.bgTop);
      lerpRgb(a.bgMid, b.bgMid, e, out.bgMid);
      lerpRgb(a.bgBot, b.bgBot, e, out.bgBot);
      lerpRgb(a.horizonGlow, b.horizonGlow, e, out.horizonGlow);
      for (let i = 0; i < 3; i++) {
        lerpRgb(a.soil[i], b.soil[i], e, out.soil[i]);
        lerpRgb(a.grass[i], b.grass[i], e, out.grass[i]);
      }
      for (let i = 0; i < 2; i++) {
        lerpRgb(a.stem[i], b.stem[i], e, out.stem[i]);
        lerpRgb(a.leaf[i], b.leaf[i], e, out.leaf[i]);
      }
      lerpRgb(a.trellis, b.trellis, e, out.trellis);
      for (let i = 0; i < out.flowers.length; i++) {
        lerpRgb(a.flowers[i].core, b.flowers[i].core, e, out.flowers[i].core);
        lerpRgb(a.flowers[i].inner, b.flowers[i].inner, e, out.flowers[i].inner);
        lerpRgb(a.flowers[i].outer, b.flowers[i].outer, e, out.flowers[i].outer);
        lerpRgb(a.flowers[i].tip, b.flowers[i].tip, e, out.flowers[i].tip);
      }

      out.butterflySat = lerp(a.butterflySat, b.butterflySat, e);
      out.butterflyBright = lerp(a.butterflyBright, b.butterflyBright, e);
      lerpRgb(a.butterflyWarmth, b.butterflyWarmth, e, out.butterflyWarmth);
      out.butterflyWarmthMix = lerp(a.butterflyWarmthMix, b.butterflyWarmthMix, e);
      lerpRgb(a.skyAccent, b.skyAccent, e, out.skyAccent);
      lerpRgb(a.pointerColor, b.pointerColor, e, out.pointerColor);
      lerpRgb(a.hudAccent, b.hudAccent, e, out.hudAccent);
      lerpRgb(a.hudText, b.hudText, e, out.hudText);
      lerpRgb(a.hudMuted, b.hudMuted, e, out.hudMuted);

      out.windBase = lerp(a.windBase, b.windBase, e);
      out.windGustAmp = lerp(a.windGustAmp, b.windGustAmp, e);
      out.windFreq = lerp(a.windFreq, b.windFreq, e);
      out.wingSpeedMult = lerp(a.wingSpeedMult, b.wingSpeedMult, e);
      out.flightSpeedMult = lerp(a.flightSpeedMult, b.flightSpeedMult, e);
      out.petalSpawnMult = lerp(a.petalSpawnMult, b.petalSpawnMult, e);
      out.petalDriftX = lerp(a.petalDriftX, b.petalDriftX, e);
      out.fireflyAlpha = lerp(a.fireflyAlpha, b.fireflyAlpha, e);
      out.starAlpha = lerp(a.starAlpha, b.starAlpha, e);
      out.sunbeamAlpha = lerp(a.sunbeamAlpha, b.sunbeamAlpha, e);
      out.mistAlpha = lerp(a.mistAlpha, b.mistAlpha, e);
      out.streakAlpha = lerp(a.streakAlpha, b.streakAlpha, e);
    }

    // Global wind field at column x and time t
    windAt(x, t) {
      const p = this.blended;
      const wave1 = Math.sin(t * p.windFreq * 1.4 - x * 0.045);
      const wave2 = Math.sin(t * p.windFreq * 2.6 - x * 0.095 + 1.3) * 0.45;
      const surge = Math.pow(0.5 + 0.5 * Math.sin(t * 0.95 - x * 0.015), 2);
      return p.windBase + p.windGustAmp * (wave1 * 0.6 + wave2 * 0.4 + surge * 0.55);
    }

    _spawnPetal(x, y, colorIdx, extraVx = 0, extraVy = 0) {
      if (this.petals.length >= 165) return;
      const rng = this.rng;
      const p = this.blended;
      const glyphs = ['*', '~', ',', "'", '^', 'o'];
      this.petals.push({
        x,
        y,
        vx: p.petalDriftX * (0.45 + rng() * 0.85) + extraVx + (rng() - 0.5) * 4,
        vy: 1.4 + rng() * 2.8 + extraVy,
        phase: rng() * Math.PI * 2,
        spin: 3.0 + rng() * 5.0,
        colorIdx,
        glyphBase: Math.floor(rng() * glyphs.length),
        life: 0,
        maxLife: 2.4 + rng() * 2.8,
        trail: [],
      });
    }

    // Advance deterministic simulation by exactly dt (1/60s)
    step(dt = FIXED_DT) {
      this.frame++;
      this.t = this.frame * FIXED_DT;
      const t = this.t;
      const rng = this.rng;

      this._updateBlendedPreset(dt);
      const p = this.blended;

      // Update pointer kinematics & trail
      const ptr = this.pointer;
      ptr.alpha = lerp(ptr.alpha, ptr.active ? 1 : 0, Math.min(1, dt * 8));
      const rawVx = (ptr.x - ptr.prevX) / dt;
      const rawVy = (ptr.y - ptr.prevY) / dt;
      ptr.vx = lerp(ptr.vx, clamp(rawVx, -120, 120), 0.35);
      ptr.vy = lerp(ptr.vy, clamp(rawVy, -80, 80), 0.35);
      ptr.speed = Math.hypot(ptr.vx, ptr.vy * 1.7);
      ptr.prevX = ptr.x;
      ptr.prevY = ptr.y;

      if (ptr.alpha > 0.05 && this.frame % 2 === 0) {
        ptr.trail.unshift({ x: ptr.x, y: ptr.y });
        if (ptr.trail.length > 9) ptr.trail.pop();
      } else if (ptr.alpha <= 0.05 && ptr.trail.length > 0) {
        ptr.trail.pop();
      }

      // 1. Update flowers: sprout -> grow -> bloom -> sway -> pointer bend -> shed petals
      for (const f of this.flowers) {
        const localT = Math.max(0, t - f.sproutTime);
        // Visible green shoots & rising buds immediately at t=0..0.5s, stretching & blooming across 0..3.1s
        const stemGrow = smoothstep(0, f.bloomDur * 0.72, localT);
        f.grow = 0.24 + 0.76 * stemGrow;
        f.bloom = smoothstep(f.bloomDur * 0.34, f.bloomDur * 1.06, localT);

        const wind = this.windAt(f.rootX, t);
        const depthScale = f.depth === 0 ? 0.72 : f.depth === 1 ? 0.92 : 1.08;
        const naturalSway =
          (wind * 2.55 + Math.sin(t * f.swayFreq * 1.7 + f.swayPhase) * (0.75 + wind * 0.55)) *
          depthScale *
          f.grow;

        // Pointer local push/bend
        let targetPtrBend = 0;
        if (ptr.alpha > 0.05) {
          const dx = f.headX - ptr.x;
          const dy = (f.headY - ptr.y) * 1.7;
          const dist = Math.hypot(dx, dy);
          if (dist < 22) {
            const inf = (1 - dist / 22) * ptr.alpha;
            const pushDir = Math.abs(ptr.vx) > 3 ? Math.sign(ptr.vx) : dx >= 0 ? 1 : -1;
            targetPtrBend = pushDir * inf * (4.2 + Math.min(6, ptr.speed * 0.14));
            // Stir petals when pointer brushes close to an open bloom
            if (dist < 11 && f.bloom > 0.55 && rng() < dt * (4.5 + ptr.speed * 0.18)) {
              this._spawnPetal(
                f.headX + (rng() - 0.5) * 4,
                f.headY + (rng() - 0.5) * 2,
                f.colorIdx,
                ptr.vx * 0.22,
                ptr.vy * 0.12 - 1.5
              );
            }
          }
        }
        f.pointerBend = lerp(f.pointerBend, targetPtrBend, Math.min(1, dt * 6));
        f.bend = naturalSway + f.pointerBend;

        const h = f.maxHeight * f.grow;
        f.headX = f.rootX + f.bend + f.curveBias * f.grow;
        f.headY = f.groundY - h + Math.abs(f.bend) * 0.14;

        // Ambient petal shedding (dramatically increases in Wind Gust!)
        f.shedCooldown -= dt * p.petalSpawnMult * (0.4 + f.bloom * 0.9);
        if (f.shedCooldown <= 0 && f.bloom > 0.55) {
          f.shedCooldown = 0.65 + rng() * 1.6;
          this._spawnPetal(
            f.headX + (rng() - 0.5) * 4.5,
            f.headY + (rng() - 0.5) * 2.0,
            f.colorIdx,
            wind * 2.5,
            -0.6 - rng() * 1.2
          );
        }
      }

      // 2. Update butterflies: flower-to-flower flutter, pointer attraction, wing flapping, banking
      for (let i = 0; i < this.butterflies.length; i++) {
        const b = this.butterflies[i];
        const wind = this.windAt(b.x, t);

        // Decide whether this butterfly is drawn to the pointer
        let attractWeight = 0;
        if (ptr.alpha > 0.05) {
          const pdx = ptr.x - b.x;
          const pdy = (ptr.y - b.y) * 1.8;
          const pdist = Math.hypot(pdx, pdy);
          // Generous attraction radius so nearby & mid-field butterflies visibly gather
          const maxR = b.species.large ? 86 : 72;
          if (pdist < maxR) {
            attractWeight = smoothstep(maxR, 14, pdist) * ptr.alpha;
          } else if (i < 4) {
            // Keep at least a couple of hero butterflies gently aware of the pointer across the meadow
            attractWeight = 0.35 * ptr.alpha;
          }
        }

        // Retarget flowers periodically
        b.retargetTimer -= dt;
        if (b.retargetTimer <= 0) {
          b.retargetTimer = 2.2 + rng() * 3.0;
          // Prefer blooming flowers
          const candidate = Math.floor(rng() * this.flowers.length);
          b.targetFlower = candidate;
        }

        const tf = this.flowers[b.targetFlower];
        let goalX = tf.headX + Math.sin(t * 1.3 + b.bobPhase) * 3.5;
        let goalY = tf.headY - 2.6 + Math.cos(t * 2.0 + b.bobPhase) * 1.4;

        // If attracted to pointer, blend goal toward an orbital slot around pointer
        if (attractWeight > 0.02) {
          b.orbitAngle += dt * (1.25 + (i % 3) * 0.28) * b.orbitDir * p.flightSpeedMult;
          const slotX = ptr.x + Math.cos(b.orbitAngle) * b.orbitRadiusX + ptr.vx * 0.08;
          const slotY = ptr.y + Math.sin(b.orbitAngle) * b.orbitRadiusY + ptr.vy * 0.06;
          goalX = lerp(goalX, slotX, attractWeight);
          goalY = lerp(goalY, slotY, attractWeight);
        }

        // Steering force toward goal
        const dx = goalX - b.x;
        const dy = goalY - b.y;
        const dist = Math.hypot(dx, dy) + 0.001;

        const maxSpeed = (b.species.large ? 22 : 26) * p.flightSpeedMult;
        const desiredSpeed = Math.min(maxSpeed, dist * 1.6 + 4.5);
        let steerX = (dx / dist) * desiredSpeed - b.vx;
        let steerY = (dy / dist) * desiredSpeed * 0.62 - b.vy;

        // Flutter bobbing lift (wingbeat micro-oscillation)
        const flutterLift = Math.cos(b.wingPhase) * 7.5;
        steerY += flutterLift;

        // Wind gust force — pushes butterflies and makes them bank hard!
        const gustForceX = Math.max(0, wind - 1.0) * (10.5 + Math.sin(t * 3.8 + b.bobPhase) * 4.5);
        const gustForceY = Math.max(0, wind - 1.2) * Math.sin(t * 4.4 + b.id * 1.7) * 5.0;
        steerX += gustForceX;
        steerY += gustForceY;

        // Soft separation between butterflies so they never overlap into a clump
        for (let j = 0; j < this.butterflies.length; j++) {
          if (i === j) continue;
          const o = this.butterflies[j];
          const sx = b.x - o.x;
          const sy = (b.y - o.y) * 1.85;
          const sd = Math.hypot(sx, sy);
          if (sd < 12 && sd > 0.01) {
            const push = ((12 - sd) / 12) * 26;
            steerX += (sx / sd) * push;
            steerY += (sy / sd) * push * 0.55;
          }
        }

        // Integrate velocity with smooth aerodynamic damping
        b.vx += steerX * dt * 2.4;
        b.vy += steerY * dt * 2.8;
        b.vx *= Math.pow(0.86, dt * 60);
        b.vy *= Math.pow(0.82, dt * 60);

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Keep butterflies nicely framed within the garden sky & blooms
        const minY = 5;
        const maxY = this.rows - 11;
        if (b.x < 6) {
          b.x = 6;
          b.vx = Math.abs(b.vx) + 4;
        } else if (b.x > this.cols - 7) {
          b.x = this.cols - 7;
          b.vx = -Math.abs(b.vx) - 4;
        }
        if (b.y < minY) {
          b.y = minY;
          b.vy = Math.abs(b.vy) + 2;
        } else if (b.y > maxY) {
          b.y = maxY;
          b.vy = -Math.abs(b.vy) - 2;
        }

        // Facing & banking angle
        if (Math.abs(b.vx) > 2.2) {
          b.facing = lerp(b.facing, Math.sign(b.vx), Math.min(1, dt * 6));
        }
        const targetBank = clamp(
          (b.vx / 24) * 0.65 + Math.max(0, wind - 1.3) * 0.42 * (b.vx >= 0 ? 1 : -0.6),
          -1,
          1
        );
        b.bank = lerp(b.bank, targetBank, Math.min(1, dt * 7));

        // Wing flap phase — faster when climbing, accelerating, or fighting gust
        const speedNorm = Math.hypot(b.vx, b.vy * 1.6) / 22;
        const climbBoost = b.vy < -1.5 ? 1.25 : 1.0;
        const flapRate = b.baseWingFreq * p.wingSpeedMult * (0.85 + speedNorm * 0.48) * climbBoost;
        b.wingPhase += dt * flapRate * Math.PI * 2;

        // Brush flowers to knock loose a petal occasionally
        if (dist < 5.5 && tf.bloom > 0.6 && rng() < dt * 1.4) {
          this._spawnPetal(tf.headX, tf.headY, tf.colorIdx, b.vx * 0.18, -1.2);
        }

        // Subtle wing-dust trail
        if (this.frame % 3 === 0) {
          b.trail.unshift({ x: b.x, y: b.y });
          if (b.trail.length > 5) b.trail.pop();
        }
      }

      // 3. Update drifting petals with decaying trails & pointer swirl
      for (let i = this.petals.length - 1; i >= 0; i--) {
        const pt = this.petals[i];
        pt.life += dt;
        const wind = this.windAt(pt.x, t);

        // Save trail point every 2 frames
        if (this.frame % 2 === 0) {
          pt.trail.unshift({ x: pt.x, y: pt.y });
          if (pt.trail.length > 7) pt.trail.pop();
        }

        const flutterX = Math.sin(t * pt.spin + pt.phase) * (2.6 + wind * 1.2);
        const flutterY = Math.cos(t * pt.spin * 0.7 + pt.phase) * 1.4;

        // Pointer eddy stirs nearby petals
        if (ptr.alpha > 0.05) {
          const dx = pt.x - ptr.x;
          const dy = (pt.y - ptr.y) * 1.8;
          const d = Math.hypot(dx, dy);
          if (d < 20 && d > 0.1) {
            const inf = (1 - d / 20) * ptr.alpha;
            // Swirl tangentially + carry pointer velocity
            pt.vx += (-dy / d * 18 + ptr.vx * 0.55) * inf * dt * 3.5;
            pt.vy += (dx / d * 10 + ptr.vy * 0.45 - 3.0) * inf * dt * 3.5;
          }
        }

        pt.vx = lerp(pt.vx, p.petalDriftX * 0.85 + wind * 4.2 + flutterX, Math.min(1, dt * 2.8));
        pt.vy = lerp(pt.vy, 2.2 + flutterY - Math.max(0, wind - 1.8) * 0.7, Math.min(1, dt * 2.4));

        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;

        // Wrap horizontally in strong gust so wind feels continuous
        if (pt.x > this.cols + 3 && p.streakAlpha > 0.3) {
          pt.x = -2;
          pt.trail.length = 0;
        }

        const groundY = this.groundContour[clamp(pt.x | 0, 0, this.cols - 1)];
        if (pt.life >= pt.maxLife || pt.y > groundY + 1 || pt.x < -8 || pt.x > this.cols + 8) {
          this.petals.splice(i, 1);
        }
      }

      // Extra ambient wind-borne petals entering from left edge during Wind Gust
      if (p.streakAlpha > 0.25 && rng() < dt * 22 * p.streakAlpha) {
        this._spawnPetal(
          -1,
          8 + rng() * (this.rows - 20),
          Math.floor(rng() * 6),
          10 + rng() * 14,
          (rng() - 0.5) * 4
        );
      }

      // 4. Update night fireflies
      if (p.fireflyAlpha > 0.01) {
        for (const ff of this.fireflies) {
          let x = ff.anchorX + Math.sin(t * ff.freqX + ff.phaseX) * ff.ampX;
          let y = ff.anchorY + Math.cos(t * ff.freqY + ff.phaseY) * ff.ampY;

          // Subtle nocturnal attraction toward the pointer lantern
          if (ptr.alpha > 0.05) {
            const dx = ptr.x - x;
            const dy = (ptr.y - y) * 1.6;
            const d = Math.hypot(dx, dy);
            if (d < 36) {
              const pull = smoothstep(36, 4, d) * 0.34 * ptr.alpha;
              x += dx * pull;
              y += (ptr.y - y) * pull;
            }
          }

          ff.x = clamp(x, 2, this.cols - 3);
          ff.y = clamp(y, 5, this.rows - 8);
          ff.glow = Math.pow(0.5 + 0.5 * Math.sin(t * ff.pulseFreq + ff.pulsePhase), 2.1) * p.fireflyAlpha;
        }
      }
    }

    // Stamp helper for entity layer buffers
    _stamp(x, y, ch, r, g, b, prio) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || ix >= this.cols || iy < 0 || iy >= this.rows) return;
      const idx = iy * this.cols + ix;
      if (prio >= this.layerPrio[idx]) {
        this.layerChar[idx] = ch;
        this.layerR[idx] = r;
        this.layerG[idx] = g;
        this.layerB[idx] = b;
        this.layerPrio[idx] = prio;
      }
    }

    _addGlow(cx, cy, radiusX, radiusY, r, g, b, strength) {
      const minX = Math.max(0, Math.floor(cx - radiusX));
      const maxX = Math.min(this.cols - 1, Math.ceil(cx + radiusX));
      const minY = Math.max(0, Math.floor(cy - radiusY));
      const maxY = Math.min(this.rows - 1, Math.ceil(cy + radiusY));
      for (let y = minY; y <= maxY; y++) {
        const dy = (y - cy) / radiusY;
        const dy2 = dy * dy;
        const rowOff = y * this.cols;
        for (let x = minX; x <= maxX; x++) {
          const dx = (x - cx) / radiusX;
          const d2 = dx * dx + dy2;
          if (d2 < 1) {
            const f = (1 - d2) * (1 - d2) * strength;
            const idx = rowOff + x;
            this.layerGlowR[idx] += r * f;
            this.layerGlowG[idx] += g * f;
            this.layerGlowB[idx] += b * f;
          }
        }
      }
    }

    // Prepare dynamic entity stamps into the cell grid before main(x, y, t, pointer)
    _prepareEntityLayers() {
      const total = this.cols * this.rows;
      this.layerChar.fill('');
      this.layerPrio.fill(0);
      this.layerGlowR.fill(0);
      this.layerGlowG.fill(0);
      this.layerGlowB.fill(0);

      const p = this.blended;
      const t = this.t;

      // A. Stamp swaying meadow grass blades (priority 10)
      for (let i = 0; i < this.grassBlades.length; i++) {
        const g = this.grassBlades[i];
        const gy = Math.floor(this.groundContour[g.x]);
        const wind = this.windAt(g.x, t);
        let bend = (wind * 0.85 + Math.sin(t * 2.1 + g.phase) * 0.35) / g.stiffness;

        if (this.pointer.alpha > 0.05) {
          const dx = g.x - this.pointer.x;
          const dy = (gy - 2 - this.pointer.y) * 1.7;
          const d = Math.hypot(dx, dy);
          if (d < 16) {
            bend += (dx >= 0 ? 1 : -1) * (1 - d / 16) * 1.8 * this.pointer.alpha;
          }
        }

        const baseCol = p.grass[g.tone];
        for (let s = 1; s <= g.height; s++) {
          const frac = s / g.height;
          const bx = g.x + bend * frac * frac * 1.45;
          const by = gy - s;
          let ch = '|';
          if (bend > 1.25 && frac > 0.55) ch = '~';
          else if (bend > 0.38) ch = '/';
          else if (bend < -0.38) ch = '\\';
          if (s === g.height) {
            if (bend > 1.3) ch = '-';
            else if (bend > 0.5) ch = '/';
            else if (bend < -0.5) ch = '\\';
            else ch = frac > 0.7 ? "'" : ',';
          }
          const shade = 0.72 + frac * 0.34;
          this._stamp(bx, by, ch, baseCol[0] * shade, baseCol[1] * shade, baseCol[2] * shade, 10);
        }
      }

      // B. Stamp flowers sorted by depth (back -> mid -> front)
      for (let depth = 0; depth <= 2; depth++) {
        const depthMul = depth === 0 ? 0.66 : depth === 1 ? 0.88 : 1.05;
        const basePrio = 20 + depth * 12;

        for (const f of this.flowers) {
          if (f.depth !== depth) continue;
          const fc = p.flowers[f.colorIdx];
          const stemSteps = Math.max(2, Math.round(f.maxHeight * f.grow));

          // 1. Curved swaying stem & connected lush leaves
          for (let s = 0; s < stemSteps; s++) {
            const frac = s / Math.max(1, stemSteps);
            const curve = frac * frac;
            const sx = f.rootX + (f.bend + f.curveBias * f.grow) * curve;
            const sy = f.groundY - s + Math.abs(f.bend) * 0.14 * curve;

            // Tangent determines stem glyph
            const nextFrac = Math.min(1, (s + 1) / Math.max(1, stemSteps));
            const dx = (f.bend + f.curveBias * f.grow) * (nextFrac * nextFrac - curve);
            let ch = '|';
            if (dx > 0.24) ch = '/';
            else if (dx < -0.24) ch = '\\';
            else if (s === 0) ch = '!';

            const sc = frac > 0.5 ? p.stem[1] : p.stem[0];
            this._stamp(sx, sy, ch, sc[0] * depthMul, sc[1] * depthMul, sc[2] * depthMul, basePrio);

            // Basal foliage rosette near soil
            if (s === 1 && depth >= 1) {
              const lc0 = p.leaf[0];
              const lc1 = p.leaf[1];
              this._stamp(sx - 1, sy, '\\', lc0[0] * depthMul, lc0[1] * depthMul, lc0[2] * depthMul, basePrio);
              this._stamp(sx + 1, sy, '/', lc0[0] * depthMul, lc0[1] * depthMul, lc0[2] * depthMul, basePrio);
              this._stamp(sx - 2, sy - 1, '<', lc1[0] * depthMul, lc1[1] * depthMul, lc1[2] * depthMul, basePrio);
              this._stamp(sx + 2, sy - 1, '>', lc1[0] * depthMul, lc1[1] * depthMul, lc1[2] * depthMul, basePrio);
            }

            // Connected botanical leaves along the stem
            if (f.grow > 0.24 && s >= 2 && s < stemSteps - 2) {
              const n1 = Math.floor(stemSteps * 0.34);
              const n2 = Math.floor(stemSteps * 0.62);
              const n3 = depth === 2 ? Math.floor(stemSteps * 0.80) : -1;
              if (s === n1 || s === n2 || s === n3) {
                const side = s === n2 ? -f.leafSides : f.leafSides;
                const leafLen = depth === 2 ? 3 : 2;
                const lc0 = p.leaf[0];
                const lc1 = p.leaf[1];
                for (let l = 1; l <= leafLen; l++) {
                  const lx = sx + side * l;
                  const ly = sy - (l >= 2 ? 1 : 0);
                  let lch;
                  if (side > 0) {
                    lch = l === 1 ? '/' : l === leafLen ? '>' : '~';
                  } else {
                    lch = l === 1 ? '\\' : l === leafLen ? '<' : '~';
                  }
                  const lc = l === leafLen ? lc1 : lc0;
                  this._stamp(lx, ly, lch, lc[0] * depthMul, lc[1] * depthMul, lc[2] * depthMul, basePrio + 1);
                }
              }
            }
          }

          // 2. Flower Bud -> Opening Blossom -> Full Multi-Ring Crown
          const hx = f.headX;
          const hy = f.headY;
          const bl = f.bloom;
          const tilt = clamp(f.bend * 0.12, -1.2, 1.2);
          const prioHead = basePrio + 5;

          const cCore = fc.core;
          const cIn = fc.inner;
          const cOut = fc.outer;
          const cTip = fc.tip;

          if (bl < 0.18) {
            // Early visible rose/gold bud enclosed by young green sepals
            const ch = f.grow < 0.36 ? 'o' : '0';
            this._stamp(hx, hy, ch, cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 1);
            this._stamp(hx - 1, hy, '(', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead);
            this._stamp(hx + 1, hy, ')', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead);
            if (f.grow >= 0.32) {
              this._stamp(hx, hy - 1, '^', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
            }
          } else if (bl < 0.52) {
            // Swelling calyx opening into half-bloom
            this._stamp(hx, hy, '*', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 1);
            this._stamp(hx - 1, hy, '{', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
            this._stamp(hx + 1, hy, '}', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
            this._stamp(hx, hy - 1, '^', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
            this._stamp(hx - 1, hy + 1, '\\', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead - 1);
            this._stamp(hx + 1, hy + 1, '/', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead - 1);
          } else {
            // Full bloomed original ASCII species!
            const shimmer = Math.sin(t * 3.2 + f.swayPhase) > 0.2;
            const gustShake = p.streakAlpha > 0.4 && Math.sin(t * 14 + f.id * 2.1) > 0;
            const rScale = 0.65 + 0.35 * smoothstep(0.52, 0.96, bl);

            if (f.type === 'sunburst') {
              // Layered dahlia/sunburst corona
              const coreCh = shimmer ? '@' : 'O';
              this._stamp(hx, hy, coreCh, cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 3);
              this._stamp(hx - 1, hy, '(', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);
              this._stamp(hx + 1, hy, ')', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);

              // Inner petals
              const innerPts = [
                [-2, 0, gustShake ? '~' : '='],
                [2, 0, gustShake ? '~' : '='],
                [-1, -1, '\\'],
                [0, -1, '|'],
                [1, -1, '/'],
                [-1, 1, '/'],
                [0, 1, '|'],
                [1, 1, '\\'],
              ];
              for (const [ox, oy, ch] of innerPts) {
                this._stamp(
                  hx + ox + tilt * oy * -0.35,
                  hy + oy,
                  ch,
                  cIn[0] * depthMul,
                  cIn[1] * depthMul,
                  cIn[2] * depthMul,
                  prioHead + 1
                );
              }

              // Outer radiant ring for mature mid/foreground blooms
              if (rScale > 0.78 && depth >= 1) {
                const outerPts = [
                  [-3, 0, '-'],
                  [3, 0, '-'],
                  [-2, -1, '*'],
                  [2, -1, '*'],
                  [-2, 1, '*'],
                  [2, 1, '*'],
                  [0, -2, shimmer ? '*' : '^'],
                  [-2, -2, ','],
                  [2, -2, "'"],
                  [0, 2, 'v'],
                ];
                for (const [ox, oy, ch] of outerPts) {
                  const col = Math.abs(ox) >= 3 || Math.abs(oy) >= 2 ? cTip : cOut;
                  this._stamp(
                    hx + ox + tilt * oy * -0.4,
                    hy + oy,
                    ch,
                    col[0] * depthMul,
                    col[1] * depthMul,
                    col[2] * depthMul,
                    prioHead
                  );
                }
              }
            } else if (f.type === 'chalice') {
              // Sculpted tulip / goblet bloom
              this._stamp(hx, hy, shimmer ? '*' : '+', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 2);
              this._stamp(hx, hy - 1, '|', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 1);
              this._stamp(hx - 1, hy, '(', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 1);
              this._stamp(hx + 1, hy, ')', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 1);
              this._stamp(hx - 2, hy, '(', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead);
              this._stamp(hx + 2, hy, ')', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead);
              this._stamp(hx - 2, hy - 1, '\\', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
              this._stamp(hx - 1, hy - 1, 'v', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
              this._stamp(hx + 1, hy - 1, 'v', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
              this._stamp(hx + 2, hy - 1, '/', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
              // Calyx base
              this._stamp(hx - 1, hy + 1, '\\', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead);
              this._stamp(hx, hy + 1, '_', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead);
              this._stamp(hx + 1, hy + 1, '/', p.leaf[1][0] * depthMul, p.leaf[1][1] * depthMul, p.leaf[1][2] * depthMul, prioHead);
            } else if (f.type === 'bell') {
              // Arching bellflower lanterns
              const archDir = f.bend >= -0.4 ? 1 : -1;
              this._stamp(hx, hy - 1, '.', p.stem[1][0] * depthMul, p.stem[1][1] * depthMul, p.stem[1][2] * depthMul, prioHead);
              this._stamp(hx + archDir, hy - 1, '~', p.stem[1][0] * depthMul, p.stem[1][1] * depthMul, p.stem[1][2] * depthMul, prioHead);
              this._stamp(hx + archDir * 2, hy - 1, archDir > 0 ? '\\' : '/', p.stem[1][0] * depthMul, p.stem[1][1] * depthMul, p.stem[1][2] * depthMul, prioHead);

              // Hanging bell 1
              const bx1 = hx + archDir * 2 + tilt * 0.6;
              const by1 = hy;
              this._stamp(bx1 - 1, by1, '/', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(bx1, by1, '^', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 1);
              this._stamp(bx1 + 1, by1, '\\', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(bx1 - 1, by1 + 1, '(', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead + 1);
              this._stamp(bx1, by1 + 1, shimmer ? 'o' : '*', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 2);
              this._stamp(bx1 + 1, by1 + 1, ')', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead + 1);

              // Secondary bell
              if (depth >= 1) {
                const bx2 = hx - archDir + tilt * 0.5;
                const by2 = hy + 1;
                this._stamp(bx2 - 1, by2, '/', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
                this._stamp(bx2, by2, 'o', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 1);
                this._stamp(bx2 + 1, by2, '\\', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead);
              }
            } else {
              // Star-lily / Rosette
              this._stamp(hx, hy, shimmer ? '@' : '*', cCore[0] * depthMul, cCore[1] * depthMul, cCore[2] * depthMul, prioHead + 3);
              this._stamp(hx - 1, hy, '<', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);
              this._stamp(hx + 1, hy, '>', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);
              this._stamp(hx - 2, hy, '~', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(hx + 2, hy, '~', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(hx, hy - 1, '^', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);
              this._stamp(hx, hy + 1, 'v', cIn[0] * depthMul, cIn[1] * depthMul, cIn[2] * depthMul, prioHead + 2);
              this._stamp(hx - 1, hy - 1, '\\', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(hx + 1, hy - 1, '/', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(hx - 1, hy + 1, '/', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              this._stamp(hx + 1, hy + 1, '\\', cOut[0] * depthMul, cOut[1] * depthMul, cOut[2] * depthMul, prioHead + 1);
              if (depth >= 1 && rScale > 0.78) {
                this._stamp(hx, hy - 2, '+', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
                this._stamp(hx - 3, hy, '.', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
                this._stamp(hx + 3, hy, '.', cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
                this._stamp(hx - 2, hy - 1, "'", cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
                this._stamp(hx + 2, hy - 1, "'", cTip[0] * depthMul, cTip[1] * depthMul, cTip[2] * depthMul, prioHead);
              }
            }

            // Subtle nocturnal glow on open blooms in Night preset
            if (p.fireflyAlpha > 0.1 && depth >= 1) {
              this._addGlow(hx, hy, 4.5, 2.8, cIn[0], cIn[1], cIn[2], 0.12 * p.fireflyAlpha);
            }
          }
        }
      }

      // C. Stamp drifting petals & their decaying trails (priority 55-62)
      const headGlyphs = ['*', '~', ',', "'", '^', 'o'];
      const trailGlyphs = ['+', ':', '.', '.', '`', '`', '.'];
      for (const pt of this.petals) {
        const fc = p.flowers[pt.colorIdx];
        const lifeFade = 1 - smoothstep(pt.maxLife * 0.72, pt.maxLife, pt.life);

        // Decaying trail first
        for (let k = pt.trail.length - 1; k >= 0; k--) {
          const tp = pt.trail[k];
          const fade = (1 - (k + 1) / (pt.trail.length + 1)) * 0.68 * lifeFade;
          if (fade < 0.08) continue;
          const tch = trailGlyphs[Math.min(k, trailGlyphs.length - 1)];
          this._stamp(
            tp.x,
            tp.y,
            tch,
            fc.outer[0] * fade + p.bgMid[0] * (1 - fade),
            fc.outer[1] * fade + p.bgMid[1] * (1 - fade),
            fc.outer[2] * fade + p.bgMid[2] * (1 - fade),
            55
          );
        }

        // Active petal head
        const gIdx = (pt.glyphBase + Math.floor(t * pt.spin)) % headGlyphs.length;
        const pch = headGlyphs[gIdx];
        const bright = 0.35 + 0.65 * lifeFade;
        this._stamp(
          pt.x,
          pt.y,
          pch,
          fc.tip[0] * bright,
          fc.tip[1] * bright,
          fc.tip[2] * bright,
          62
        );
      }

      // D. Stamp night fireflies & their real radial glow halos (priority 68)
      if (p.fireflyAlpha > 0.02) {
        for (const ff of this.fireflies) {
          const g = ff.glow;
          if (g < 0.06) continue;
          const cr = lerp(196, 255, ff.warmth);
          const cg = lerp(255, 224, ff.warmth);
          const cb = lerp(104, 96, ff.warmth);
          const ch = g > 0.72 ? '*' : g > 0.42 ? 'o' : g > 0.22 ? '+' : '.';
          this._stamp(ff.x, ff.y, ch, cr * (0.45 + 0.55 * g), cg * (0.45 + 0.55 * g), cb * (0.45 + 0.55 * g), 68);
          this._addGlow(ff.x, ff.y, 5.5, 3.2, cr, cg, cb, 0.42 * g);
        }
      }

      // E. Stamp ASCII butterflies with animated flapping wings (priority 78-84)
      for (const b of this.butterflies) {
        const sp = b.species;

        // Adapt species color to current preset palette & lighting
        const toneColor = (base) => {
          const avg = (base[0] + base[1] + base[2]) / 3;
          let r = avg + (base[0] - avg) * p.butterflySat;
          let g = avg + (base[1] - avg) * p.butterflySat;
          let bl = avg + (base[2] - avg) * p.butterflySat;
          r = lerp(r, p.butterflyWarmth[0], p.butterflyWarmthMix) * p.butterflyBright;
          g = lerp(g, p.butterflyWarmth[1], p.butterflyWarmthMix) * p.butterflyBright;
          bl = lerp(bl, p.butterflyWarmth[2], p.butterflyWarmthMix) * p.butterflyBright;
          return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(bl, 0, 255)];
        };

        const wingC = toneColor(sp.wing);
        const spotC = toneColor(sp.spot);
        const bodyC = toneColor(sp.body);

        // Subtle wing-dust trail behind butterfly
        for (let k = b.trail.length - 1; k >= 0; k--) {
          const tp = b.trail[k];
          const fade = (1 - (k + 1) / (b.trail.length + 1)) * 0.45;
          const ch = k === 0 ? ':' : k === 1 ? '.' : '`';
          this._stamp(
            tp.x,
            tp.y,
            ch,
            spotC[0] * fade + p.bgMid[0] * (1 - fade),
            spotC[1] * fade + p.bgMid[1] * (1 - fade),
            spotC[2] * fade + p.bgMid[2] * (1 - fade),
            66
          );
        }

        // Choose wing pose from continuous flap cycle + banking angle
        const poses = sp.large ? LARGE_BUTTERFLY_POSES : MED_BUTTERFLY_POSES;
        const s = Math.sin(b.wingPhase);
        const c = Math.cos(b.wingPhase);
        let poseKey;
        if (Math.abs(b.bank) > 0.56 && s > -0.15) {
          poseKey = b.bank > 0 ? 'bankRight' : 'bankLeft';
        } else if (s > 0.35) {
          poseKey = 'open';
        } else if (s < -0.45) {
          poseKey = 'closed';
        } else {
          poseKey = c >= 0 ? 'midUp' : 'midDown';
        }

        const sprite = poses[poseKey];
        const halfW = Math.floor(sprite[0].ch.length / 2);
        const prio = sp.large ? 84 : 78;

        for (let row = 0; row < sprite.length; row++) {
          const line = sprite[row].ch;
          const mask = sprite[row].mk;
          for (let col = 0; col < line.length; col++) {
            const ch = line[col];
            if (ch === ' ') continue;
            const m = mask[col];
            const rgb = m === 'S' ? spotC : m === 'B' ? bodyC : wingC;
            this._stamp(b.x + col - halfW, b.y + row - 1, ch, rgb[0], rgb[1], rgb[2], prio);
          }
        }

        // Soft ambient shimmer around hero butterflies
        this._addGlow(b.x, b.y, 4.0, 2.4, wingC[0], wingC[1], wingC[2], 0.14);
      }

      // F. Stamp luminous typographic pointer lantern & pollen wake (priority 90)
      if (this.pointer.alpha > 0.05) {
        const ptr = this.pointer;
        const pc = p.pointerColor;
        const a = ptr.alpha;

        // Pointer wake motes
        const wakeChs = ['*', '+', ':', '.', '`', '.'];
        for (let k = ptr.trail.length - 1; k >= 0; k--) {
          const tp = ptr.trail[k];
          const fade = (1 - (k + 1) / (ptr.trail.length + 1)) * 0.65 * a;
          const ch = wakeChs[Math.min(k, wakeChs.length - 1)];
          this._stamp(tp.x, tp.y, ch, pc[0] * fade, pc[1] * fade, pc[2] * fade, 72);
        }

        // Rotating typographic nectar-lantern reticle
        const spin = Math.floor(t * 7) % 4;
        const centerCh = spin % 2 === 0 ? '+' : 'x';
        this._stamp(ptr.x, ptr.y, centerCh, pc[0] * a, pc[1] * a, pc[2] * a, 92);
        this._stamp(ptr.x - 1, ptr.y, '(', pc[0] * 0.72 * a, pc[1] * 0.72 * a, pc[2] * 0.72 * a, 90);
        this._stamp(ptr.x + 1, ptr.y, ')', pc[0] * 0.72 * a, pc[1] * 0.72 * a, pc[2] * 0.72 * a, 90);
        if (spin === 0 || spin === 2) {
          this._stamp(ptr.x, ptr.y - 1, '.', pc[0] * 0.6 * a, pc[1] * 0.6 * a, pc[2] * 0.6 * a, 89);
          this._stamp(ptr.x, ptr.y + 1, '.', pc[0] * 0.6 * a, pc[1] * 0.6 * a, pc[2] * 0.6 * a, 89);
        }
        this._addGlow(ptr.x, ptr.y, 7.5, 4.2, pc[0], pc[1], pc[2], 0.34 * a);
      }
    }

    // =========================================================================
    // SHADER-LIKE PER-CELL FUNCTION: main(x, y, t, pointer) -> glyph + color
    // =========================================================================
    main(x, y, t, pointer) {
      const out = this._cellOut;
      const p = this.blended;
      const cols = this.cols;
      const rows = this.rows;
      const idx = y * cols + x;

      const u = x / cols;
      const v = y / rows;
      const groundY = this.groundContour[x];

      // Base sky-to-earth background color (used for glow tinting & fades)
      let bgR, bgG, bgB;
      if (v < 0.55) {
        const k = v / 0.55;
        bgR = lerp(p.bgTop[0], p.bgMid[0], k);
        bgG = lerp(p.bgTop[1], p.bgMid[1], k);
        bgB = lerp(p.bgTop[2], p.bgMid[2], k);
      } else {
        const k = (v - 0.55) / 0.45;
        bgR = lerp(p.bgMid[0], p.bgBot[0], k);
        bgG = lerp(p.bgMid[1], p.bgBot[1], k);
        bgB = lerp(p.bgMid[2], p.bgBot[2], k);
      }

      // Dynamic glow halo accumulated from fireflies, blooms, butterflies, and pointer
      // (Smooth atmospheric radial gradients are painted under the glyphs in render();
      // here glR/glG/glB illuminates the foreground glyphs themselves cleanly with zero boxy edges)
      const glR = this.layerGlowR[idx];
      const glG = this.layerGlowG[idx];
      const glB = this.layerGlowB[idx];
      const glowMag = glR + glG + glB;
      out.hasBg = false;

      // 1. Check stamped garden entities (flowers, grass, petals, fireflies, butterflies, pointer)
      const entCh = this.layerChar[idx];
      if (entCh !== '') {
        out.ch = entCh;
        out.r = clamp(this.layerR[idx] + glR * 0.55, 0, 255);
        out.g = clamp(this.layerG[idx] + glG * 0.55, 0, 255);
        out.b = clamp(this.layerB[idx] + glB * 0.55, 0, 255);
        return out;
      }

      // 2. Layered Garden Soil & Moss Floor (below groundContour)
      if (y >= groundY) {
        const depth = y - groundY;
        const h = hash2(x, y, 17);
        if (depth < 1.15) {
          // Top meadow crust / moss rim
          const ch = h < 0.28 ? '~' : h < 0.54 ? ',' : h < 0.78 ? '_' : '.';
          const c = p.soil[0];
          out.ch = ch;
          out.r = clamp(c[0] + glR * 0.45, 0, 255);
          out.g = clamp(c[1] + glG * 0.45, 0, 255);
          out.b = clamp(c[2] + glB * 0.45, 0, 255);
          return out;
        }
        if (depth < 3.2) {
          const ch = h < 0.2 ? '.' : h < 0.34 ? ',' : h < 0.43 ? ':' : h < 0.49 ? '-' : ' ';
          if (ch !== ' ') {
            const c = p.soil[1];
            out.ch = ch;
            out.r = clamp(c[0] + glR * 0.3, 0, 255);
            out.g = clamp(c[1] + glG * 0.3, 0, 255);
            out.b = clamp(c[2] + glB * 0.3, 0, 255);
            return out;
          }
        } else {
          const ch = h < 0.14 ? '.' : h < 0.21 ? ';' : ' ';
          if (ch !== ' ') {
            const c = p.soil[2];
            out.ch = ch;
            out.r = c[0];
            out.g = c[1];
            out.b = c[2];
            return out;
          }
        }
        out.ch = ' ';
        return out;
      }

      // 3. Distant Botanical Hedgerow / Trellis Silhouette (soft depth behind flowers)
      const hedgeTop = groundY - 7.5 - Math.sin(u * Math.PI * 6.5 + 0.9) * 3.2 - Math.cos(u * Math.PI * 13.0) * 1.4;
      if (y > hedgeTop) {
        const h = hash2(x, y, 71);
        const edgeBand = y - hedgeTop < 1.6;
        if (edgeBand && h < 0.42) {
          out.ch = h < 0.16 ? '.' : h < 0.3 ? ',' : '~';
          out.r = clamp(p.trellis[0] + glR * 0.4, 0, 255);
          out.g = clamp(p.trellis[1] + glG * 0.4, 0, 255);
          out.b = clamp(p.trellis[2] + glB * 0.4, 0, 255);
          return out;
        }
        if (!edgeBand && h < 0.18) {
          out.ch = h < 0.08 ? ':' : '.';
          out.r = clamp(p.trellis[0] * 0.88 + glR * 0.35, 0, 255);
          out.g = clamp(p.trellis[1] * 0.88 + glG * 0.35, 0, 255);
          out.b = clamp(p.trellis[2] * 0.88 + glB * 0.35, 0, 255);
          return out;
        }
      }

      // 4. Wind Gust Streaks (Preset 4: sweeping sparse streamlines across the squall)
      if (p.streakAlpha > 0.04 && y > 3 && y < groundY - 1) {
        // Stagger streamlines vertically so streaks never stack into boxy blocks
        const lane = Math.floor(y / 2);
        if (y % 2 === (lane % 2)) {
          const speed = 58 + (lane % 3) * 14;
          const waveY = Math.sin(x * 0.035 - t * 2.4 + lane) * 1.4;
          const wx = Math.floor(x - t * speed + y * 2.4 + waveY * 3);
          const cellSpan = 18;
          const bucket = Math.floor(wx / cellSpan);
          const seg = ((wx % cellSpan) + cellSpan) % cellSpan;
          const band = hash2(bucket, lane, 303);
          const streakLen = 5 + Math.floor(band * 7);
          if (band > 0.80 && seg < streakLen) {
            const edgeFade = Math.sin(((seg + 0.5) / streakLen) * Math.PI);
            const ch =
              seg === 0 || seg === streakLen - 1
                ? '.'
                : seg === Math.floor(streakLen * 0.5)
                  ? '~'
                  : '-';
            const a = p.streakAlpha * edgeFade * (0.28 + (band - 0.80) * 2.2);
            out.ch = ch;
            out.r = clamp(lerp(bgR, p.skyAccent[0], a), 0, 255);
            out.g = clamp(lerp(bgG, p.skyAccent[1], a), 0, 255);
            out.b = clamp(lerp(bgB, p.skyAccent[2], a), 0, 255);
            return out;
          }
        }
      }

      // 5. Dawn Mist Ribbons & Noon Sunbeam Motes
      if (p.mistAlpha > 0.06 && y > rows * 0.45 && y < groundY - 1) {
        const drift = Math.sin(x * 0.085 - t * 0.65 + y * 0.35) * Math.cos(x * 0.04 + t * 0.35 - y * 0.22);
        if (drift > 0.66) {
          const a = p.mistAlpha * (drift - 0.66) * 2.1;
          out.ch = drift > 0.82 ? '~' : '.';
          out.r = lerp(bgR, p.horizonGlow[0] * 1.55, clamp(a, 0, 0.85));
          out.g = lerp(bgG, p.horizonGlow[1] * 1.55, clamp(a, 0, 0.85));
          out.b = lerp(bgB, p.horizonGlow[2] * 1.55, clamp(a, 0, 0.85));
          return out;
        }
      }

      if (p.sunbeamAlpha > 0.06 && y > 3 && y < groundY - 3) {
        // Subtle diagonal sunshaft shimmer & floating pollen specks
        const shaft = Math.sin((x * 0.055 + y * 0.14) - t * 0.22);
        if (shaft > 0.72) {
          const h = hash2(x, Math.floor(y + t * 1.8), 512);
          if (h > 0.968) {
            const twinkle = 0.55 + 0.45 * Math.sin(t * 4.2 + h * 40);
            const a = p.sunbeamAlpha * twinkle * 0.72;
            out.ch = h > 0.986 ? '+' : h > 0.976 ? "'" : '.';
            out.r = lerp(bgR, p.skyAccent[0], a);
            out.g = lerp(bgG, p.skyAccent[1], a);
            out.b = lerp(bgB, p.skyAccent[2], a);
            return out;
          }
        }
      }

      // 6. Twinkling Starfield (Night & subtle early Dawn)
      if (p.starAlpha > 0.05 && y >= 3 && y < rows * 0.52) {
        const h = hash2(x, y, 881);
        if (h > 0.976) {
          const twinkle = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.8 + (h * 19) % 2.4) + h * 100), 2);
          const a = p.starAlpha * twinkle * (1 - v * 1.35);
          if (a > 0.08) {
            out.ch = h > 0.994 ? '+' : h > 0.987 ? '*' : '.';
            out.r = lerp(bgR, p.skyAccent[0] + 45, clamp(a, 0, 1));
            out.g = lerp(bgG, p.skyAccent[1] + 45, clamp(a, 0, 1));
            out.b = lerp(bgB, p.skyAccent[2] + 50, clamp(a, 0, 1));
            return out;
          }
        }
      }

      // 7. Pointer Ambient Ripple Field (subtle shimmering dust when pointer glows over empty sky)
      if (pointer.alpha > 0.1 && glowMag > 26) {
        const h = hash2(x, y, Math.floor(t * 6));
        if (h > 0.92) {
          out.ch = '.';
          out.r = clamp(p.pointerColor[0] * 0.65, 0, 255);
          out.g = clamp(p.pointerColor[1] * 0.65, 0, 255);
          out.b = clamp(p.pointerColor[2] * 0.65, 0, 255);
          return out;
        }
      }

      out.ch = ' ';
      return out;
    }

    // =========================================================================
    // RENDER FULL FRAME TO CANVAS (batched by quantized RGB for crisp 60fps)
    // =========================================================================
    render() {
      const ctx = this.ctx;
      const p = this.blended;
      const cols = this.cols;
      const rows = this.rows;
      const ox = this.offsetX;
      const oy = this.offsetY;

      this._prepareEntityLayers();

      // 1. Paint smooth dark atmospheric backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0.0, rgbCss(p.bgTop[0], p.bgTop[1], p.bgTop[2]));
      grad.addColorStop(0.56, rgbCss(p.bgMid[0], p.bgMid[1], p.bgMid[2]));
      grad.addColorStop(1.0, rgbCss(p.bgBot[0], p.bgBot[1], p.bgBot[2]));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Subtle horizon glow band for Dawn/Noon/Night depth
      const hGrad = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.82,
        this.width * 0.05,
        this.width * 0.5,
        this.height * 0.82,
        this.width * 0.62
      );
      hGrad.addColorStop(0, `rgba(${p.horizonGlow[0] | 0},${p.horizonGlow[1] | 0},${p.horizonGlow[2] | 0},0.32)`);
      hGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hGrad;
      ctx.fillRect(0, 0, this.width, this.height);

      // Smooth feathered diagonal sunshaft wash (Dawn & Noon)
      if (p.sunbeamAlpha > 0.05) {
        ctx.save();
        for (let s = 0; s < 3; s++) {
          const bx = this.width * (0.20 + s * 0.30) + Math.sin(this.t * 0.25 + s) * 28;
          ctx.save();
          ctx.translate(bx, 0);
          ctx.transform(1, 0, 0.22, 1, 0, 0);
          const halfW = 190;
          const beam = ctx.createLinearGradient(-halfW, 0, halfW, 0);
          const a = 0.055 * p.sunbeamAlpha;
          beam.addColorStop(0.0, 'rgba(0,0,0,0)');
          beam.addColorStop(0.5, `rgba(${p.skyAccent[0] | 0},${p.skyAccent[1] | 0},${p.skyAccent[2] | 0},${a.toFixed(4)})`);
          beam.addColorStop(1.0, 'rgba(0,0,0,0)');
          ctx.fillStyle = beam;
          ctx.fillRect(-halfW, 0, halfW * 2, this.height * 0.92);
          ctx.restore();
        }
        ctx.restore();
      }

      // Smooth radial glow halos for Night fireflies & active pointer lantern (no boxy cell edges!)
      if (p.fireflyAlpha > 0.03) {
        for (const ff of this.fireflies) {
          if (ff.glow < 0.12) continue;
          const fx = ox + (ff.x + 0.5) * CELL_W;
          const fy = oy + (ff.y + 0.5) * CELL_H;
          const rad = (44 + ff.glow * 34);
          const cr = lerp(196, 255, ff.warmth) | 0;
          const cg = lerp(255, 224, ff.warmth) | 0;
          const cb = lerp(104, 96, ff.warmth) | 0;
          const fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, rad);
          fg.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.26 * ff.glow).toFixed(3)})`);
          fg.addColorStop(0.45, `rgba(${cr},${cg},${cb},${(0.08 * ff.glow).toFixed(3)})`);
          fg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = fg;
          ctx.fillRect(fx - rad, fy - rad, rad * 2, rad * 2);
        }
      }
      if (this.pointer.alpha > 0.06) {
        const px = ox + (this.pointer.x + 0.5) * CELL_W;
        const py = oy + (this.pointer.y + 0.5) * CELL_H;
        const rad = 74;
        const pc = p.pointerColor;
        const pg = ctx.createRadialGradient(px, py, 2, px, py, rad);
        pg.addColorStop(0, `rgba(${pc[0] | 0},${pc[1] | 0},${pc[2] | 0},${(0.22 * this.pointer.alpha).toFixed(3)})`);
        pg.addColorStop(0.5, `rgba(${pc[0] | 0},${pc[1] | 0},${pc[2] | 0},${(0.06 * this.pointer.alpha).toFixed(3)})`);
        pg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }

      // 2. Evaluate shader-like main(x, y, t, pointer) across all cells
      // Batch foreground glyph draws by quantized color key so ctx.fillStyle changes minimally
      const buckets = this._buckets;
      buckets.clear();

      const t = this.t;
      const ptr = this.pointer;

      for (let y = 0; y < rows; y++) {
        const py = oy + y * CELL_H;
        for (let x = 0; x < cols; x++) {
          const cell = this.main(x, y, t, ptr);
          const px = ox + x * CELL_W;

          if (cell.hasBg) {
            ctx.fillStyle = rgbCss(cell.bgR, cell.bgG, cell.bgB);
            ctx.fillRect(px, py, CELL_W, CELL_H);
          }

          if (cell.ch !== ' ') {
            // Quantize RGB to step 6 (keeps rich gradients while slashing state switches)
            const qr = ((cell.r / 6) | 0) * 6;
            const qg = ((cell.g / 6) | 0) * 6;
            const qb = ((cell.b / 6) | 0) * 6;
            const key = (qr << 16) | (qg << 8) | qb;
            let list = buckets.get(key);
            if (!list) {
              list = [];
              buckets.set(key, list);
            }
            list.push(cell.ch, px, py + 1);
          }
        }
      }

      // 3. Draw all glyph buckets cleanly
      ctx.font = FONT_SPEC;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      for (const [key, list] of buckets) {
        const r = (key >> 16) & 255;
        const g = (key >> 8) & 255;
        const b = key & 255;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        for (let i = 0; i < list.length; i += 3) {
          ctx.fillText(list[i], list[i + 1], list[i + 2]);
        }
      }

      // 4. Discreet Monospace HUD
      this._renderHud(ctx);
    }

    _renderHud(ctx) {
      const active = PRESETS[this.targetPresetIdx];
      const p = this.blended;
      const ox = this.offsetX;
      const oy = this.offsetY;

      ctx.font = FONT_SPEC;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      // Top-left discreet preset badge
      const hudX = ox + CELL_W * 2;
      const hudY = oy + CELL_H * 1;
      const titleStr = `ASCII BUTTERFLY GARDEN  ::  ${active.code} ${active.name} [${active.subtitle}]`;
      const pillW = (titleStr.length + 4) * CELL_W;

      ctx.fillStyle = 'rgba(6, 9, 16, 0.72)';
      ctx.fillRect(hudX - CELL_W, hudY - 3, pillW, CELL_H + 6);
      ctx.strokeStyle = `rgba(${p.hudAccent[0] | 0},${p.hudAccent[1] | 0},${p.hudAccent[2] | 0},0.42)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(hudX - CELL_W + 0.5, hudY - 2.5, pillW - 1, CELL_H + 5);

      ctx.fillStyle = rgbCss(p.hudText[0], p.hudText[1], p.hudText[2]);
      ctx.fillText('ASCII BUTTERFLY GARDEN  ::  ', hudX, hudY + 1);

      const prefixW = 28 * CELL_W;
      ctx.fillStyle = rgbCss(p.hudAccent[0], p.hudAccent[1], p.hudAccent[2]);
      ctx.fillText(`${active.code} ${active.name}`, hudX + prefixW, hudY + 1);

      const nameW = `${active.code} ${active.name}`.length * CELL_W;
      ctx.fillStyle = rgbCss(p.hudMuted[0], p.hudMuted[1], p.hudMuted[2]);
      ctx.fillText(` [${active.subtitle}]`, hudX + prefixW + nameW, hudY + 1);

      // Bottom-left discreet preset selector strip
      const botY = oy + (this.rows - 2) * CELL_H;
      const items = PRESETS.map((pr) => `[${pr.key}] ${pr.name}`);
      const hintStr = '   |   Pointer beckons   [R] Regrow';
      const totalChars = items.join('  ').length + hintStr.length;

      ctx.fillStyle = 'rgba(6, 9, 16, 0.64)';
      ctx.fillRect(hudX - CELL_W, botY - 2, (totalChars + 2) * CELL_W, CELL_H + 4);

      let curX = hudX;
      for (let i = 0; i < PRESETS.length; i++) {
        const label = items[i];
        const isCurrent = i === this.targetPresetIdx;
        ctx.fillStyle = isCurrent
          ? rgbCss(p.hudAccent[0], p.hudAccent[1], p.hudAccent[2])
          : rgbCss(p.hudMuted[0], p.hudMuted[1], p.hudMuted[2]);
        ctx.fillText(label, curX, botY + 1);
        curX += (label.length + 2) * CELL_W;
      }

      ctx.fillStyle = rgbCss(p.hudMuted[0], p.hudMuted[1], p.hudMuted[2]);
      ctx.fillText(hintStr, curX - CELL_W * 2, botY + 1);
    }

    // =========================================================================
    // SCRIPTED 15.0s CHOREOGRAPHY (for deterministic capture & demo mode)
    // =========================================================================
    applyScriptAtTime(t) {
      // Preset schedule:
      // 0.0 - 3.5s: Dawn (buds sprout & open, pointer glides in, butterflies approach)
      // 3.5 - 7.0s: Noon (vibrant foliage, lively sweeping figure-8 between clusters)
      // 7.0 - 11.0s: Night Fireflies (palette drops, fireflies appear, pointer orbits hero bloom)
      // 11.0 - 15.0s: Wind Gust (stems lean, petals scatter, butterflies bank with pointer, brief hold)
      if (t < 3.5) {
        this.setPreset(0, t < 0.02);
      } else if (t < 7.0) {
        this.setPreset(1, false);
      } else if (t < 11.0) {
        this.setPreset(2, false);
      } else {
        this.setPreset(3, false);
      }

      // Scripted pointer path (normalized 0..1 coordinates -> cell coordinates)
      let nx = 0.5;
      let ny = 0.4;
      let active = true;

      if (t < 0.75) {
        // Brief pure growth beat before pointer glides in smoothly
        active = false;
        nx = 0.12;
        ny = 0.24;
      } else if (t < 3.5) {
        // Dawn: pointer glides gracefully in from upper-left toward center-right blooms
        const u = smoothstep(0.75, 3.5, t);
        nx = lerp(0.12, 0.68, u) + Math.sin(u * Math.PI * 1.5) * 0.05;
        ny = lerp(0.24, 0.44, u) - Math.sin(u * Math.PI) * 0.11;
      } else if (t < 7.0) {
        // Noon: wide energetic curve sweeping between left, center, and right flower clusters
        const u = (t - 3.5) / 3.5;
        nx = 0.50 + Math.cos(u * Math.PI * 2.15 - 0.5) * 0.34;
        ny = 0.40 + Math.sin(u * Math.PI * 4.1) * 0.14;
      } else if (t < 11.0) {
        // Night: smooth transition into a dreamy orbit around the hero bloom near (0.62, 0.43)
        const u = (t - 7.0) / 4.0;
        const enter = smoothstep(0, 0.25, u);
        const angle = u * Math.PI * 3.4 - 0.4;
        const orbitX = 0.61 + Math.cos(angle) * 0.14;
        const orbitY = 0.41 + Math.sin(angle) * 0.11;
        const startX = 0.50 + Math.cos(Math.PI * 2.15 - 0.5) * 0.34;
        const startY = 0.40 + Math.sin(Math.PI * 4.1) * 0.14;
        nx = lerp(startX, orbitX, enter);
        ny = lerp(startY, orbitY, enter);
      } else {
        // Wind Gust: pointer banks across the meadow with the squall, then holds gracefully
        const u = clamp((t - 11.0) / 3.3, 0, 1);
        const e = smoothstep(0, 1, u);
        const sweepX = lerp(0.26, 0.78, e) + Math.sin(e * Math.PI * 2.0) * 0.04;
        const sweepY = lerp(0.46, 0.28, e) + Math.sin(e * Math.PI * 1.5) * 0.08;
        const blendIn = smoothstep(0, 0.18, u);
        const nightEndAngle = Math.PI * 3.4 - 0.4;
        const prevX = 0.61 + Math.cos(nightEndAngle) * 0.14;
        const prevY = 0.41 + Math.sin(nightEndAngle) * 0.11;
        nx = lerp(prevX, sweepX, blendIn);
        ny = lerp(prevY, sweepY, blendIn);
      }

      this.setPointerCells(nx * this.cols, ny * this.rows, active);
    }

    // Pure deterministic frame seek & render: same frameIndex ALWAYS gives exact same image
    renderFrame(frameIndex) {
      const target = Math.max(0, frameIndex | 0);
      if (target < this.frame || (target === 0 && this.frame === 0)) {
        this.reset(this.seed);
      }
      if (target === 0) {
        this.applyScriptAtTime(0);
        // Prime initial flower positions for frame 0
        this.step(FIXED_DT);
        this.frame = 0;
        this.t = 0;
        this.render();
        return;
      }
      while (this.frame < target) {
        const nextT = (this.frame + 1) * FIXED_DT;
        this.applyScriptAtTime(nextT);
        this.step(FIXED_DT);
      }
      this.render();
    }
  }

  // =========================================================================
  // BOOTSTRAP LIVE MODE + CAPTURE HOOK
  // =========================================================================
  const canvas = document.getElementById('garden-canvas');
  const garden = new AsciiButterflyGarden(canvas);

  const params = new URLSearchParams(window.location.search);
  const isCapture = params.get('capture') === '1';
  garden.captureMode = isCapture;

  // Expose deterministic capture & inspection API
  window.__garden = {
    instance: garden,
    setCaptureMode(enabled) {
      garden.captureMode = !!enabled;
    },
    setPreset(idx, immediate = false) {
      garden.setPreset(idx, immediate);
    },
    setPointer(cx, cy, active = true) {
      garden.setPointerCells(cx, cy, active);
    },
    reset(seed) {
      garden.reset(seed);
    },
    renderFrame(frameIndex) {
      garden.renderFrame(frameIndex);
    },
    getInfo() {
      return {
        width: garden.width,
        height: garden.height,
        cols: garden.cols,
        rows: garden.rows,
        frame: garden.frame,
        t: garden.t,
        preset: PRESETS[garden.targetPresetIdx].name,
        petals: garden.petals.length,
        butterflies: garden.butterflies.length,
      };
    },
  };

  if (!isCapture) {
    // Interactive pointer listeners
    let pointerIdleTimer = null;
    const onPointerMove = (e) => {
      garden.setPointerPixels(e.clientX, e.clientY, true);
      if (pointerIdleTimer) clearTimeout(pointerIdleTimer);
      pointerIdleTimer = setTimeout(() => {
        garden.pointer.active = false;
      }, 4500);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', () => {
      garden.pointer.active = false;
    });

    // Keyboard presets (1-4), Regrow (R), Pause (Space)
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') garden.setPreset(0);
      else if (e.key === '2') garden.setPreset(1);
      else if (e.key === '3') garden.setPreset(2);
      else if (e.key === '4') garden.setPreset(3);
      else if (e.key === 'r' || e.key === 'R') {
        const curPreset = garden.targetPresetIdx;
        garden.reset(garden.seed);
        garden.setPreset(curPreset, true);
      } else if (e.key === ' ') {
        e.preventDefault();
        garden.paused = !garden.paused;
      }
    });

    window.addEventListener('resize', () => {
      garden.resize(window.innerWidth, window.innerHeight);
      garden.render();
    });

    // Fixed-timestep 60fps animation loop
    let lastTs = performance.now();
    let acc = 0;

    function loop(now) {
      const elapsed = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      if (!garden.paused) {
        acc += elapsed;
        let steps = 0;
        while (acc >= FIXED_DT && steps < 4) {
          garden.step(FIXED_DT);
          acc -= FIXED_DT;
          steps++;
        }
        garden.render();
      }
      requestAnimationFrame(loop);
    }

    garden.render();
    requestAnimationFrame(loop);
  } else {
    // Capture mode waits deterministically for window.__garden.renderFrame(n)
    garden.resize(1920, 1080);
    garden.renderFrame(0);
  }
})();
