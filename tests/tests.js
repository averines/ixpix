// ixpix self-tests. Loaded by index.html only when opened as index.html#test;
// run headless with scripts/test.sh. Uses the app's globals: this is a classic
// script sharing one global scope with the app, not a module.
// Copyright (C) 2026 Averines. SPDX-License-Identifier: AGPL-3.0-only

// ==== TESTS ====

/** @type {{name: string, fn: () => (void | Promise<void>)}[]} */
const TEST_CASES = [];

/**
 * Registers a test. A test fails if it throws (including asynchronously).
 * @param {string} name
 * @param {() => (void | Promise<void>)} fn
 */
function test(name, fn) {
  TEST_CASES.push({ name, fn });
}

/**
 * @param {unknown} condition
 * @param {string} [message]
 * @returns {asserts condition}
 */
function assert(condition, message = 'condition not met') {
  if (!condition) throw new Error(message);
}

/**
 * Fails the test on null or undefined, otherwise returns the value with the
 * null removed from its type.
 * @template T
 * @param {T | null | undefined} value
 * @param {string} [message]
 * @returns {T}
 */
function must(value, message = 'unexpected null') {
  if (value == null) throw new Error(message);
  return value;
}

/**
 * Strict equality; arrays and objects are compared via JSON.
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} [message]
 */
function assertEqual(actual, expected, message = '') {
  const isSame = typeof actual === 'object' && actual !== null
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected;
  if (!isSame) {
    throw new Error(`${message ? message + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * @param {number} actual
 * @param {number} expected
 * @param {number} eps
 * @param {string} [message]
 */
function assertClose(actual, expected, eps, message = '') {
  if (!(Math.abs(actual - expected) <= eps)) {
    throw new Error(`${message ? message + ': ' : ''}expected ${expected} ± ${eps}, got ${actual}`);
  }
}

const TEST_REPORT_CSS = `
  body.test-mode .app,
  body.test-mode .narrow-notice { display: none !important; }
  .test-report {
    max-width: 1100px;
    padding: 20px;
    & table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    & th,
    & td { padding: var(--sp-2) var(--sp-4); border-bottom: var(--bw) solid var(--border); text-align: left; vertical-align: top; }
    & .is-pass { color: var(--ok); }
    & .is-fail { color: var(--err); }
  }`;

async function runTests() {
  document.body.classList.add('test-mode');
  const style = document.createElement('style');
  style.textContent = TEST_REPORT_CSS;
  document.head.append(style);
  const report = document.createElement('div');
  report.id = 'test-report';
  report.className = 'test-report';
  document.body.append(report);
  report.innerHTML = `
    <h2>Self-tests</h2>
    <p id="test-summary">Running…</p>
    <table>
      <thead><tr><th>Test</th><th>Status</th><th>ms</th><th>Details</th></tr></thead>
      <tbody></tbody>
    </table>
    <p><a href="#">Back to the app</a></p>`;
  const tbody = /** @type {HTMLElement} */ (report.querySelector('tbody'));

  /** @type {{name: string, isOk: boolean, ms: number, message: string}[]} */
  const results = [];
  for (const { name, fn } of TEST_CASES) {
    const t0 = performance.now();
    /** @type {unknown} */
    let error = null;
    try {
      await fn();
    } catch (err) {
      error = err;
      console.error(`FAIL ${name}`, err);
    }
    const result = {
      name,
      isOk: !error,
      ms: performance.now() - t0,
      message: error instanceof Error ? error.message : error ? String(error) : '',
    };
    results.push(result);

    const row = document.createElement('tr');
    for (const text of [result.name, result.isOk ? 'OK' : 'FAIL', result.ms.toFixed(1), result.message]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    /** @type {HTMLElement} */ (row.children[1]).className = result.isOk ? 'is-pass' : 'is-fail';
    tbody.append(row);
  }

  const failed = results.filter((r) => !r.isOk).length;
  const summary = `TESTS: ${results.length - failed} passed, ${failed} failed`;
  const summaryEl = byId('test-summary');
  summaryEl.textContent = summary;
  summaryEl.className = failed ? 'is-fail' : 'is-pass';
  document.title = `${failed ? 'FAIL' : 'OK'} ${summary}`;
  console.log(summary);
  /** @type {any} */ (window).__testResults = { passed: results.length - failed, failed, results };
}

// ---- Synthetic test image generator ----
// Emulates AI "pseudo pixel art" with known grid parameters, so grid and
// downscale tests can compare against an exact answer.

/** Channel levels for the synthetic palette: 4^3 = 64 well-separated colors */
const SYNTH_LEVELS = [16, 88, 160, 232];

/**
 * Picks `count` distinct colors from the SYNTH_LEVELS lattice.
 * @param {number} count 2..64
 * @param {() => number} rng
 * @returns {number[][]} colors [r, g, b]
 */
function pickSynthPalette(count, rng) {
  /** @type {number[][]} */
  const all = [];
  for (const r of SYNTH_LEVELS) for (const g of SYNTH_LEVELS) for (const b of SYNTH_LEVELS) all.push([r, g, b]);
  // Partial Fisher-Yates shuffle
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (all.length - i));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

/**
 * Random 1:1 "art": a background and a set of rectangles from the palette.
 * @param {{width: number, height: number, colors?: number, seed?: number}} options
 * @returns {ImageData} opaque image
 */
function makeSyntheticArt({ width, height, colors = 8, seed = 1 }) {
  assert(colors >= 2 && colors <= SYNTH_LEVELS.length ** 3, `colors out of range: ${colors}`);
  const rng = createRng(seed);
  const palette = pickSynthPalette(colors, rng);
  const image = new ImageData(width, height);
  const d = image.data;

  /**
   * @param {number} x0
   * @param {number} y0
   * @param {number} w
   * @param {number} h
   * @param {number[]} color
   */
  const fillRect = (x0, y0, w, h, color) => {
    for (let y = y0; y < Math.min(height, y0 + h); y++) {
      for (let x = x0; x < Math.min(width, x0 + w); x++) {
        const i = (y * width + x) * 4;
        d[i] = color[0];
        d[i + 1] = color[1];
        d[i + 2] = color[2];
        d[i + 3] = 255;
      }
    }
  };

  fillRect(0, 0, width, height, palette[0]);
  const rectCount = Math.max(4, Math.round((width * height) / 10));
  const maxSide = Math.max(2, Math.round(Math.min(width, height) / 4));
  for (let n = 0; n < rectCount; n++) {
    const w = 1 + Math.floor(rng() * maxSide);
    const h = 1 + Math.floor(rng() * maxSide);
    const x = Math.floor(rng() * width);
    const y = Math.floor(rng() * height);
    fillRect(x, y, w, h, palette[1 + Math.floor(rng() * (colors - 1))]);
  }
  return image;
}

/**
 * Upscales art into "pseudo pixel art": each art pixel becomes a cellW × cellH block
 * (fractional sizes allowed). Art column ax covers output pixels whose centers fall in
 * [offsetX + ax*cellW, offsetX + (ax+1)*cellW). Pixels outside the art repeat the edge.
 * @param {ImageData} art
 * @param {{cellW: number, cellH?: number, offsetX?: number, offsetY?: number, width?: number, height?: number}} options
 * @returns {ImageData}
 */
function renderPseudoPixelArt(art, { cellW, cellH = cellW, offsetX = 0, offsetY = 0, width, height }) {
  const outW = width ?? Math.ceil(art.width * cellW + offsetX);
  const outH = height ?? Math.ceil(art.height * cellH + offsetY);
  const cols = new Int32Array(outW);
  const rows = new Int32Array(outH);
  for (let x = 0; x < outW; x++) cols[x] = clamp(Math.floor((x + 0.5 - offsetX) / cellW), 0, art.width - 1);
  for (let y = 0; y < outH; y++) rows[y] = clamp(Math.floor((y + 0.5 - offsetY) / cellH), 0, art.height - 1);

  const out = new ImageData(outW, outH);
  const src = art.data;
  const dst = out.data;
  for (let y = 0; y < outH; y++) {
    const rowOffset = rows[y] * art.width;
    for (let x = 0; x < outW; x++) {
      const si = (rowOffset + cols[x]) * 4;
      const di = (y * outW + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return out;
}

/**
 * Separable RGB box blur (alpha unchanged), edges repeated.
 * @param {ImageData} image
 * @param {number} radius integer, 0 = copy
 * @returns {ImageData}
 */
function boxBlur(image, radius) {
  const { width: w, height: h } = image;
  const size = 2 * radius + 1;
  const tmp = new Uint8ClampedArray(image.data);
  const out = new Uint8ClampedArray(image.data);
  if (radius <= 0) return new ImageData(out, w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += image.data[(y * w + clamp(x + k, 0, w - 1)) * 4 + c];
        tmp[(y * w + x) * 4 + c] = Math.round(sum / size);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += tmp[(clamp(y + k, 0, h - 1) * w + x) * 4 + c];
        out[(y * w + x) * 4 + c] = Math.round(sum / size);
      }
    }
  }
  return new ImageData(out, w, h);
}

/**
 * Uniform ±amplitude noise on RGB channels.
 * @param {ImageData} image
 * @param {number} amplitude
 * @param {number} seed
 * @returns {ImageData}
 */
function addNoise(image, amplitude, seed) {
  const rng = createRng(seed);
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = image.data[i + c] + Math.round((rng() * 2 - 1) * amplitude);
  }
  return new ImageData(out, image.width, image.height);
}

/**
 * Re-encodes the image as JPEG with the browser codec and decodes it back.
 * @param {ImageData} image
 * @param {number} quality 0..1
 * @returns {Promise<ImageData>}
 */
async function jpegRecompress(image, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).putImageData(image, 0, 0);
  const el = new Image();
  el.src = canvas.toDataURL('image/jpeg', quality);
  await el.decode();
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(el, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
}

/**
 * Mean absolute difference over RGB channels.
 * @param {ImageData} a
 * @param {ImageData} b
 */
function meanAbsDiff(a, b) {
  assertEqual([a.width, a.height], [b.width, b.height], 'sizes');
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  }
  return sum / (a.width * a.height * 3);
}

/**
 * Set of image colors as 0xRRGGBB numbers.
 * @param {ImageData} image
 */
function colorSet(image) {
  const set = new Set();
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return set;
}

// ---- Generator: tests ----

test('synth: art is deterministic by seed', () => {
  const a = makeSyntheticArt({ width: 24, height: 16, seed: 5 });
  const b = makeSyntheticArt({ width: 24, height: 16, seed: 5 });
  const c = makeSyntheticArt({ width: 24, height: 16, seed: 6 });
  assertEqual(meanAbsDiff(a, b), 0, 'same seed');
  assert(meanAbsDiff(a, c) > 0, 'different seeds must give different art');
});

test('synth: art uses at most the given number of colors and is opaque', () => {
  const art = makeSyntheticArt({ width: 40, height: 30, colors: 6, seed: 3 });
  const count = colorSet(art).size;
  assert(count >= 2 && count <= 6, `colors: ${count}`);
  for (let i = 3; i < art.data.length; i += 4) assertEqual(art.data[i], 255, 'alpha');
});

test('synth: integer cell without offset gives size art × cell', () => {
  const art = makeSyntheticArt({ width: 20, height: 15, seed: 1 });
  const out = renderPseudoPixelArt(art, { cellW: 3 });
  assertEqual([out.width, out.height], [60, 45]);
});

test('synth: fractional cell and offset: each block center equals the art pixel', () => {
  const art = makeSyntheticArt({ width: 20, height: 15, seed: 2 });
  const p = { cellW: 3.4, cellH: 2.7, offsetX: 1.3, offsetY: 2.1 };
  const out = renderPseudoPixelArt(art, p);
  for (let ay = 0; ay < art.height; ay++) {
    for (let ax = 0; ax < art.width; ax++) {
      const x = Math.floor(p.offsetX + (ax + 0.5) * p.cellW);
      const y = Math.floor(p.offsetY + (ay + 0.5) * p.cellH);
      assertEqual(pixelHex(out, x, y), pixelHex(art, ax, ay), `art (${ax}, ${ay})`);
    }
  }
});

test('synth: boxBlur r=0 copies, keeps a flat image, blurs a dot', () => {
  const art = makeSyntheticArt({ width: 16, height: 12, seed: 4 });
  const copy = boxBlur(art, 0);
  assert(copy.data !== art.data, 'must be a copy');
  assertEqual(meanAbsDiff(copy, art), 0, 'r=0');

  const flat = new ImageData(new Uint8ClampedArray(8 * 8 * 4).fill(100), 8, 8);
  assertEqual(meanAbsDiff(boxBlur(flat, 2), flat), 0, 'flat');

  const dot = new ImageData(9, 9);
  dot.data[(4 * 9 + 4) * 4] = 255;
  const blurred = boxBlur(dot, 1);
  assertEqual(blurred.data[(4 * 9 + 4) * 4], Math.round(Math.round(255 / 3) / 3), 'center');
  assert(blurred.data[(3 * 9 + 3) * 4] > 0, 'neighbor pixel must get some brightness');
  assertEqual(blurred.data[(2 * 9 + 2) * 4], 0, 'unchanged beyond the radius');
});

test('synth: addNoise is bounded by amplitude and deterministic', () => {
  const art = makeSyntheticArt({ width: 16, height: 12, seed: 4 });
  assertEqual(meanAbsDiff(addNoise(art, 0, 1), art), 0, 'amplitude 0');
  const noisy = addNoise(art, 10, 1);
  assertEqual(meanAbsDiff(noisy, addNoise(art, 10, 1)), 0, 'same seed');
  for (let i = 0; i < art.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = art.data[i + c];
      const diff = Math.abs(noisy.data[i + c] - v);
      // Values clip at the range ends, so only the upper bound is checked
      assert(diff <= 10, `amplitude exceeded: ${diff}`);
    }
  }
  assert(meanAbsDiff(noisy, art) > 2, 'noise must be noticeable');
});

test('synth: jpegRecompress keeps size and stays close to the source', async () => {
  const art = makeSyntheticArt({ width: 40, height: 30, seed: 8 });
  const src = renderPseudoPixelArt(art, { cellW: 4 });
  const hi = await jpegRecompress(src, 0.95);
  const lo = await jpegRecompress(src, 0.3);
  assertEqual([hi.width, hi.height], [src.width, src.height], 'size');
  const dHi = meanAbsDiff(hi, src);
  const dLo = meanAbsDiff(lo, src);
  assert(dHi > 0 && dHi < 12, `distortion at q=0.95: ${dHi.toFixed(2)}`);
  assert(dLo > dHi, `q=0.3 must distort more: ${dLo.toFixed(2)} vs ${dHi.toFixed(2)}`);
});

/**
 * Share of result pixels whose nearest art-palette color matches the art color,
 * i.e. whether the right color survives palette quantization.
 * @param {ImageData} out
 * @param {ImageData} art
 */
function paletteAccuracy(out, art) {
  assertEqual([out.width, out.height], [art.width, art.height], 'sizes');
  const palette = [...colorSet(art)].map((c) => [c >> 16, (c >> 8) & 255, c & 255]);
  const nearest = (/** @type {Uint8ClampedArray} */ d, /** @type {number} */ i) => {
    let best = 0;
    let bestD = Infinity;
    palette.forEach((p, k) => {
      const dist = (d[i] - p[0]) ** 2 + (d[i + 1] - p[1]) ** 2 + (d[i + 2] - p[2]) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = k;
      }
    });
    return best;
  };
  let ok = 0;
  for (let i = 0; i < art.data.length; i += 4) if (nearest(out.data, i) === nearest(art.data, i)) ok++;
  return ok / (art.width * art.height);
}

// ---- CROP ----

test('rectFromPoints: point order, rounding outward, clipping to the image', () => {
  assertEqual(rectFromPoints({ x: 2.5, y: 3.2 }, { x: 6.1, y: 1.9 }, 100, 100), { x: 2, y: 1, w: 5, h: 3 });
  assertEqual(rectFromPoints({ x: -5, y: -5 }, { x: 500, y: 7 }, 100, 50), { x: 0, y: 0, w: 100, h: 7 });
  assertEqual(rectFromPoints({ x: 3, y: 3 }, { x: 3, y: 9 }, 100, 100), null, 'zero width');
  assertEqual(rectFromPoints({ x: 120, y: 3 }, { x: 150, y: 9 }, 100, 100), null, 'outside the image');
});

test('hitCropHandle: sides, corners, inside, outside', () => {
  const r = { x: 10, y: 20, w: 100, h: 50 };
  const t = 3;
  assertEqual(hitCropHandle(r, { x: 60, y: 40 }, t), 'move');
  assertEqual(hitCropHandle(r, { x: 60, y: 21 }, t), 'n');
  assertEqual(hitCropHandle(r, { x: 60, y: 72 }, t), 's', 'just outside the bottom side');
  assertEqual(hitCropHandle(r, { x: 8, y: 40 }, t), 'w');
  assertEqual(hitCropHandle(r, { x: 111, y: 40 }, t), 'e');
  assertEqual(hitCropHandle(r, { x: 9, y: 19 }, t), 'nw');
  assertEqual(hitCropHandle(r, { x: 112, y: 69 }, t), 'se');
  assertEqual(hitCropHandle(r, { x: 60, y: 10 }, t), null, 'above the frame');
  assertEqual(hitCropHandle(r, { x: 200, y: 40 }, t), null, 'right of the frame');
  // Narrow frame: both sides within tolerance, the nearer one wins
  assertEqual(hitCropHandle({ x: 10, y: 10, w: 2, h: 50 }, { x: 11.8, y: 30 }, t), 'e');
});

test('adjustRect: move and resize with limits', () => {
  const r = { x: 10, y: 20, w: 100, h: 50 };
  assertEqual(adjustRect(r, 'move', 5.4, -3.6, 200, 100), { x: 15, y: 16, w: 100, h: 50 }, 'move with rounding');
  assertEqual(adjustRect(r, 'move', 500, -500, 200, 100), { x: 100, y: 0, w: 100, h: 50 }, 'stops at edges');
  assertEqual(adjustRect(r, 'e', 20, 99, 200, 100), { x: 10, y: 20, w: 120, h: 50 }, 'right side');
  assertEqual(adjustRect(r, 'nw', -5, 10, 200, 100), { x: 5, y: 30, w: 105, h: 40 }, 'top-left corner');
  assertEqual(adjustRect(r, 'w', 300, 0, 200, 100), { x: 109, y: 20, w: 1, h: 50 }, 'at least 1 px');
  assertEqual(adjustRect(r, 's', 0, 500, 200, 100), { x: 10, y: 20, w: 100, h: 80 }, 'up to the image edge');
});

test('rectFromAnchorKeepRatio: ratio by the larger side, stops at edges', () => {
  const a = { x: 10, y: 10 };
  assertEqual(rectFromAnchorKeepRatio(a, { x: 50, y: 20 }, 2, 200, 100), { x: 10, y: 10, w: 40, h: 20 }, 'exactly 2:1');
  assertEqual(rectFromAnchorKeepRatio(a, { x: 30, y: 60 }, 2, 200, 100), { x: 10, y: 10, w: 100, h: 50 }, 'height leads');
  assertEqual(rectFromAnchorKeepRatio(a, { x: 0, y: 0 }, 1, 200, 100), { x: 0, y: 0, w: 10, h: 10 }, 'up-left');
  assertEqual(rectFromAnchorKeepRatio(a, { x: 300, y: 12 }, 1, 200, 100), { x: 10, y: 10, w: 90, h: 90 }, 'stops at bottom');
  assertEqual(rectFromAnchorKeepRatio(a, a, 1, 200, 100), { x: 10, y: 10, w: 1, h: 1 }, 'at least 1 px');
});

test('adjustRectKeepRatio: corners from the opposite corner, sides from the center', () => {
  const r = { x: 20, y: 20, w: 40, h: 20 };
  assertEqual(adjustRectKeepRatio(r, 'move', 5, 5, 200, 100, 2), { x: 25, y: 25, w: 40, h: 20 }, 'move as without lock');
  assertEqual(adjustRectKeepRatio(r, 'se', 20, 0, 200, 100, 2), { x: 20, y: 20, w: 60, h: 30 }, 'bottom-right corner');
  assertEqual(adjustRectKeepRatio(r, 'nw', -20, 0, 200, 100, 2), { x: 0, y: 10, w: 60, h: 30 }, 'top-left corner');
  assertEqual(adjustRectKeepRatio(r, 'e', 40, 0, 200, 100, 2), { x: 20, y: 10, w: 80, h: 40 }, 'right side, height from center');
  assertEqual(adjustRectKeepRatio(r, 's', 0, 10, 200, 100, 2), { x: 10, y: 20, w: 60, h: 30 }, 'bottom side, width from center');
  assertEqual(adjustRectKeepRatio(r, 'e', 500, 0, 200, 100, 2), { x: 20, y: 0, w: 180, h: 90 }, 'side stops at the image');
  assertEqual(adjustRectKeepRatio(r, 'n', 0, -500, 200, 100, 2), { x: 0, y: 0, w: 80, h: 40 }, 'width from center pushed to the edge');
});

test('formatAspectRatio: reduction and decimal form', () => {
  assertEqual(formatAspectRatio(1920, 1080), '16:9');
  assertEqual(formatAspectRatio(64, 64), '1:1');
  assertEqual(formatAspectRatio(517, 311), '1.66:1');
  assertEqual(formatAspectRatio(311, 517), '1:1.66');
});

test('elbowPoint: bend in the error curve', () => {
  // Sharp drop down to 8 colors, then nearly flat: elbow at 8
  const curve = [
    { k: 2, error: 20 }, { k: 4, error: 12 }, { k: 8, error: 5 },
    { k: 16, error: 4.2 }, { k: 32, error: 3.6 }, { k: 64, error: 3.1 },
  ];
  assertEqual(elbowPoint(curve), 8);

  const straight = [{ k: 2, error: 6 }, { k: 4, error: 5 }, { k: 8, error: 4 }, { k: 16, error: 3 }];
  assertEqual(elbowPoint(straight), 4, 'curve straight in log scale: no bend, first point taken');

  assertEqual(elbowPoint([]), 0, 'empty curve');
  assertEqual(elbowPoint([{ k: 7, error: 1 }]), 7, 'single point');
  assertEqual(elbowPoint([{ k: 4, error: 1 }, { k: 8, error: 1 }, { k: 16, error: 1 }]), 4, 'error does not drop');
});

test('paletteError: drops as the palette grows and is zero on an exact one', () => {
  const image = new ImageData(2, 2);
  image.data.set([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  assertClose(paletteError(image, [[255, 0, 0], [0, 0, 255]]), 0, 0.01, 'both colors in the palette');
  assert(paletteError(image, [[255, 0, 0]]) > 10, 'blue is far from the only red');
  assertEqual(paletteError(image, []), 0, 'empty palette');

  const empty = new ImageData(2, 2);
  assertEqual(paletteError(empty, [[1, 2, 3]]), 0, 'no opaque pixels');
});

test('autoPaletteSize: on a four-color image asks for no more', async () => {
  const image = new ImageData(4, 4);
  const colors = [[220, 30, 40], [30, 200, 60], [40, 60, 210], [240, 230, 20]];
  for (let i = 0; i < 16; i++) {
    const c = colors[i % 4];
    image.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  const { count, curve } = autoPaletteSize(image);
  assert(count >= 2 && count <= 4, `elbow within the image color count, got ${count}`);
  assert(curve[curve.length - 1].k <= 6, 'search stops when the palette is shorter than requested');
  assertClose(curve[curve.length - 1].error, 0, 0.01, 'no error with all colors');
});

test('roundColumnFit: cell snaps to a round column count', () => {
  const counts = CONFIG.ROUND_COLUMN_COUNTS;
  const tolerance = CONFIG.ROUND_COLUMN_TOLERANCE;
  // Typical manual input: 2.93 rounded instead of 1408 / 480
  const fit = roundColumnFit(1408, 2.93, counts, tolerance);
  assertEqual(fit?.count, 480, 'correct cell for sample images is 1408 / 480');
  assertClose(fit?.cell ?? 0, 1408 / 480, 1e-9);

  assertEqual(roundColumnFit(1408, 1408 / 480, counts, tolerance), null, 'already exact');
  assertEqual(
    roundColumnFit(1408, 2.9333, counts, tolerance), null,
    'difference smaller than the field shows: nothing to suggest',
  );
  assertEqual(roundColumnFit(1408, 35.47, counts, tolerance), null, 'junk period is close to nothing');
  assertEqual(roundColumnFit(1408, 0, counts, tolerance), null, 'zero cell');
  assertEqual(
    roundColumnFit(1408, 2.8, counts, tolerance)?.count, 512,
    'closer to 1408 / 512 = 2.75 than to 1408 / 480',
  );
  assertEqual(roundColumnFit(1408, 2.86, counts, tolerance), null, 'between candidates: difference above tolerance');
});

test('formatMs: milliseconds below a second, seconds above', () => {
  assertEqual(formatMs(0), '0.0 ms');
  assertEqual(formatMs(12.34), '12.3 ms');
  assertEqual(formatMs(999.9), '999.9 ms');
  assertEqual(formatMs(1000), '1.00 s');
  assertEqual(formatMs(4321), '4.32 s');
});

test('stageTimings: recomputed steps, slowest first', () => {
  const timings = { crop: 1, downscale: 40, palette: 12 };
  assertEqual(
    stageTimings(['crop', 'downscale', 'palette'], timings),
    [{ name: 'downscale', ms: 40 }, { name: 'palette', ms: 12 }, { name: 'crop', ms: 1 }],
  );
  assertEqual(stageTimings([], timings), [], 'all from cache');
  assertEqual(stageTimings(['unknown'], timings), [{ name: 'unknown', ms: 0 }], 'step without a timing');
});

test('savedParams: image-bound settings are not saved', () => {
  const saved = savedParams({ ...CONFIG.DEFAULT_PARAMS, crop: { x: 1, y: 2, w: 3, h: 4 }, offsetX: 5 });
  assert(!('crop' in saved) && !('offsetX' in saved) && !('bgPoints' in saved), 'crop and grid removed');
  assert(saved.cellW === 1 && saved.paletteMode === 'none', 'the rest is kept');
});

test('sanitizeParams: unknown keys and wrong types are dropped', () => {
  assertEqual(sanitizeParams({ brightness: 10 }), { brightness: 10 });
  assertEqual(sanitizeParams({ brightness: 'lots' }), {}, 'string instead of number');
  assertEqual(sanitizeParams({ brightness: NaN }), {}, 'NaN is not a number');
  assertEqual(sanitizeParams({ isTrimmed: 1 }), {}, 'number instead of flag');
  assertEqual(sanitizeParams({ foreign: 1 }), {}, 'unknown key');
  assertEqual(sanitizeParams({ crop: { x: 0, y: 0, w: 1, h: 1 } }), {}, 'crop is not restored');
  assertEqual(sanitizeParams({ customPalette: [[1, 2, 3]] }), { customPalette: [[1, 2, 3]] }, 'custom palette');
  assertEqual(sanitizeParams(null), {});
  assertEqual(sanitizeParams([1, 2]), {});
});

test('upsertPreset and removePreset: replace by name and list order', () => {
  const list = [{ name: 'a', params: { brightness: 1 } }, { name: 'b', params: {} }];
  assertEqual(upsertPreset(list, 'c', {}).map((i) => i.name), ['a', 'b', 'c']);
  const replaced = upsertPreset(list, 'a', { brightness: 9 });
  assertEqual(replaced.map((i) => i.name), ['a', 'b'], 'order is kept');
  assertEqual(replaced[0].params, { brightness: 9 });
  assertEqual(list[0].params, { brightness: 1 }, 'source list is unchanged');
  assertEqual(removePreset(list, 'a').map((i) => i.name), ['b']);
});

test('comparePlacement: without trim the source covers the whole result', () => {
  assertEqual(comparePlacement({ width: 64, height: 48 }, null, 4), { x: 0, y: 0, w: 64, h: 48 });
});

test('comparePlacement: trim shifts the source by bounds minus padding', () => {
  assertEqual(
    comparePlacement({ width: 64, height: 48 }, { x: 10, y: 6 }, 2),
    { x: -8, y: -4, w: 64, h: 48 },
    'content started at (10, 6), in the result it is at (2, 2)',
  );
  assertEqual(
    comparePlacement({ width: 64, height: 48 }, { x: 1, y: 1 }, 3),
    { x: 2, y: 2, w: 64, h: 48 },
    'padding larger than margins: source shifts right',
  );
});

test('splitInset: clipping the compare layer by the slider', () => {
  assertClose(splitInset(100, 0, 2, 100), 50, 1e-9, 'slider in the middle of the layer');
  assertClose(splitInset(100, 20, 4, 100), 80, 1e-9, 'layer shifted and zoomed');
  assertClose(splitInset(-50, 0, 2, 100), 100, 1e-9, 'slider left of the layer: layer fully hidden');
  assertClose(splitInset(9999, 0, 2, 100), 0, 1e-9, 'slider right of the layer: layer fully visible');
  assertClose(splitInset(100, 0, 0, 100), 0, 1e-9, 'zero scale gives no NaN');
});

test('isSameRect: compares rectangles on all sides', () => {
  assert(isSameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 }));
  assert(!isSameRect({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 }));
});

test('cropToolbarPosition: above the right corner, inside the frame at the top edge, within the viewer', () => {
  const toolbar = { w: 60, h: 30 };
  const viewport = { w: 500, h: 400 };
  assertEqual(cropToolbarPosition({ x: 100, y: 100, w: 200, h: 100 }, toolbar, viewport, 10), { x: 240, y: 60 });
  assertEqual(cropToolbarPosition({ x: 100, y: 20, w: 200, h: 100 }, toolbar, viewport, 10), { x: 240, y: 30 }, 'no room above');
  assertEqual(cropToolbarPosition({ x: -300, y: -50, w: 1000, h: 800 }, toolbar, viewport, 10), { x: 430, y: 10 }, 'frame larger than the viewer');
});

test('normalizeCrop', () => {
  assertEqual(normalizeCrop(null, 10, 10), null);
  assertEqual(normalizeCrop({ x: 2, y: 3, w: 4, h: 5 }, 10, 10), { x: 2, y: 3, w: 4, h: 5 });
  assertEqual(normalizeCrop({ x: 8, y: -2, w: 5, h: 5 }, 10, 10), { x: 8, y: 0, w: 2, h: 5 });
  assertEqual(normalizeCrop({ x: 10, y: 0, w: 5, h: 5 }, 10, 10), null);
});

test('cropImage: cuts the right pixels, returns the source without an area', () => {
  const art = makeSyntheticArt({ width: 20, height: 15, seed: 31 });
  assert(cropImage(art, null) === art, 'same object without an area');
  const out = cropImage(art, { x: 3, y: 4, w: 7, h: 5 });
  assertEqual([out.width, out.height], [7, 5]);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 7; x++) assertEqual(pixelHex(out, x, y), pixelHex(art, x + 3, y + 4), `(${x}, ${y})`);
  }
});

test('pipeline: crop, then grid relative to the crop origin', () => {
  const art = makeSyntheticArt({ width: 30, height: 20, colors: 10, seed: 32 });
  const grid = { cellW: 3.4, cellH: 3.4, offsetX: 1.3, offsetY: 0.6 };
  const pseudo = renderPseudoPixelArt(art, grid);
  // Put the pseudo art in a 17×9 px border, the crop cuts it back out
  const framed = new ImageData(pseudo.width + 34, pseudo.height + 18);
  for (let y = 0; y < pseudo.height; y++) {
    framed.data.set(pseudo.data.subarray(y * pseudo.width * 4, (y + 1) * pseudo.width * 4), ((y + 9) * framed.width + 17) * 4);
  }
  /** @type {Params} */
  const params = {
    ...CONFIG.DEFAULT_PARAMS,
    ...grid,
    crop: { x: 17, y: 9, w: pseudo.width, h: pseudo.height },
    sampleMode: 'median',
    sampleMargin: 0.25,
  };
  const { image } = runPipeline(framed, params, createPipelineCache());
  assertEqual(meanAbsDiff(image, art), 0);
});

// ---- BACKGROUND ----

/**
 * Image from character rows: each character maps to a color in legend.
 * @param {string[]} rows
 * @param {Record<string, number[]>} legend colors [r, g, b] or [r, g, b, a]
 */
function imageFromRows(rows, legend) {
  const w = rows[0].length;
  const img = new ImageData(w, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const [r, g, b, a = 255] = legend[ch];
    img.data.set([r, g, b, a], (y * w + x) * 4);
  }));
  return img;
}

/**
 * Alpha as rows: '.' transparent, '#' opaque.
 * @param {ImageData} img
 */
function alphaRows(img) {
  const rows = [];
  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) row += img.data[(y * img.width + x) * 4 + 3] ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

/** w white background, n near-white (background noise), k black outline, r object color */
const BG_LEGEND = { w: [255, 255, 255], n: [250, 252, 248], k: [0, 0, 0], r: [200, 40, 40] };

test('rgbToLab: reference sRGB D65 values', () => {
  const out = [0, 0, 0];
  /** @type {[number[], number[]][]} rgb and Lab from reference calculators (brucelindbloom.com) */
  const cases = [
    [[255, 255, 255], [100, 0, 0]],
    [[0, 0, 0], [0, 0, 0]],
    [[255, 0, 0], [53.241, 80.092, 67.203]],
    [[0, 255, 0], [87.735, -86.183, 83.179]],
    [[0, 0, 255], [32.297, 79.188, -107.86]],
    [[128, 128, 128], [53.585, 0, 0]],
  ];
  for (const [rgb, expected] of cases) {
    rgbToLab(rgb[0], rgb[1], rgb[2], out, 0);
    for (let c = 0; c < 3; c++) assertClose(out[c], expected[c], 0.05, `${rgb} channel ${c}`);
  }
});

test('labF: table matches the exact function', () => {
  let maxErr = 0;
  for (let k = 0; k <= 100000; k++) {
    const t = k / 100000;
    maxErr = Math.max(maxErr, Math.abs(labF(t) - labFExact(t)));
  }
  assert(maxErr * 116 < 0.001, `L error ${maxErr * 116}`);
  assertClose(labF(1.5), labFExact(1.5), 1e-12, 'outside the table');
  assertClose(labF(1.00001), labFExact(1.00001), 1e-6, 'white with rounding error');
});

test('imageToLab and labDistanceSq: ΔE black-white 100, identical 0', () => {
  const lab = imageToLab(imageFromRows(['wk'], BG_LEGEND));
  assertEqual(lab.length, 6);
  assertClose(Math.sqrt(labDistanceSq(lab, 0, lab[3], lab[4], lab[5])), 100, 1e-3);
  assertEqual(labDistanceSq(lab, 3, lab[3], lab[4], lab[5]), 0);
});

test('Lab: equal RGB steps differ in visibility, ΔE accounts for it', () => {
  // A step of 20 in blue is less visible than the same step in green
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const dE = (/** @type {number[]} */ c1, /** @type {number[]} */ c2) => {
    rgbToLab(c1[0], c1[1], c1[2], a, 0);
    rgbToLab(c2[0], c2[1], c2[2], b, 0);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  assert(dE([128, 128, 128], [128, 148, 128]) > dE([128, 128, 128], [128, 128, 148]), 'green is more visible than blue');
});

test('cornerKeyColor: corner median is robust to one corner with the object', () => {
  const img = imageFromRows(['kww', 'wrw', 'www'], BG_LEGEND);
  assertEqual(cornerKeyColor(img), [255, 255, 255]);
});

test('chromaKey: removes close colors everywhere, including a highlight inside the object', () => {
  const img = imageFromRows(['nwwww', 'wkkkw', 'wkwkw', 'wkkkw', 'wwwwn'], BG_LEGEND);
  const out = chromaKey(img, { key: [255, 255, 255], tolerance: 5 });
  assertEqual(alphaRows(out), ['.....', '.###.', '.#.#.', '.###.', '.....']);
  assertEqual(Array.from(out.data.subarray(0, 3)), [250, 252, 248], 'RGB is kept');
  assertEqual(img.data[3], 255, 'input unchanged');
});

test('floodFillBackground: highlight inside a closed outline is kept', () => {
  const img = imageFromRows(['nwwww', 'wkkkw', 'wkwkw', 'wkkkw', 'wwwwn'], BG_LEGEND);
  const out = floodFillBackground(img, { seeds: cornerPoints(5, 5), tolerance: 5 });
  assertEqual(alphaRows(out), ['.....', '.###.', '.###.', '.###.', '.....']);
});

test('floodFillBackground: compares with the seed color, not the neighbor (gradient does not leak)', () => {
  const w = 20;
  const img = new ImageData(w, 1);
  for (let x = 0; x < w; x++) img.data.set([255 - x * 10, 255 - x * 10, 255 - x * 10, 255], x * 4);
  const out = floodFillBackground(img, { seeds: [{ x: 0, y: 0 }], tolerance: 5 });
  const firstKept = alphaRows(out)[0].indexOf('#');
  assert(firstKept > 0 && firstKept < 6, `fill must stop early, stopped at ${firstKept}`);
});

test('floodFillBackground: own color per seed, transparent pixels passable, seeds outside the image', () => {
  const img = imageFromRows(['wwktrr', 'wwktrr'], { ...BG_LEGEND, t: [0, 0, 0, 0] });
  const out = floodFillBackground(img, {
    seeds: [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 99, y: 0 }, { x: -1, y: 0 }],
    tolerance: 5,
  });
  assertEqual(alphaRows(out), ['..#...', '..#...']);
});

test('sampleColorAt: window median suppresses a single outlier, edges and points outside the image', () => {
  const img = imageFromRows(['www', 'wkw', 'wwr'], BG_LEGEND);
  assertEqual(sampleColorAt(img, 1.7, 1.2, 1), [255, 255, 255], 'black center in a 3×3 window');
  assertEqual(sampleColorAt(img, 1, 1, 0), [0, 0, 0], 'radius 0 takes the pixel itself');
  assertEqual(sampleColorAt(img, 2, 2, 1), [200, 40, 40], 'corner: 2×2 window, lower median');
  assertEqual(sampleColorAt(img, -0.5, 0, 1), null);
  assertEqual(sampleColorAt(img, 3, 0, 1), null);
});

test('togglePoint: adds in whole pixels, removes the nearest within radius', () => {
  const a = togglePoint([], { x: 4.7, y: 2.2 }, 1);
  assertEqual(a, [{ x: 4, y: 2 }]);
  const b = togglePoint(a, { x: 10.5, y: 2.5 }, 1);
  assertEqual(b, [{ x: 4, y: 2 }, { x: 10, y: 2 }], 'far: adds');
  assertEqual(togglePoint(b, { x: 11.2, y: 2.9 }, 1), [{ x: 4, y: 2 }], 'near: removes');
  assertEqual(b.length, 2, 'input unchanged');
});

test('backgroundSeeds: crop corners and points shifted to the crop origin', () => {
  const points = [{ x: 15, y: 25 }];
  assertEqual(backgroundSeeds(4, 3, { points, isCornersUsed: false, origin: { x: 10, y: 20 } }), [{ x: 5, y: 5 }]);
  const all = backgroundSeeds(4, 3, { points, isCornersUsed: true, origin: { x: 0, y: 0 } });
  assertEqual(all, [...cornerPoints(4, 3), { x: 15, y: 25 }]);
});

test('removeBackground: given key and points instead of corners', () => {
  const img = imageFromRows(['kkk', 'kwk', 'kkk'], BG_LEGEND);
  assertEqual(alphaRows(removeBackground(img, { mode: 'chroma', tolerance: 5, keyColor: [255, 255, 255] })),
    ['###', '#.#', '###'], 'white key with black corners');
  assertEqual(alphaRows(removeBackground(img, { mode: 'flood', tolerance: 5, seeds: [{ x: 1, y: 1 }] })),
    ['###', '#.#', '###'], 'fill from the center');
  assertEqual(alphaRows(removeBackground(img, { mode: 'flood', tolerance: 5, seeds: [] })),
    ['###', '###', '###'], 'nothing removed without points');
});

test('pipeline: fill points in source coordinates work with a crop', () => {
  // Closed white window inside a black frame: unreachable from corners, only by a point
  const src = imageFromRows(['rrrrrr', 'rkkkkr', 'rkwwkr', 'rkkkkr', 'rrrrrr'], BG_LEGEND);
  const params = {
    ...CONFIG.DEFAULT_PARAMS,
    crop: { x: 1, y: 1, w: 4, h: 3 },
    bgMode: 'flood',
    isBgCornersUsed: false,
    bgPoints: [{ x: 3, y: 2 }],
  };
  const { image } = runPipeline(src, params, createPipelineCache());
  assertEqual(alphaRows(image), ['####', '#..#', '####']);
});

/** Shadow test colors: d gray shadow, D darker shadow, c colored detail as bright as the shadow */
const SHADOW_LEGEND = { ...BG_LEGEND, t: [255, 255, 255, 0], d: [205, 205, 205], D: [150, 150, 150], c: [230, 170, 150] };

test('removeShadows: gray shadow on the background goes, the object and a shadow inside it stay', () => {
  // Character k with shadow d below it; a same-gray pixel inside the object (a fold)
  const img = imageFromRows([
    'ttttt',
    'tkkkt',
    'tkdkt',
    'tkkkt',
    'tdddt',
    'ttttt',
  ], SHADOW_LEGEND);
  const out = removeShadows(img, { tolerance: 20, maxChroma: 10 });
  assertEqual(alphaRows(out), ['.....', '.###.', '.###.', '.###.', '.....', '.....']);
  assertEqual(img.data[(4 * 5 + 1) * 4 + 3], 255, 'input unchanged');
  assert(removeShadows(img, { tolerance: 0, maxChroma: 10 }) === img, '0 returns the source');
});

test('removeShadows: colored and too dark pixels are not shadows', () => {
  const img = imageFromRows(['ttttt', 'tcDdt', 'ttttt'], SHADOW_LEGEND);
  // ΔL to the white background: d ~ 17, D ~ 38, c as bright as d but saturated
  assertEqual(alphaRows(removeShadows(img, { tolerance: 20, maxChroma: 10 })), ['.....', '.##..', '.....'], 'only d goes');
  assertEqual(alphaRows(removeShadows(img, { tolerance: 45, maxChroma: 10 })), ['.....', '.#...', '.....'], 'larger tolerance removes D too');
});

test('pipeline: shadows as a separate step before Defringe', () => {
  const src = imageFromRows(['wwwww', 'wkkkw', 'wwdww', 'wwwww'], SHADOW_LEGEND);
  const cache = createPipelineCache();
  const params = { ...CONFIG.DEFAULT_PARAMS, bgMode: 'flood' };
  assertEqual(alphaRows(runPipeline(src, params, cache).image), ['.....', '.###.', '..#..', '.....'], 'shadow shows as part of the object');
  const next = runPipeline(src, { ...params, bgShadow: 20 }, cache);
  assertEqual(next.recomputed, ['shadows', 'defringe', 'sharpen', 'downscale', 'adjust', 'palette', 'cleanup', 'trim', 'outline']);
  assertEqual(alphaRows(next.image), ['.....', '.###.', '.....', '.....']);
});

/** Defringe test colors: h light halo, g halo close to the object */
const FRINGE_LEGEND = { ...BG_LEGEND, t: [255, 255, 255, 0], h: [225, 225, 225], g: [60, 60, 60], s: [230, 190, 160] };

test('defringe: removes a light halo ring, the object and its light details stay', () => {
  const img = imageFromRows([
    'ttttttt',
    'thhhhht',
    'thkkkht',
    'thkwkht',
    'thkkkht',
    'thhhhht',
    'ttttttt',
  ], FRINGE_LEGEND);
  const out = defringe(img, { tolerance: 15, passes: 2 });
  assertEqual(alphaRows(out), ['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......']);
  assertEqual(img.data[8 * 4 + 3], 255, 'input unchanged');
});

test('defringe: keeps edges beyond tolerance or closer to the object, off at 0', () => {
  const img = imageFromRows(['ttttt', 'tgggt', 'tgkgt', 'tgggt', 'ttttt'], FRINGE_LEGEND);
  assertEqual(alphaRows(defringe(img, { tolerance: 15, passes: 2 })), ['.....', '.###.', '.###.', '.###.', '.....'], 'far from the background');
  assert(defringe(img, { tolerance: 0, passes: 2 }) === img, '0 returns the source');
  // Edge within tolerance but the same color as the object: light skin (s) on white
  const skin = imageFromRows(['ttttt', 'tssst', 'tswst', 'tssst', 'ttttt'], FRINGE_LEGEND);
  assertEqual(alphaRows(defringe(skin, { tolerance: 40, passes: 1 })), ['.....', '.###.', '.###.', '.###.', '.....'],
    'flat light object edge stays');
});

test('pipeline: Defringe as a separate step, does not recompute background removal', () => {
  const src = imageFromRows(['wwwww', 'whhhw', 'whkhw', 'whhhw', 'wwwww'], FRINGE_LEGEND);
  const cache = createPipelineCache();
  const params = { ...CONFIG.DEFAULT_PARAMS, bgMode: 'flood' };
  assertEqual(alphaRows(runPipeline(src, params, cache).image), ['.....', '.###.', '.###.', '.###.', '.....']);
  const next = runPipeline(src, { ...params, bgDefringe: 15 }, cache);
  assertEqual(next.recomputed, ['defringe', 'sharpen', 'downscale', 'adjust', 'palette', 'cleanup', 'trim', 'outline']);
  assertEqual(alphaRows(next.image), ['.....', '.....', '..#..', '.....', '.....']);
});

/**
 * Checkerboard: light (l) and dark (d) cell×cell squares, side squares per side.
 * @param {number} side
 * @param {number} cell
 * @returns {string[]}
 */
function checkerRows(side, cell) {
  const rows = [];
  for (let y = 0; y < side * cell; y++) {
    let row = '';
    for (let x = 0; x < side * cell; x++) row += (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 'd' : 'l';
    rows.push(row);
  }
  return rows;
}

/**
 * Replaces a rectangle in rows with other rows.
 * @param {string[]} rows
 * @param {string[]} patch
 * @param {number} x0
 * @param {number} y0
 */
function pasteRows(rows, patch, x0, y0) {
  return rows.map((row, y) => {
    const src = patch[y - y0];
    if (src === undefined) return row;
    return row.slice(0, x0) + src + row.slice(x0 + src.length);
  });
}

/** l and d checker squares, m their blend at the seam, k outline, r object */
const CHECKER_LEGEND = { l: [205, 205, 205], d: [144, 144, 144], m: [175, 175, 175], k: [0, 0, 0], r: [200, 40, 40] };

/** 6×6 sprite: outline, object inside and a background-colored (d) square */
const CHECKER_SPRITE = ['kkkkkk', 'krrrrk', 'krddrk', 'krddrk', 'krrrrk', 'kkkkkk'];

test('flatMask: pixels near an edge are not flat within the window radius', () => {
  const img = imageFromRows(['wwwwwww', 'wwwwwww', 'wwwwwww', 'wwwkwww', 'wwwwwww', 'wwwwwww', 'wwwwwww'], BG_LEGEND);
  const flat = flatMask(imageToLab(img), 7, 7, { flatRadius: 1, flatTolerance: 4 });
  const rows = [];
  for (let y = 0; y < 7; y++) rows.push([...flat.subarray(y * 7, y * 7 + 7)].map((v) => (v ? '.' : 'x')).join(''));
  // The difference shows at the dot and its 4 neighbors, the 3×3 window widens it by 1 px
  assertEqual(rows, ['.......', '..xxx..', '.xxxxx.', '.xxxxx.', '.xxxxx.', '..xxx..', '.......']);
});

test('detectBackgroundColors: two checker colors, the sprite is not included', () => {
  const rows = pasteRows(checkerRows(6, 8), CHECKER_SPRITE, 20, 20);
  const colors = detectBackgroundColors(imageFromRows(rows, CHECKER_LEGEND), patternOptions());
  // Order depends on how many flat pixels the sprite took from each square
  assertEqual(colors.map((c) => c[0]).sort((a, b) => a - b), [144, 205]);
});

test('detectBackgroundColors: empty without flat areas, a small color is filtered out', () => {
  // Every pixel differs from its neighbor: no flat windows
  const noisy = imageFromRows(checkerRows(12, 1), CHECKER_LEGEND);
  assertEqual(detectBackgroundColors(noisy, patternOptions()), []);
  // A 6×6 red square on a 48×48 field is 1.6%, below BG_PATTERN_MIN_SHARE
  const rows = pasteRows(checkerRows(1, 48), Array(6).fill('rrrrrr'), 10, 10);
  assertEqual(detectBackgroundColors(imageFromRows(rows, CHECKER_LEGEND), patternOptions()), [[205, 205, 205]]);
});

test('labSegmentDistanceSq: to the segment, not to the line', () => {
  const keys = new Float32Array([0, 0, 0, 10, 0, 0]);
  const at = (/** @type {number[]} */ p) => labSegmentDistanceSq(new Float32Array(p), 0, keys, 0, 3);
  assertClose(at([5, 3, 0]), 9, 1e-6, 'projection inside');
  assertClose(at([14, 3, 0]), 25, 1e-6, 'past end B');
  assertClose(at([-2, 0, 0]), 4, 1e-6, 'past end A');
  assertClose(labSegmentDistanceSq(new Float32Array([1, 1, 1]), 0, new Float32Array([0, 0, 0, 0, 0, 0]), 0, 3), 3, 1e-6, 'degenerate');
});

test('floodFillPattern: the whole checkerboard with seam blends, square inside the outline intact', () => {
  // Blend column at a square seam, as in JPEG
  const rows = pasteRows(checkerRows(4, 6), CHECKER_SPRITE, 9, 9).map((row) => `${row.slice(0, 5)}m${row.slice(6)}`);
  const img = imageFromRows(rows, CHECKER_LEGEND);
  const colors = /** @type {RGB[]} */ ([[205, 205, 205], [144, 144, 144]]);
  const out = floodFillPattern(img, { seeds: cornerPoints(24, 24), colors, tolerance: 5 });
  const alpha = alphaRows(out);
  const opaque = alpha.join('').split('').filter((c) => c === '#').length;
  assertEqual(opaque, 36, 'only the sprite is left');
  assertEqual(alpha[11].slice(9, 15), '######', 'background-colored square inside the outline untouched');
  // Single-color flood fill does not get past the corner squares
  const old = floodFillBackground(img, { seeds: cornerPoints(24, 24), tolerance: 5 });
  assert(alphaRows(old).join('').split('').filter((c) => c === '#').length > 300, 'floodFillBackground cannot handle it');
});

test('floodFillPattern: seed color counts as background, not joined by a segment', () => {
  const rows = ['lllrrr', 'lllrrr', 'lllmmm'];
  const img = imageFromRows(rows, { ...CHECKER_LEGEND, r: [120, 40, 40] });
  const colors = /** @type {RGB[]} */ ([[205, 205, 205], [144, 144, 144]]);
  const plain = floodFillPattern(img, { seeds: [{ x: 0, y: 0 }], colors, tolerance: 5 });
  assertEqual(alphaRows(plain), ['...###', '...###', '......']);
  const withPoint = floodFillPattern(img, { seeds: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: -1, y: 99 }], colors, tolerance: 5 });
  assertEqual(alphaRows(withPoint), ['......', '......', '......']);
});

test('removeBackground: checker mode finds the checker colors itself', () => {
  const rows = pasteRows(checkerRows(6, 8), CHECKER_SPRITE, 20, 20);
  const out = removeBackground(imageFromRows(rows, CHECKER_LEGEND), { mode: 'checker', tolerance: 5 });
  assertEqual(alphaRows(out).join('').split('').filter((c) => c === '#').length, 36);
});

test('removeBackground: modes and an error on an unknown one', () => {
  const img = imageFromRows(['wkw', 'kwk', 'wkw'], BG_LEGEND);
  assert(removeBackground(img, { mode: 'none', tolerance: 5 }) === img, 'none returns the source');
  assertEqual(alphaRows(removeBackground(img, { mode: 'chroma', tolerance: 5 })), ['.#.', '#.#', '.#.']);
  assertEqual(alphaRows(removeBackground(img, { mode: 'flood', tolerance: 5 })), ['.#.', '###', '.#.']);
  let isThrown = false;
  try {
    removeBackground(img, { mode: /** @type {any} */ ('bogus'), tolerance: 5 });
  } catch {
    isThrown = true;
  }
  assert(isThrown, 'exception expected');
});

test('pipeline: background removed before downscale, transparent cells in the result', () => {
  const src = scaleNearest(imageFromRows(['www', 'wrw', 'www'], BG_LEGEND), 4);
  for (const bgMode of ['chroma', 'flood']) {
    const params = { ...CONFIG.DEFAULT_PARAMS, bgMode, cellW: 4, cellH: 4 };
    const { image } = runPipeline(src, params, createPipelineCache());
    assertEqual(alphaRows(image), ['...', '.#.', '...'], bgMode);
  }
});

// ---- DOWNSCALE ----

test('cellPixelRanges: pixel centers in the inner part of the cell', () => {
  assertEqual(Array.from(cellPixelRanges(0, 1, 3, 0.25, 3)), [0, 1, 1, 2, 2, 3], '1 px cell');
  assertEqual(Array.from(cellPixelRanges(0, 4, 2, 0.25, 8)), [1, 3, 5, 7], 'cell 4, margin 1 px');
  assertEqual(Array.from(cellPixelRanges(0, 4, 2, 0, 8)), [0, 4, 4, 8], 'no margin');
  // Cell 3.4 with offset 1.3: bounds 1.3, 4.7, 8.1; centers 1.5..4.5 and 5.5..7.5
  assertEqual(Array.from(cellPixelRanges(1.3, 3.4, 2, 0, 10)), [1, 5, 5, 8], 'fractional cell');
  assertEqual(Array.from(cellPixelRanges(0, 2, 2, 0.45, 4)), [1, 2, 3, 4], 'empty inner part: center pixel');
});

test('downscaleByGrid: 1 px cell leaves the image unchanged in every mode', () => {
  const art = makeSyntheticArt({ width: 13, height: 9, seed: 12 });
  for (const mode of CONFIG.MODE_VALUES.sample) {
    const out = downscaleByGrid(art, { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0 }, { mode, margin: 0.25 });
    assertEqual(meanAbsDiff(out, art), 0, mode);
  }
});

test('downscaleByGrid: exact pseudo pixel art is restored without errors', () => {
  const art = makeSyntheticArt({ width: 60, height: 40, colors: 12, seed: 21 });
  for (const cell of [3, 3.4, 5.7]) {
    const grid = { cellW: cell, cellH: cell, offsetX: 1.3, offsetY: 0.6 };
    const src = renderPseudoPixelArt(art, grid);
    for (const mode of CONFIG.MODE_VALUES.sample) {
      for (const margin of [0, 0.25]) {
        const out = downscaleByGrid(src, grid, { mode, margin });
        assertEqual(meanAbsDiff(out, art), 0, `cell ${cell}, ${mode}, margin ${margin}`);
      }
    }
  }
});

test('downscaleByGrid: JPEG q=0.8 restores palette colors', async () => {
  // Measured in Chrome (seed 21, 12 colors): cell 5.7 all modes 97-100%,
  // cell 3.4 median and cluster 96-97%. Thresholds leave room for other JPEG codecs.
  const art = makeSyntheticArt({ width: 60, height: 40, colors: 12, seed: 21 });
  const cases = [
    { cell: 5.7, modes: ['median', 'mode', 'dominant'], min: 0.95 },
    { cell: 3.4, modes: ['median', 'dominant'], min: 0.9 },
  ];
  for (const { cell, modes, min } of cases) {
    const grid = { cellW: cell, cellH: cell, offsetX: 1.3, offsetY: 0.6 };
    const src = await jpegRecompress(renderPseudoPixelArt(art, grid), 0.8);
    for (const mode of /** @type {SampleMode[]} */ (modes)) {
      const acc = paletteAccuracy(downscaleByGrid(src, grid, { mode, margin: 0.25 }), art);
      assert(acc >= min, `cell ${cell}, ${mode}: ${(acc * 100).toFixed(1)}% < ${min * 100}%`);
    }
  }
});

test('downscaleByGrid: modes on a color mix in the cell', () => {
  // 4×4 cell without margin: 10 red and 6 blue pixels
  const img = new ImageData(4, 4);
  for (let p = 0; p < 16; p++) img.data.set(p < 10 ? [220, 20, 20, 255] : [20, 20, 220, 255], p * 4);
  const grid = { cellW: 4, cellH: 4, offsetX: 0, offsetY: 0 };
  for (const mode of CONFIG.MODE_VALUES.sample) {
    const out = downscaleByGrid(img, grid, { mode, margin: 0 });
    assertEqual(pixelHex(out, 0, 0), '#dc1414', mode);
  }

  // With three colors in equal shares, the per-channel median gives a nonexistent black,
  // mode takes a real color, the first one met among the most frequent
  const mix = new ImageData(5, 1);
  [[255, 0, 0], [0, 255, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((c, p) => mix.data.set([...c, 255], p * 4));
  const mixGrid = { cellW: 5, cellH: 1, offsetX: 0, offsetY: 0 };
  assertEqual(pixelHex(downscaleByGrid(mix, mixGrid, { mode: 'median', margin: 0 }), 0, 0), '#000000', 'median');
  assertEqual(pixelHex(downscaleByGrid(mix, mixGrid, { mode: 'mode', margin: 0 }), 0, 0), '#ff0000', 'mode');
});

test('downscaleByGrid: mode averages the exact colors of its group', () => {
  const img = new ImageData(3, 1);
  [[100, 100, 100], [102, 101, 99], [250, 0, 0]].forEach((c, p) => img.data.set([...c, 255], p * 4));
  const out = downscaleByGrid(img, { cellW: 3, cellH: 1, offsetX: 0, offsetY: 0 }, { mode: 'mode', margin: 0 });
  assertEqual(Array.from(out.data), [101, 101, 100, 255]);
});

test('downscaleByGrid: transparency by the share of opaque pixels', () => {
  // Two 2×2 cells: the first has 1 opaque of 4 (transparent), the second 3 of 4
  const img = new ImageData(4, 2);
  img.data.set([200, 0, 0, 255], 0);
  for (const p of [2, 3, 6]) img.data.set([0, 200, 0, 255], p * 4);
  img.data.set([255, 255, 255, 10], 7 * 4); // near-transparent white must not affect the color
  const out = downscaleByGrid(img, { cellW: 2, cellH: 2, offsetX: 0, offsetY: 0 }, { mode: 'median', margin: 0 });
  assertEqual(out.data[3], 0, 'first cell is transparent');
  assertEqual(Array.from(out.data.subarray(4, 8)), [0, 200, 0, 255], 'second from opaque pixels');
});

test('downscaleByGrid: cell opacity threshold', () => {
  // Four 4×1 cells with 1, 2, 3 and 4 opaque pixels of 4
  const img = new ImageData(16, 1);
  for (let cell = 0; cell < 4; cell++) {
    for (let k = 0; k <= cell; k++) img.data.set([200, 0, 0, 255], (cell * 4 + k) * 4);
  }
  const grid = { cellW: 4, cellH: 1, offsetX: 0, offsetY: 0 };
  const alphas = (/** @type {number | undefined} */ opaqueFraction) => {
    const out = downscaleByGrid(img, grid, { mode: 'median', margin: 0, opaqueFraction });
    return [0, 1, 2, 3].map((c) => (out.data[c * 4 + 3] ? '#' : '.')).join('');
  };
  assertEqual(alphas(undefined), '..##', 'default 50%: strictly more than half');
  assertEqual(alphas(0), '####', '0: one pixel is enough');
  assertEqual(alphas(0.3), '.###');
  assertEqual(alphas(0.8), '...#');
  assertEqual(alphas(1), '...#', 'threshold capped by CELL_OPAQUE_FRACTION_MAX');
});

test('pipeline: opacity threshold recomputes only the downscale', () => {
  const src = scaleNearest(imageFromRows(['wr'], BG_LEGEND), 4);
  const cache = createPipelineCache();
  const params = { ...CONFIG.DEFAULT_PARAMS, bgMode: 'flood', cellW: 4, cellH: 4 };
  runPipeline(src, params, cache);
  const { recomputed } = runPipeline(src, { ...params, cellOpaqueFraction: 0.2 }, cache);
  assertEqual(recomputed, ['downscale', 'adjust', 'palette', 'cleanup', 'trim', 'outline']);
});

test('downscaleByGrid: result size equals gridSize', () => {
  const img = new ImageData(100, 50);
  const grid = { cellW: 3.3, cellH: 7, offsetX: 2, offsetY: 5 };
  const out = downscaleByGrid(img, grid, { mode: 'median', margin: 0.25 });
  // (100 - 2) / 3.3 = 29.7 and (50 - 5) / 7 = 6.4
  assertEqual([out.width, out.height], [29, 6]);
  assertEqual(gridSize(100, 50, grid), { cols: 29, rows: 6 });
});

test('medianOf: sorting and histogram give the same result', () => {
  const rng = createRng(99);
  const scratch = new Uint8Array(CONFIG.MEDIAN_SORT_MAX);
  const histogram = new Uint32Array(256);
  for (const n of [1, 2, 3, 31, 32, 33, 100]) {
    const values = new Uint8Array(n);
    for (let i = 0; i < n; i++) values[i] = Math.floor(rng() * 256);
    const sorted = Array.from(values).sort((a, b) => a - b);
    assertEqual(medianOf(values, n, scratch, histogram), sorted[(n - 1) >> 1], `n = ${n}`);
  }
});

// ---- UTIL ----

test('createRng: same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assertEqual(a(), b(), `step ${i}`);
});

test('createRng: different seeds give different sequences', () => {
  const a = createRng(1);
  const b = createRng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (a() === b()) same++;
  assert(same < 5, `matches: ${same}`);
});

test('createRng: values in [0, 1) and roughly uniform', () => {
  const rng = createRng(7);
  const n = 10000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = rng();
    assert(v >= 0 && v < 1, `value out of range: ${v}`);
    sum += v;
  }
  assertClose(sum / n, 0.5, 0.02, 'mean');
});

test('pickMode: a known value passes, a typo throws', () => {
  const modes = CONFIG.MODE_VALUES.outline;
  assertEqual(pickMode('dark', modes), 'dark');
  let failed = false;
  try {
    pickMode('darken', modes);
  } catch (e) {
    failed = true;
    assert(String(e).includes('darken'), `the message contains the value: ${e}`);
  }
  assert(failed, 'a typo in data-mode must throw, not be a silent no-op');
  // A missing attribute is the same case: markup without data-mode.
  let emptyFailed = false;
  try {
    pickMode(undefined, modes);
  } catch (e) {
    emptyFailed = true;
  }
  assert(emptyFailed, 'a missing attribute is an error too');
});

test('CONFIG.MODE_VALUES: lists match the buttons in the markup', () => {
  /** @type {[string, readonly string[]][]} shared type: mode lists differ, the check is the same */
  const groups = [
    ['bg-mode', CONFIG.MODE_VALUES.background],
    ['sample-mode', CONFIG.MODE_VALUES.sample],
    ['palette-mode', CONFIG.MODE_VALUES.palette],
    ['outline-mode', CONFIG.MODE_VALUES.outline],
    ['dither-mode', CONFIG.MODE_VALUES.dither],
  ];
  for (const [id, allowed] of groups) {
    const buttons = Array.from(document.querySelectorAll(`#${id} [data-mode]`));
    assert(buttons.length > 0, `markup has buttons for group ${id}`);
    for (const button of buttons) {
      const mode = /** @type {HTMLElement} */ (button).dataset.mode;
      assert(mode !== undefined && allowed.includes(mode), `${id}: value "${mode}" is in CONFIG.MODE_VALUES`);
    }
  }
});

test('clamp', () => {
  assertEqual(clamp(-1, 0, 10), 0);
  assertEqual(clamp(11, 0, 10), 10);
  assertEqual(clamp(5.5, 0, 10), 5.5);
});

test('scaleNearest: each pixel becomes a scale × scale block', () => {
  const art = makeSyntheticArt({ width: 7, height: 5, seed: 11 });
  for (const scale of [1, 2, 3, 16]) {
    const out = scaleNearest(art, scale);
    assertEqual([out.width, out.height], [7 * scale, 5 * scale], `size at ${scale}x`);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const si = (Math.floor(y / scale) * art.width + Math.floor(x / scale)) * 4;
        const di = (y * out.width + x) * 4;
        for (let c = 0; c < 4; c++) {
          if (out.data[di + c] !== art.data[si + c]) throw new Error(`${scale}x: pixel (${x}, ${y}) channel ${c}`);
        }
      }
    }
  }
  assert(scaleNearest(art, 1).data !== art.data, '1x must return a copy');
});

test('scaleNearest: keeps transparency', () => {
  const img = new ImageData(new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 128]), 2, 1);
  const out = scaleNearest(img, 2);
  assertEqual(Array.from(out.data.subarray(0, 8)), [10, 20, 30, 0, 10, 20, 30, 0]);
  assertEqual(out.data[(1 * 4 + 3) * 4 + 3], 128);
});

test('exportFileName', () => {
  assertEqual(exportFileName('3.jpg', 64, 48, 1), '3_64x48.png');
  assertEqual(exportFileName('hero.sprite.png', 32, 32, 4), 'hero.sprite_32x32_x4.png');
  assertEqual(exportFileName('noext', 8, 8, 1), 'noext_8x8.png');
  assertEqual(exportFileName('', 8, 8, 2), 'image_8x8_x2.png');
  assertEqual(exportFileName('.png', 8, 8, 1), 'image_8x8.png');
});

test('positiveModulo: negative values and rounding errors', () => {
  assertEqual(positiveModulo(5, 3), 2);
  assertEqual(positiveModulo(-1, 3), 2);
  assertClose(positiveModulo(-0.5, 3.4), 2.9, 1e-9);
  assertEqual(positiveModulo(6.8, 3.4), 0);
  assertEqual(positiveModulo(3.4 * 3, 3.4), 0, 'multiple with float error');
});

test('formatNumber', () => {
  assertEqual(formatNumber(22), '22');
  assertEqual(formatNumber(14.08), '14.08');
  assertEqual(formatNumber(768 / 7), '109.714');
  assertEqual(formatNumber(1.2000001), '1.2');
});

test('parseNumberInput: dot, comma, junk', () => {
  assertEqual(parseNumberInput('3.4'), 3.4);
  assertEqual(parseNumberInput(' 3,4 '), 3.4);
  assertEqual(parseNumberInput('-1'), -1);
  assertEqual(parseNumberInput(''), null);
  assertEqual(parseNumberInput('3.'), 3);
  assertEqual(parseNumberInput('abc'), null);
});

// ---- GRID ----

test('normalizeGrid: cell is limited, offset reduced to [0, cell)', () => {
  assertEqual(normalizeGrid({ cellW: 0.3, cellH: 5000, offsetX: 7, offsetY: -1 }, 100, 50),
    { cellW: 1, cellH: 50, offsetX: 0, offsetY: 49 });
  const g = normalizeGrid({ cellW: 3.4, cellH: 3.4, offsetX: 8.1, offsetY: -0.5 }, 100, 100);
  assertClose(g.offsetX, 1.3, 1e-9, 'offsetX');
  assertClose(g.offsetY, 2.9, 1e-9, 'offsetY');
});

test('gridSize: partial cells at the edges are dropped', () => {
  assertEqual(gridSize(64, 48, { cellW: 4, cellH: 4, offsetX: 0, offsetY: 0 }), { cols: 16, rows: 12 });
  assertEqual(gridSize(64, 48, { cellW: 4, cellH: 4, offsetX: 1, offsetY: 3 }), { cols: 15, rows: 11 });
  assertEqual(gridSize(10, 10, { cellW: 3, cellH: 3, offsetX: 0, offsetY: 0 }), { cols: 3, rows: 3 });
  assertEqual(gridSize(10, 10, { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0 }), { cols: 10, rows: 10 });
});

test('visibleGridLines: only lines in the visible range', () => {
  assertEqual(visibleGridLines(0, 10, 100, 0, 1000), { first: 0, last: 100 }, 'all visible');
  assertEqual(visibleGridLines(0, 10, 100, 25, 55), { first: 3, last: 5 }, 'middle');
  assertEqual(visibleGridLines(2.5, 3.4, 10, -100, 100), { first: 0, last: 10 }, 'zoomed out');
  const empty = visibleGridLines(0, 10, 5, 200, 300);
  assert(empty.first > empty.last, 'empty outside the grid');
});

test('cellAt: pixel center in a cell, grid edges', () => {
  const grid = normalizeGrid({ cellW: 3.4, cellH: 3.4, offsetX: 1.3, offsetY: 0 }, 100, 100);
  const size = gridSize(100, 100, grid);
  assertEqual(cellAt(0, 0, grid, size), null, 'left of the offset');
  assertEqual(cellAt(1, 0, grid, size), { col: 0, row: 0 });
  assertEqual(cellAt(4, 2, grid, size), { col: 0, row: 0 }, 'center 4.5 < 4.7, 2.5 < 3.4');
  assertEqual(cellAt(5, 3, grid, size), { col: 1, row: 1 }, 'center 5.5 >= 4.7, 3.5 >= 3.4');
  assertEqual(cellAt(99, 99, grid, size), null, 'partial cell at the edge');
});

test('cellSizeForCount: inverse of gridSize for presets and fractional cells', () => {
  for (const size of [1408, 1536, 768, 1024]) {
    for (const count of [...CONFIG.GRID_PRESETS, 7, 469, 470]) {
      for (const offset of [0, 1.3]) {
        const cell = cellSizeForCount(size, offset, count);
        if (cell < 1) continue;
        const { cols } = gridSize(size, size, { cellW: cell, cellH: cell, offsetX: offset, offsetY: 0 });
        assertEqual(cols, count, `size ${size}, count ${count}, offset ${offset}`);
      }
    }
  }
});

test('percentileThreshold: share of values below the threshold, -1 is ignored', () => {
  // 100 values 0..99, one per bin: threshold 0.8 cuts off 0..79
  const values = new Float32Array(100);
  for (let i = 0; i < 100; i++) values[i] = i;
  assertEqual(percentileThreshold(values, 0.8), 80);
  assertEqual(percentileThreshold(values, 0), 0, 'nothing is cut off');
  // Five valid: 5, 5, 5, 5, 40. 80% = the four fives must stay below the threshold
  assertEqual(percentileThreshold(new Float32Array([-1, -1, 5, 5, 5, 5, 40]), 0.8), 6, '-1 is outside the sample');
  assertEqual(percentileThreshold(new Float32Array([-1, -1]), 0.5), 0, 'no valid values');
  assertEqual(percentileThreshold(new Float32Array([1000]), 0.5), 255, 'magnitudes capped at 255');
});

test('edgeProfiles: peaks sit exactly on cell borders', () => {
  const cell = 4;
  const offset = 1;
  const art = makeSyntheticArt({ width: 20, height: 15, colors: 8, seed: 11 });
  const image = renderPseudoPixelArt(art, { cellW: cell, offsetX: offset, offsetY: offset });
  const profiles = edgeProfiles(image);
  assertEqual([profiles.x.length, profiles.y.length], [image.width, image.height], 'profile lengths');
  assertEqual(profiles.x[0], 0, 'left column has no neighbor');
  assertEqual(profiles.y[0], 0, 'top row has no neighbor');
  let peaks = 0;
  for (let i = 0; i < profiles.x.length; i++) {
    if (profiles.x[i] === 0) continue;
    peaks++;
    assertEqual((i - offset) % cell, 0, `X profile, position ${i}`);
  }
  assert(peaks >= 3, `expected at least 3 peaks on X, found ${peaks}`);
  for (let j = 0; j < profiles.y.length; j++) {
    if (profiles.y[j] !== 0) assertEqual((j - offset) % cell, 0, `Y profile, position ${j}`);
  }
});

test('edgeProfiles: transparent pixels give no edges', () => {
  // Left half opaque with an edge at x = 3, right half transparent with an edge at x = 9
  const w = 12;
  const h = 10;
  const image = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const isLeftHalf = x < 6;
      const isDark = isLeftHalf ? x < 3 : x < 9;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = isDark ? 0 : 255;
      image.data[i + 3] = isLeftHalf ? 255 : 0;
    }
  }
  const profiles = edgeProfiles(image, { percentile: 0.5 });
  assert(profiles.x[3] > 0, 'edge in the opaque part');
  assertEqual(profiles.x[9], 0, 'edge under transparency');
  assertEqual(profiles.x[6], 0, 'transparency border is not an edge');
});

test('edgeProfiles: a line with low coverage is zeroed', () => {
  // One row of 10 is opaque: column coverage 10% at a 50% threshold
  const w = 6;
  const h = 10;
  const image = new ImageData(w, h);
  for (let x = 0; x < w; x++) {
    const i = x * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = x < 3 ? 0 : 255;
    image.data[i + 3] = 255;
  }
  assert(edgeProfiles(image, { minCoverage: 0.1 }).x[3] > 0, 'coverage 10% at threshold 10%');
  assertEqual(edgeProfiles(image, { minCoverage: 0.5 }).x[3], 0, 'coverage 10% at threshold 50%');
});

test('medianOfNumbers: odd and even length, input unchanged', () => {
  assertEqual(medianOfNumbers([3, 1, 2]), 2);
  assertEqual(medianOfNumbers([4, 1, 2, 3]), 2.5);
  const values = [5, 1];
  medianOfNumbers(values);
  assertEqual(values, [5, 1], 'original array');
});

test('profilePeaks: local maxima, plateaus and noise threshold', () => {
  assertEqual(profilePeaks(new Float32Array([0, 5, 0, 0, 5, 0, 0, 5, 0])), [1, 4, 7]);
  assertEqual(profilePeaks(new Float32Array([0, 4, 4, 0, 0, 4, 4, 4, 0])), [1, 6], 'plateau middle');
  assertEqual(profilePeaks(new Float32Array([0, 1, 2, 3, 4, 3, 2, 1, 0])), [4], 'slope is not a peak');
  assertEqual(profilePeaks(new Float32Array([0, 10, 0, 1, 0, 10, 0]), 0.25), [1, 5], 'weak peak dropped');
  assertEqual(profilePeaks(new Float32Array([0, 0, 0])), [], 'flat profile');
  assertEqual(profilePeaks(new Float32Array([9, 0, 9])), [], 'profile ends are not peaks');
});

test('medianPeakSpacing: median distance between peaks', () => {
  const profile = new Float32Array(20);
  for (const i of [2, 5, 8, 11, 15]) profile[i] = 10; // spacings 3, 3, 3, 4
  assertEqual(medianPeakSpacing(profile), 3);
  assertEqual(medianPeakSpacing(new Float32Array([0, 5, 0])), 0, 'single peak');
});

test('medianPeakSpacing: matches an integer cell on exact synthetic art', () => {
  const art = makeSyntheticArt({ width: 30, height: 20, colors: 8, seed: 3 });
  const image = renderPseudoPixelArt(art, { cellW: 5, offsetX: 2, offsetY: 2 });
  const profiles = edgeProfiles(image);
  assertEqual(medianPeakSpacing(profiles.x), 5, 'on X');
  assertEqual(medianPeakSpacing(profiles.y), 5, 'on Y');
});

test('medianPeakSpacing: rounds a fractional cell to an integer', () => {
  // Known weakness of the basic method: peak spacings are integers
  const art = makeSyntheticArt({ width: 40, height: 30, colors: 8, seed: 7 });
  const image = renderPseudoPixelArt(art, { cellW: 2.9333, offsetX: 0, offsetY: 0 });
  const spacing = medianPeakSpacing(edgeProfiles(image).x);
  assert(spacing === 3 || spacing === 2.5, `expected integer or half-integer, got ${spacing}`);
});

/**
 * Comb profile: ones at multiples of the period.
 * @param {number} length
 * @param {number} period
 * @param {number} [offset]
 * @param {(m: number) => number} [amplitude] height of tooth m
 */
function combProfile(length, period, offset = 0, amplitude = () => 1) {
  const profile = new Float32Array(length);
  for (let m = 0; offset + m * period < length; m++) profile[Math.round(offset + m * period)] = amplitude(m);
  return profile;
}

test('combResponse: a comb at its own period gives the maximum', () => {
  const profile = combProfile(100, 5);
  assertEqual(combResponse(profile, 5, 0), 1, 'teeth on peaks');
  assertEqual(combResponse(profile, 5, 2), 0, 'teeth between peaks');
  assertClose(combResponse(profile, 5, 0.5), 0.5, 1e-6, 'half a pixel: linear interpolation');
  assertEqual(combResponse(profile, 40, 0), 0, 'fewer teeth than PERIOD_MIN_TEETH');
});

test('fitComb: finds the comb offset', () => {
  const fit = fitComb(combProfile(200, 6, 2), 6, CONFIG.PERIOD_PHASE_STEP);
  assertClose(fit.offset, 2, CONFIG.PERIOD_PHASE_STEP, 'offset');
  assert(fit.response > 0.9, `response ${fit.response}`);
  assertEqual(fit.teeth, 33, 'tooth count');
});

test('combSignificance: a large period with sparse teeth is penalized', () => {
  const stats = { mean: 0.2, deviation: 0.4 };
  const dense = combSignificance(0.8, 100, stats);
  const sparse = combSignificance(0.8, 10, stats);
  assert(dense > sparse, `${dense} should be greater than ${sparse}`);
  assertEqual(combSignificance(0.8, 10, { mean: 0.2, deviation: 0 }), 0, 'flat profile');
});

test('detectPeriod: integer comb period', () => {
  const { period, offset, confidence } = detectPeriod(combProfile(400, 7, 3));
  assertClose(period, 7, 0.05);
  assertClose(offset, 3, 0.1, 'offset');
  assert(confidence >= CONFIG.PERIOD_MIN_CONFIDENCE, `confidence ${confidence}`);
});

test('detectPeriod: fractional comb period', () => {
  for (const expected of [2.9333, 3.4, 5.7, 11.25]) {
    assertClose(detectPeriod(combProfile(600, expected)).period, expected, 0.05, `period ${expected}`);
  }
});

test('detectPeriod: a multiple of the period is not chosen over the true one', () => {
  // Every second tooth is half as high: the image repeats every 8, but the grid step is 4
  const { period } = detectPeriod(combProfile(400, 4, 0, (m) => (m % 2 === 0 ? 1 : 0.5)));
  assertClose(period, 4, 0.05);
});

test('detectPeriod: low confidence without periodicity', () => {
  assertEqual(detectPeriod(new Float32Array(200)), { period: 0, offset: 0, confidence: 0 }, 'flat profile');
  const rng = createRng(42);
  const noise = new Float32Array(400);
  for (let i = 0; i < noise.length; i++) noise[i] = rng();
  assert(detectPeriod(noise).confidence < CONFIG.PERIOD_MIN_CONFIDENCE, 'noise is not periodic');
});

test('detectPeriod: exact synthetic art, integer and fractional cell', () => {
  for (const cell of [3, 4, 2.9333, 5.7]) {
    const art = makeSyntheticArt({ width: 60, height: 40, colors: 8, seed: 21 });
    const image = renderPseudoPixelArt(art, { cellW: cell, offsetX: 1.3, offsetY: 0.7 });
    const profiles = edgeProfiles(image);
    const byX = detectPeriod(profiles.x);
    assertClose(byX.period, cell, 0.05, `cell ${cell}, X axis`);
    // In a sharp image an edge lands exactly on a pixel, so the fractional
    // part of the offset is recovered only to half a pixel
    assertClose(byX.offset % cell, 1.3 % cell, 0.6, `cell ${cell}, X offset`);
    assertClose(detectPeriod(profiles.y).period, cell, 0.05, `cell ${cell}, Y axis`);
  }
});

test('detectPeriod: synthetic art with noise and JPEG', async () => {
  // A box blur of radius 1 (3 px window) on a cell of about 3 px erases the grid
  // completely: that is the limit of the method
  const art = makeSyntheticArt({ width: 100, height: 50, colors: 12, seed: 33 });
  for (const cell of [2.9333, 4.5]) {
    const clean = renderPseudoPixelArt(art, { cellW: cell, offsetX: 0.5, offsetY: 1.1 });
    const damaged = await jpegRecompress(addNoise(clean, 6, 9), 0.8);
    const { period, confidence } = detectPeriod(edgeProfiles(damaged).x);
    assertClose(period, cell, 0.05, `cell ${cell}`);
    // A cell of about 3 px after JPEG scores only about 4.5 sigma: the period is
    // right but confidence is below "trusted", which is the limit of the method
    const expected = cell < 3 ? 4 : CONFIG.PERIOD_MIN_CONFIDENCE;
    assert(confidence >= expected, `cell ${cell}, confidence ${confidence}`);
  }
});

test('detectGrid: axes are computed independently', () => {
  const art = makeSyntheticArt({ width: 60, height: 40, colors: 8, seed: 12 });
  const image = renderPseudoPixelArt(art, { cellW: 3, cellH: 4.5, offsetX: 0.4, offsetY: 2 });
  const grid = detectGrid(image);
  assertClose(grid.cellW, 3, 0.05, 'cell on X');
  assertClose(grid.cellH, 4.5, 0.05, 'cell on Y');
  assertClose(grid.offsetY, 2, 0.6, 'offset on Y');
  assert(isPeriodTrusted(grid.cellW, grid.confidenceX), `confidence on X ${grid.confidenceX}`);
  assert(isPeriodTrusted(grid.cellH, grid.confidenceY), `confidence on Y ${grid.confidenceY}`);
});

test('isPeriodTrusted: confidence threshold and empty period', () => {
  assert(isPeriodTrusted(3, CONFIG.PERIOD_MIN_CONFIDENCE), 'exactly at the threshold');
  assert(!isPeriodTrusted(3, CONFIG.PERIOD_MIN_CONFIDENCE - 0.1), 'below the threshold');
  assert(!isPeriodTrusted(0, 100), 'period not found');
});

test('uniformGridLines: uniform grid positions', () => {
  assertEqual(Array.from(uniformGridLines(1.5, 3, 3)), [1.5, 4.5, 7.5, 10.5]);
});

test('parabolicOffset: correction is clamped and dropped at the window edge', () => {
  assertEqual(parabolicOffset(1, 5, 1), 0, 'symmetric peak');
  assertClose(parabolicOffset(2, 6, 4), 1 / 6, 1e-9, 'peak shifted right');
  assertEqual(parabolicOffset(9, 5, 1), 0, 'neighbor is higher: the real peak is outside the window');
  // Nearly flat triple: without clamping the correction would fly off by hundreds of pixels
  assert(Math.abs(parabolicOffset(5, 5, 4.9999999)) <= 0.5, 'correction is clamped');
  assertEqual(parabolicOffset(5, 5, 5), 0, 'plateau');
});

test('strongestEdgeIn: window maximum with subpixel correction', () => {
  const profile = new Float32Array([0, 1, 5, 1, 0, 0, 2, 0]);
  assertEqual(strongestEdgeIn(profile, 0, 4), { position: 2, value: 5 }, 'symmetric peak');
  assertEqual(strongestEdgeIn(profile, 5, 7).position, 6, 'second peak');
  assertEqual(strongestEdgeIn(profile, 4, 5), { position: 0, value: 0 }, 'no edges in the window');
  const skewed = new Float32Array([0, 2, 6, 4, 0]);
  assert(strongestEdgeIn(skewed, 0, 4).position > 2, 'peak shifted right');
});

test('refineGridLines: lines snap to the edges of an uneven grid', () => {
  // Borders every 3, 4, 3, 4, 3 pixels: a uniform 3.5 grid does not fit them
  const positions = [0, 3, 7, 10, 14, 17];
  const profile = new Float32Array(20);
  for (const i of positions) profile[i] = 10;
  const lines = refineGridLines(profile, 0, 3.5, 5);
  assertEqual(Array.from(lines), positions);
});

test('refineGridLines: a strong edge at the window border does not drag the line', () => {
  // The peak is just outside the search window: a parabola there can give a correction of hundreds of px
  const profile = new Float32Array(40);
  profile[10] = 1;
  profile[11] = 100;
  const lines = refineGridLines(profile, 0, 8, 4, { window: 0.25 });
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i] - lines[i - 1];
    assert(gap > 0 && gap <= 8 * 1.5, `step ${i}: ${gap}`);
  }
});

test('refineGridLines: stays uniform without edges', () => {
  const lines = refineGridLines(new Float32Array(20), 1, 3, 4);
  assertEqual(Array.from(lines), [1, 4, 7, 10, 13]);
});

test('refineGridLines: lines do not collapse together', () => {
  // All edges are bunched at the start: without a minimum gap lines would sit on each other
  const profile = new Float32Array(30);
  for (const i of [2, 3, 4]) profile[i] = 10;
  const lines = refineGridLines(profile, 2, 4, 3, { window: 0.5, minGap: 0.5 });
  for (let i = 1; i < lines.length; i++) {
    assert(lines[i] - lines[i - 1] >= 2 - 1e-6, `gap ${i}: ${lines[i] - lines[i - 1]}`);
  }
});

test('cellRangesFromLines: uneven cells and margin', () => {
  const lines = new Float32Array([0, 2, 6, 12]);
  assertEqual(Array.from(cellRangesFromLines(lines, 0, 12)), [0, 2, 2, 6, 6, 12]);
  // Margin 25%: cell [2, 6) keeps [3, 5)
  assertEqual(Array.from(cellRangesFromLines(lines, 0.25, 12)).slice(2, 4), [3, 5]);
  // 1 px wide cell: the inner part is empty, so the pixel at the cell center is used
  assertEqual(Array.from(cellRangesFromLines(new Float32Array([4, 5]), 0.4, 12)), [4, 5]);
});

test('downscaleByLines: uneven columns', () => {
  // Three stripes of different width: 2, 4 and 3 px
  const width = 9;
  const image = new ImageData(width, 1);
  const colors = [30, 150, 240];
  const bounds = [0, 2, 6, 9];
  for (let c = 0; c < 3; c++) {
    for (let x = bounds[c]; x < bounds[c + 1]; x++) {
      const i = x * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = colors[c];
      image.data[i + 3] = 255;
    }
  }
  const out = downscaleByLines(image, new Float32Array(bounds), new Float32Array([0, 1]), {
    mode: 'median', margin: 0,
  });
  assertEqual([out.width, out.height], [3, 1]);
  assertEqual(Array.from(out.data), [30, 30, 30, 255, 150, 150, 150, 255, 240, 240, 240, 255]);
});

test('rgbHex', () => {
  assertEqual(rgbHex([0, 15, 255]), '#000fff');
});

test('pixelHex', () => {
  const img = new ImageData(new Uint8ClampedArray([0, 0, 0, 255, 255, 16, 1, 128]), 2, 1);
  assertEqual(pixelHex(img, 0, 0), '#000000');
  assertEqual(pixelHex(img, 1, 0), '#ff1001');
});

test('sharpenEdges: zero strength returns a copy', () => {
  const art = makeSyntheticArt({ width: 20, height: 15, colors: 8, seed: 7 });
  const out = sharpenEdges(art, { amount: 0 });
  assertEqual(meanAbsDiff(out, art), 0, 'image unchanged');
  assert(out !== art, 'must be a copy');
});

test('sharpenEdges: a flat fill stays unchanged', () => {
  const image = makeColorStrip([[120, 130, 140]], 8);
  assertEqual(meanAbsDiff(sharpenEdges(image, { amount: 1 }), image), 0);
});

test('sharpenEdges: a blurred edge gets more contrast', () => {
  // A step with a blurred transition: unsharp masking pushes its sides apart.
  // A linear gradient would not work, its 3x3 mean equals the center.
  const values = [40, 40, 40, 100, 160, 160, 160];
  const width = values.length;
  const image = new ImageData(width, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < width; x++) {
      image.data.set([values[x], values[x], values[x], 255], (y * width + x) * 4);
    }
  }
  const out = sharpenEdges(image, { amount: 1 });
  const at = (/** @type {number} */ x) => out.data[(1 * width + x) * 4];
  assert(at(2) < values[2], `dark side got darker: ${at(2)} < ${values[2]}`);
  assert(at(4) > values[4], `light side got lighter: ${at(4)} > ${values[4]}`);
  assertEqual(at(3), values[3], 'middle of the transition in place');
  assertEqual(at(0), values[0], 'flat area untouched');
});

test('sharpenEdges: transparent pixels are ignored and unchanged', () => {
  const image = makeColorStrip([[200, 200, 200], [20, 20, 20]], 2);
  // Make the dark half transparent: the light half must not "ring" from it
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i] === 20) image.data[i + 3] = 0;
  }
  const out = sharpenEdges(image, { amount: 1 });
  for (let i = 0; i < out.data.length; i += 4) {
    if (image.data[i + 3] === 0) {
      assertEqual(Array.from(out.data.subarray(i, i + 4)), [20, 20, 20, 0], 'transparent untouched');
    } else {
      assertEqual(out.data[i], 200, 'opaque does not pull color from transparent neighbors');
    }
  }
});

// ---- ADJUST ----

test('buildToneTable: zeros keep values, extremes hit the bounds', () => {
  const identity = buildToneTable(0, 0);
  assertEqual(Array.from(identity.subarray(0, 3)), [0, 1, 2], 'table start');
  assertEqual(identity[255], 255, 'table end');
  const bright = buildToneTable(50, 0);
  assert(bright[100] > 100, `brightness raises: ${bright[100]}`);
  const contrast = buildToneTable(0, 60);
  assert(contrast[200] > 200 && contrast[50] < 50, `contrast spreads the ends: ${contrast[50]} / ${contrast[200]}`);
  assert(buildToneTable(0, -100)[0] > 0 && buildToneTable(0, -100)[255] < 255, 'negative contrast pulls to gray');
});

test('adjustColors: zero parameters return a copy', () => {
  const art = makeSyntheticArt({ width: 20, height: 15, colors: 8, seed: 1 });
  const out = adjustColors(art, { brightness: 0, contrast: 0, saturation: 0 });
  assertEqual(meanAbsDiff(out, art), 0, 'image unchanged');
  assert(out !== art, 'must be a copy');
});

test('adjustColors: saturation -100 makes gray, alpha is kept', () => {
  const image = makeColorStrip([[200, 30, 30], [30, 200, 30]], 1);
  image.data[7] = 0; // second pixel of the first row is transparent
  const out = adjustColors(image, { saturation: -100 });
  assertEqual(out.data[0], out.data[1], 'r = g');
  assertEqual(out.data[1], out.data[2], 'g = b');
  assertEqual(Array.from(out.data.subarray(4, 8)), [30, 200, 30, 0], 'transparent untouched');
});

test('adjustColors: saturation +100 spreads channels further', () => {
  const image = makeColorStrip([[180, 100, 100]], 1);
  const out = adjustColors(image, { saturation: 100 });
  const before = 180 - 100;
  assert(out.data[0] - out.data[1] > before, `spread grew: ${out.data[0]} - ${out.data[1]}`);
});

test('adjustColors: brightness and contrast', () => {
  const image = makeColorStrip([[100, 100, 100], [200, 200, 200]], 1);
  const brighter = adjustColors(image, { brightness: 20 });
  assert(brighter.data[0] > 100, `brighter: ${brighter.data[0]}`);
  const contrasted = adjustColors(image, { contrast: 50 });
  assert(contrasted.data[0] < 100 && contrasted.data[4] > 200,
    `contrast spreads: ${contrasted.data[0]} / ${contrasted.data[4]}`);
});

test('adjustColors: gray stays gray at any saturation', () => {
  const image = makeColorStrip([[128, 128, 128]], 1);
  for (const saturation of [-100, -50, 50, 100]) {
    const out = adjustColors(image, { saturation });
    assertEqual(Array.from(out.data.subarray(0, 3)), [128, 128, 128], `saturation ${saturation}`);
  }
});

// ---- PALETTE ----

/**
 * Image of the given colors, one column per color.
 * @param {number[][]} colors
 * @param {number} [repeat] columns per color
 * @param {number} [alpha]
 * @returns {ImageData}
 */
function makeColorStrip(colors, repeat = 4, alpha = 255) {
  const image = new ImageData(colors.length * repeat, 2);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = colors[Math.floor(x / repeat)];
      const i = (y * image.width + x) * 4;
      image.data.set([color[0], color[1], color[2], alpha], i);
    }
  }
  return image;
}

test('collectOpaquePixels: transparent pixels are not sampled', () => {
  const image = makeColorStrip([[10, 20, 30], [200, 100, 50]], 1);
  image.data[3] = 0; // first pixel is transparent
  const { rgb, count } = collectOpaquePixels(image);
  assertEqual(count, 3, 'opaque count');
  assertEqual(Array.from(rgb.subarray(0, 3)), [200, 100, 50], 'first collected pixel');
});

test('samplePixelIndices: a small sample is taken whole', () => {
  assertEqual(Array.from(samplePixelIndices(4, 10, createRng(1))), [0, 1, 2, 3]);
  const picked = samplePixelIndices(1000, 50, createRng(1));
  assertEqual(picked.length, 50, 'sample size');
  assert(picked.every((i) => i >= 0 && i < 1000), 'indices in range');
});

test('pickInitialCenters: centers spread across different clusters', () => {
  // Three far-apart points, each repeated once: k-means++ must pick all three
  const points = new Float32Array([0, 0, 0, 0, 0, 0, 100, 0, 0, 100, 0, 0, 0, 100, 0, 0, 100, 0]);
  const centers = pickInitialCenters(points, 6, 3, createRng(7));
  const chosen = new Set();
  for (let c = 0; c < 3; c++) chosen.add(centers.slice(c * 3, c * 3 + 3).join(','));
  assertEqual(chosen.size, 3, `distinct centers chosen: ${[...chosen].join(' | ')}`);
});

test('extractPalette: finds the source colors', () => {
  const colors = [[20, 20, 20], [230, 40, 40], [40, 230, 60], [40, 60, 230]];
  const palette = extractPalette(makeColorStrip(colors), { count: 4 });
  assertEqual(palette.length, 4, 'palette size');
  for (const color of colors) {
    assert(palette.some((c) => c.every((v, i) => Math.abs(v - color[i]) <= 1)), `color ${color} not found`);
  }
});

test('extractPalette: palette is sorted by lightness', () => {
  const palette = extractPalette(makeColorStrip([[240, 240, 240], [10, 10, 10], [128, 128, 128]]), { count: 3 });
  assertEqual(palette.map((c) => c[0]), [10, 128, 240]);
});

test('extractPalette: deterministic and seed-dependent', () => {
  const image = makeSyntheticArt({ width: 40, height: 30, colors: 24, seed: 4 });
  const a = extractPalette(image, { count: 8 });
  const b = extractPalette(image, { count: 8 });
  assertEqual(a, b, 'same seed, same result');
});

test('extractPalette: fewer colors than requested', () => {
  const palette = extractPalette(makeColorStrip([[0, 0, 0], [255, 255, 255]]), { count: 16 });
  assertEqual(palette.length, 2, 'empty clusters dropped');
});

test('extractPalette: a fully transparent image gives an empty palette', () => {
  assertEqual(extractPalette(new ImageData(4, 4), { count: 8 }), []);
});

test('quantizeToPalette: colors are replaced by the nearest, alpha is kept', () => {
  const image = makeColorStrip([[250, 10, 10], [10, 250, 10]], 1);
  image.data[7] = 0; // second pixel is transparent
  const out = quantizeToPalette(image, [[255, 0, 0], [0, 0, 255]]);
  assertEqual(Array.from(out.data.subarray(0, 4)), [255, 0, 0, 255], 'red to red');
  assertEqual(Array.from(out.data.subarray(4, 8)), [10, 250, 10, 0], 'transparent untouched');
  assert(colorSet(out).size <= 3, 'opaque pixels only from the palette');
});

test('quantizeToPalette: an empty palette returns a copy', () => {
  const image = makeColorStrip([[1, 2, 3]], 1);
  const out = quantizeToPalette(image, []);
  assertEqual(meanAbsDiff(out, image), 0);
  assert(out !== image, 'must be a copy');
});

test('hexToRgb: parsing hex notation', () => {
  assertEqual(hexToRgb('ff8000'), [255, 128, 0], 'without hash');
  assertEqual(hexToRgb('#FF8000'), [255, 128, 0], 'with hash and upper case');
  assertEqual(hexToRgb(' 000000 '), [0, 0, 0], 'surrounding spaces');
  assertEqual(hexToRgb('f80'), null, 'short notation not supported');
  assertEqual(hexToRgb('gggggg'), null, 'non-hex characters');
});

test('PALETTE_LIBRARY: palettes are valid and ids unique', () => {
  const ids = new Set();
  for (const entry of CONFIG.PALETTE_LIBRARY) {
    assert(!ids.has(entry.id), `id ${entry.id} repeats`);
    ids.add(entry.id);
    assert(entry.colors.length >= 2, `${entry.id}: too few colors`);
    assertEqual(new Set(entry.colors).size, entry.colors.length, `${entry.id}: colors do not repeat`);
    for (const hex of entry.colors) assert(hexToRgb(hex) !== null, `${entry.id}: bad color ${hex}`);
  }
  assert(ids.has(CONFIG.DEFAULT_PARAMS.palettePreset), 'default palette is in the library');
});

test('presetPalette: palette by id, unknown id gives an empty one', () => {
  const pico = presetPalette('pico8');
  assertEqual(pico.length, 16, 'PICO-8 has 16 colors');
  assertEqual(pico[0], [0, 0, 0], 'first color is black');
  assertEqual(presetPalette('no such id'), [], 'unknown id');
});

test('parsePaletteText: .hex format (Lospec)', () => {
  const palette = parsePaletteText('ff0000\n00FF00\n\n#0000ff\n');
  assertEqual(palette, [[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
});

test('parsePaletteText: .gpl format (GIMP)', () => {
  const text = [
    'GIMP Palette',
    'Name: Test',
    'Columns: 4',
    '# comment',
    ' 255   0   0\tRed',
    '  0 128 255  Blue',
  ].join('\n');
  assertEqual(parsePaletteText(text), [[255, 0, 0], [0, 128, 255]]);
});

test('parsePaletteText: duplicates and junk are dropped, limit is respected', () => {
  assertEqual(parsePaletteText('112233\n112233\n'), [[17, 34, 51]], 'duplicate');
  assertEqual(parsePaletteText('zero\n300 0 0\nGIMP Palette'), [], 'junk and values over 255');
  assertEqual(parsePaletteText('000000\n111111\n222222', 2).length, 2, 'limit');
});

test('imagePalette: unique colors by lightness, transparent ones excluded', () => {
  const image = makeColorStrip([[240, 240, 240], [10, 10, 10], [240, 240, 240], [200, 0, 0]], 1);
  image.data[15] = 0; // red column is transparent (the strip has two rows)
  image.data[31] = 0;
  const palette = imagePalette(image);
  assertEqual(palette.total, 2, 'duplicates and transparent dropped');
  assertEqual(palette.colors, [[10, 10, 10], [240, 240, 240]], 'by increasing lightness');
});

test('imagePalette: limit caps what is shown, not the count', () => {
  const art = makeSyntheticArt({ width: 40, height: 30, colors: 32, seed: 5 });
  const palette = imagePalette(art, 4);
  assertEqual(palette.colors.length, 4, 'no more than the limit shown');
  assert(palette.total > 4, `total colors above the limit: ${palette.total}`);
});

test('paletteToHexText: .hex format and round trip', () => {
  /** @type {RGB[]} */
  const palette = [[255, 0, 0], [0, 17, 255]];
  assertEqual(paletteToHexText(palette), 'ff0000\n0011ff\n');
  assertEqual(parsePaletteText(paletteToHexText(palette)), palette, 'text parses back');
});

test('paletteForParams: custom, built-in and suggested palette', () => {
  const art = makeSyntheticArt({ width: 20, height: 20, colors: 8, seed: 3 });
  const base = { ...CONFIG.DEFAULT_PARAMS };
  /** @type {RGB[]} */
  const custom = [[0, 0, 0], [255, 255, 255]];
  assertEqual(
    paletteForParams(art, { ...base, paletteMode: 'preset', palettePreset: CONFIG.PALETTE_CUSTOM_ID, customPalette: custom }),
    custom, 'custom palette');
  assertEqual(
    paletteForParams(art, { ...base, paletteMode: 'preset', palettePreset: CONFIG.PALETTE_CUSTOM_ID, customPalette: null }),
    [], 'custom not loaded');
  assertEqual(
    paletteForParams(art, { ...base, paletteMode: 'preset', palettePreset: 'gameboy' }).length,
    4, 'built-in');
  assertEqual(
    paletteForParams(art, { ...base, paletteMode: 'auto', paletteSize: 4 }).length,
    4, 'suggested from the image');
});

test('presetPalette + quantizeToPalette: only palette colors in the result', () => {
  const art = makeSyntheticArt({ width: 60, height: 40, colors: 48, seed: 11 });
  const palette = presetPalette('gameboy');
  const out = quantizeToPalette(art, palette);
  const allowed = new Set(palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
  for (const color of colorSet(out)) assert(allowed.has(color), `extra color ${color.toString(16)}`);
});

test('extractPalette + quantizeToPalette: 16 colors from synthetic art', () => {
  const art = makeSyntheticArt({ width: 60, height: 40, colors: 48, seed: 9 });
  const palette = extractPalette(art, { count: 16 });
  assertEqual(palette.length, 16, 'palette size');
  const out = quantizeToPalette(art, palette);
  assertEqual(colorSet(out).size, 16, 'result has exactly the palette colors');
});

// ---- DITHER ----

/**
 * Gray image of the given brightness.
 * @param {number} width
 * @param {number} height
 * @param {number} value
 * @returns {ImageData}
 */
function makeGray(width, height, value) {
  const image = new ImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([value, value, value, 255], i);
  }
  return image;
}

test('bayerMatrix: all thresholds distinct and in [0, 1)', () => {
  for (const size of [2, 4, 8]) {
    const matrix = bayerMatrix(size);
    assertEqual(matrix.length, size * size, `size ${size}`);
    assertEqual(new Set(matrix).size, size * size, `thresholds ${size} do not repeat`);
    assert(matrix.every((v) => v >= 0 && v < 1), `thresholds ${size} in [0, 1)`);
  }
  assertEqual(Array.from(bayerMatrix(2)), [0, 0.5, 0.75, 0.25], 'classic 2×2 matrix');
});

test('paletteSpread: distance to the nearest neighbor', () => {
  assertEqual(paletteSpread([[0, 0, 0], [10, 0, 0]]), 10, 'two colors');
  assertEqual(paletteSpread([[0, 0, 0]]), 0, 'one color');
});

test('orderedDither: gray between two colors gives a pattern of both', () => {
  const image = makeGray(8, 8, 128);
  const out = orderedDither(image, [[0, 0, 0], [255, 255, 255]], { size: 4, intensity: 1 });
  const colors = colorSet(out);
  assertEqual(colors.size, 2, 'both palette colors in the result');
  let dark = 0;
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i] === 0) dark++;
  assert(dark > 20 && dark < 44, `colors roughly equal, ${dark} dark of 64`);
});

test('orderedDither: zero strength matches quantization', () => {
  const art = makeSyntheticArt({ width: 30, height: 20, colors: 16, seed: 2 });
  const palette = presetPalette('gameboy');
  const quantized = quantizeToPalette(art, palette);
  assertEqual(meanAbsDiff(ditherToPalette(art, palette, { mode: 'bayer4', intensity: 0 }), quantized), 0);
});

test('orderedDither: transparent pixels are untouched', () => {
  const image = makeGray(4, 4, 128);
  image.data[3] = 0;
  const out = orderedDither(image, [[0, 0, 0], [255, 255, 255]], { size: 2, intensity: 1 });
  assertEqual(Array.from(out.data.subarray(0, 4)), [128, 128, 128, 0], 'color and alpha kept');
});

test('floydSteinbergDither: mean brightness is closer to the source than without dithering', () => {
  const image = makeGray(16, 16, 100);
  /** @type {RGB[]} */
  const palette = [[0, 0, 0], [255, 255, 255]];
  const mean = (/** @type {ImageData} */ img) => {
    let sum = 0;
    for (let i = 0; i < img.data.length; i += 4) sum += img.data[i];
    return sum / (img.data.length / 4);
  };
  const plain = Math.abs(mean(quantizeToPalette(image, palette)) - 100);
  const dithered = Math.abs(mean(floydSteinbergDither(image, palette, { intensity: 1 })) - 100);
  assert(dithered < plain, `dithering ${dithered.toFixed(1)} vs ${plain.toFixed(1)}`);
});

test('floydSteinbergDither: error does not spread into transparent pixels', () => {
  // Left half opaque, right half transparent: the right half must stay as it was
  const image = makeGray(6, 6, 100);
  for (let y = 0; y < 6; y++) {
    for (let x = 3; x < 6; x++) image.data[(y * 6 + x) * 4 + 3] = 0;
  }
  const out = floydSteinbergDither(image, [[0, 0, 0], [255, 255, 255]], { intensity: 1 });
  for (let y = 0; y < 6; y++) {
    for (let x = 3; x < 6; x++) {
      const i = (y * 6 + x) * 4;
      assertEqual(Array.from(out.data.subarray(i, i + 4)), [100, 100, 100, 0], `pixel ${x},${y}`);
    }
  }
});

test('ditherToPalette: modes give different results, none matches quantization', () => {
  const art = makeSyntheticArt({ width: 30, height: 20, colors: 24, seed: 6 });
  const palette = presetPalette('gameboy');
  const none = ditherToPalette(art, palette, { mode: 'none', intensity: 1 });
  assertEqual(meanAbsDiff(none, quantizeToPalette(art, palette)), 0, 'none = quantization');
  const bayer4 = ditherToPalette(art, palette, { mode: 'bayer4', intensity: 1 });
  const bayer8 = ditherToPalette(art, palette, { mode: 'bayer8', intensity: 1 });
  const fs = ditherToPalette(art, palette, { mode: 'fs', intensity: 1 });
  assert(meanAbsDiff(bayer4, none) > 0, 'bayer4 differs from quantization');
  assert(meanAbsDiff(bayer8, bayer4) > 0, 'matrix size matters');
  assert(meanAbsDiff(fs, bayer4) > 0, 'Floyd-Steinberg differs from ordered');
  assertEqual(meanAbsDiff(ditherToPalette(art, palette, { mode: 'fs', intensity: 1 }), fs), 0, 'deterministic');
});

test('ditherToPalette: an empty palette returns a copy', () => {
  const image = makeGray(4, 4, 128);
  const out = ditherToPalette(image, [], { mode: 'fs', intensity: 1 });
  assertEqual(meanAbsDiff(out, image), 0);
  assert(out !== image, 'must be a copy');
});

// ---- CLEANUP ----

/**
 * Transparent field with one opaque pixel at (x, y).
 * @param {number} size
 * @param {number} x
 * @param {number} y
 * @param {number[]} [color]
 * @returns {ImageData}
 */
function makeDot(size, x, y, color = [200, 100, 50]) {
  const image = new ImageData(size, size);
  image.data.set([color[0], color[1], color[2], 255], (y * size + x) * 4);
  return image;
}

/**
 * Number of opaque pixels in the image.
 * @param {ImageData} image
 * @returns {number}
 */
function countOpaque(image) {
  let count = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] >= 128) count++;
  return count;
}

test('neighbourMode: most frequent neighbor color', () => {
  // 3x3 field: eight neighbors, five red and three blue
  const image = new ImageData(3, 3);
  const colors = [
    [255, 0, 0], [255, 0, 0], [255, 0, 0],
    [255, 0, 0], [9, 9, 9], [255, 0, 0],
    [0, 0, 255], [0, 0, 255], [0, 0, 255],
  ];
  colors.forEach((c, i) => image.data.set([c[0], c[1], c[2], 255], i * 4));
  const mode = must(neighbourMode(image.data, 3, 3, 1, 1));
  assertEqual(mode.color, [255, 0, 0], 'red wins');
  assertEqual(mode.count, 5, 'five red neighbors');
  assertEqual(mode.opaque, 8, 'all neighbors opaque');
  assertEqual(neighbourMode(new ImageData(3, 3).data, 3, 3, 1, 1), null, 'no neighbors');
});

test('despeckle: a lone pixel takes the neighbors color', () => {
  const image = new ImageData(3, 3);
  for (let i = 0; i < 9; i++) image.data.set([40, 120, 200, 255], i * 4);
  image.data.set([255, 40, 40, 255], 4 * 4); // odd one out in the middle
  const out = despeckle(image);
  assertEqual(Array.from(out.data.subarray(16, 20)), [40, 120, 200, 255], 'middle now matches neighbors');
  assertEqual(Array.from(out.data.subarray(0, 4)), [40, 120, 200, 255], 'others untouched');
});

test('despeckle: a pixel with a similar neighbor stays', () => {
  const image = new ImageData(3, 3);
  for (let i = 0; i < 9; i++) image.data.set([40, 120, 200, 255], i * 4);
  // A difference of one per channel is a fraction of ΔE: not a lone pixel
  image.data.set([41, 121, 201, 255], 4 * 4);
  assertEqual(meanAbsDiff(despeckle(image), image), 0);
});

test('despeckle: decides on the original image, not the corrected one', () => {
  // Two odd pixels side by side: each is lone relative to the source, both are replaced
  const image = new ImageData(4, 3);
  for (let i = 0; i < 12; i++) image.data.set([30, 30, 30, 255], i * 4);
  image.data.set([250, 250, 250, 255], (1 * 4 + 1) * 4);
  image.data.set([10, 200, 10, 255], (1 * 4 + 2) * 4);
  const out = despeckle(image);
  assertEqual(Array.from(out.data.subarray((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)), [30, 30, 30, 255], 'first');
  assertEqual(Array.from(out.data.subarray((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)), [30, 30, 30, 255], 'second');
});

test('fillAlphaHoles: an inner hole is filled, a notch at the edge is not', () => {
  const size = 5;
  const image = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) image.data.set([70, 80, 90, 255], i * 4);
  /** @type {(x: number, y: number) => number} */
  const at = (x, y) => (y * size + x) * 4;
  image.data[at(2, 2) + 3] = 0; // hole in the middle
  image.data[at(2, 0) + 3] = 0; // notch on the top edge: no neighbor above
  const out = fillAlphaHoles(image);
  assertEqual(Array.from(out.data.subarray(at(2, 2), at(2, 2) + 4)), [70, 80, 90, 255], 'hole filled');
  assertEqual(out.data[at(2, 0) + 3], 0, 'edge notch remains');
});

test('cleanupResult: disabled options change nothing', () => {
  const art = makeSyntheticArt({ width: 20, height: 20, colors: 8, seed: 12 });
  const out = cleanupResult(art, { isDespeckled: false, isHolesFilled: false });
  assertEqual(out, art, 'same image returned');
});

test('addOutline: connectivity sets the number of added pixels', () => {
  const dot = makeDot(5, 2, 2);
  const four = addOutline(dot, { color: [0, 0, 0], connectivity: 4 });
  const eight = addOutline(dot, { color: [0, 0, 0], connectivity: 8 });
  assertEqual(countOpaque(four), 5, '4-connectivity: pixel and 4 neighbors');
  assertEqual(countOpaque(eight), 9, '8-connectivity: pixel and 8 neighbors');
  assertEqual(Array.from(four.data.subarray((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [200, 100, 50, 255],
    'original pixel untouched');
  const above = ((1 * 5 + 2) * 4);
  assertEqual(Array.from(four.data.subarray(above, above + 4)), [0, 0, 0, 255], 'outline is opaque');
});

test('addOutline: at the image edge the outline stays inside', () => {
  const dot = makeDot(3, 0, 0);
  const out = addOutline(dot, { color: [0, 0, 0], connectivity: 8 });
  assertEqual(out.width, 3, 'size unchanged');
  assertEqual(countOpaque(out), 4, 'pixel and three neighbors inside the image');
});

test('darkestColor: darkest opaque color', () => {
  const image = makeColorStrip([[240, 240, 240], [10, 20, 30], [120, 120, 120]], 1);
  assertEqual(darkestColor(image), [10, 20, 30]);
  assertEqual(darkestColor(new ImageData(3, 3)), null, 'no opaque pixels');
});

test('darkenEdges: edges darken, interior and transparent stay', () => {
  // Opaque 3x3 square in a 5x5 field: center (2,2) is interior
  const image = new ImageData(5, 5);
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) image.data.set([200, 200, 200, 255], (y * 5 + x) * 4);
  }
  const out = darkenEdges(image, { amount: 0.5, connectivity: 8 });
  /** @type {(x: number, y: number) => number[]} */
  const at = (x, y) => Array.from(out.data.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4));
  assertEqual(at(2, 2), [200, 200, 200, 255], 'interior pixel as it was');
  assertEqual(at(1, 1), [100, 100, 100, 255], 'corner darkened by half');
  assertEqual(at(0, 0), [0, 0, 0, 0], 'transparent untouched');
  assertEqual(countOpaque(out), 9, 'no new pixels');
});

test('darkenEdges: zero darkening changes nothing', () => {
  const art = makeSyntheticArt({ width: 20, height: 20, colors: 8, seed: 4 });
  assertEqual(meanAbsDiff(darkenEdges(art, { amount: 0 }), art), 0);
});

test('applyOutline: modes and auto color', () => {
  const dot = makeDot(5, 2, 2, [200, 200, 200]);
  dot.data.set([10, 10, 10, 255], (0 * 5 + 0) * 4); // dark pixel in the corner
  /** @type {{mode: OutlineMode, color: RGB | null, connectivity: number, darken: number}} */
  const base = { mode: 'none', color: null, connectivity: 8, darken: 0.5 };
  assertEqual(applyOutline(dot, base), dot, 'none returns the same image');
  const auto = applyOutline(dot, { ...base, mode: 'outline' });
  const above = ((1 * 5 + 2) * 4);
  assertEqual(Array.from(auto.data.subarray(above, above + 4)), [10, 10, 10, 255], 'darkest color used');
  const manual = applyOutline(dot, { ...base, mode: 'outline', color: [255, 0, 0] });
  assertEqual(Array.from(manual.data.subarray(above, above + 4)), [255, 0, 0, 255], 'chosen color used');
  const dark = applyOutline(dot, { ...base, mode: 'dark' });
  assertEqual(countOpaque(dark), 2, 'dark edges add no pixels');
});

test('applyOutline: a fully transparent image stays transparent', () => {
  const empty = new ImageData(4, 4);
  const out = applyOutline(empty, { mode: 'outline', color: null, connectivity: 8, darken: 0.5 });
  assertEqual(countOpaque(out), 0);
});

test('opaqueBounds: content rectangle', () => {
  const image = new ImageData(6, 5);
  /** @type {(x: number, y: number) => number} */
  const at = (x, y) => (y * 6 + x) * 4;
  image.data.set([10, 20, 30, 255], at(1, 2));
  image.data.set([10, 20, 30, 255], at(4, 3));
  assertEqual(opaqueBounds(image), { x: 1, y: 2, w: 4, h: 2 });
  assertEqual(opaqueBounds(new ImageData(3, 3)), null, 'empty image');
});

test('trimToContent: margins are cut, content is kept', () => {
  const image = new ImageData(6, 5);
  /** @type {(x: number, y: number) => number} */
  const at = (x, y) => (y * 6 + x) * 4;
  image.data.set([10, 20, 30, 255], at(1, 2));
  image.data.set([40, 50, 60, 255], at(2, 2));
  const out = trimToContent(image);
  assertEqual([out.width, out.height], [2, 1], 'size fits the content');
  assertEqual(Array.from(out.data.subarray(0, 8)), [10, 20, 30, 255, 40, 50, 60, 255], 'colors in place');
});

test('trimToContent: padding adds transparent margins', () => {
  const image = new ImageData(5, 5);
  image.data.set([1, 2, 3, 255], (2 * 5 + 2) * 4);
  const out = trimToContent(image, { padding: 2 });
  assertEqual([out.width, out.height], [5, 5], 'pixel plus 2 px on each side');
  assertEqual(Array.from(out.data.subarray((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)), [1, 2, 3, 255], 'pixel in the center');
  assertEqual(out.data[3], 0, 'corner is transparent');
});

test('trimToContent: a fully transparent image keeps its size', () => {
  const empty = new ImageData(4, 3);
  const out = trimToContent(empty, { padding: 2 });
  assertEqual([out.width, out.height], [4, 3]);
  assert(out !== empty, 'must be a copy');
});

// ---- SPRITES ----

/** Alpha mask from rows: '#' opaque pixel, '.' transparent */
const ALPHA_LEGEND = { '#': [255, 255, 255, 255], '.': [0, 0, 0, 0] };

/**
 * Rects without the pixel count, easier to compare with expected values.
 * @param {Sprite[]} sprites
 */
function spriteRects(sprites) {
  return sprites.map(({ x, y, w, h }) => [x, y, w, h]);
}

test('alphaComponents: separate blobs and their rects', () => {
  const image = imageFromRows([
    '.##..#',
    '.##..#',
    '......',
    '###...',
  ], ALPHA_LEGEND);
  const parts = alphaComponents(image);
  assertEqual(spriteRects(parts), [[1, 0, 2, 2], [5, 0, 1, 2], [0, 3, 3, 1]]);
  assertEqual(parts.map((p) => p.pixels), [4, 2, 3], 'component pixel count');
});

test('alphaComponents: diagonal connectivity', () => {
  const image = imageFromRows(['#.', '.#'], ALPHA_LEGEND);
  assertEqual(alphaComponents(image, { connectivity: 8 }).length, 1, 'corner connects');
  assertEqual(alphaComponents(image, { connectivity: 4 }).length, 2, 'sides only');
});

test('alphaComponents: semi-transparent pixels are not content', () => {
  const image = imageFromRows(['#'], { '#': [255, 255, 255, CONFIG.ALPHA_OPAQUE_MIN - 1] });
  assertEqual(alphaComponents(image).length, 0);
});

test('mergeCloseSprites: a gap above the threshold keeps sprites separate', () => {
  /** @type {Sprite[]} */
  const parts = [
    { x: 0, y: 0, w: 2, h: 2, pixels: 4 },
    { x: 5, y: 0, w: 2, h: 2, pixels: 4 },
  ];
  assertEqual(spriteRects(mergeCloseSprites(parts, 2)), [[0, 0, 2, 2], [5, 0, 2, 2]], 'gap 3 > 2');
  assertEqual(spriteRects(mergeCloseSprites(parts, 3)), [[0, 0, 7, 2]], 'gap 3 <= 3');
});

test('mergeCloseSprites: a repeat pass catches a sprite next to the merged rect', () => {
  // X is far from each part alone but touches their combined rect
  /** @type {Sprite[]} */
  const parts = [
    { x: 0, y: 0, w: 5, h: 1, pixels: 5 },
    { x: 0, y: 2, w: 1, h: 5, pixels: 5 },
    { x: 6, y: 6, w: 1, h: 1, pixels: 1 },
  ];
  const merged = mergeCloseSprites(parts, 1);
  assertEqual(spriteRects(merged), [[0, 0, 7, 7]]);
  assertEqual(merged[0].pixels, 11, 'pixels add up');
});

test('sortSpritesReadingOrder: rows top to bottom, left to right within a row', () => {
  /** @type {Sprite[]} */
  const parts = [
    { x: 9, y: 1, w: 2, h: 3, pixels: 1 },
    { x: 0, y: 8, w: 2, h: 2, pixels: 1 },
    // Top edge 1 px above its row neighbor: rows are defined by overlap
    { x: 4, y: 0, w: 2, h: 3, pixels: 1 },
  ];
  assertEqual(spriteRects(sortSpritesReadingOrder(parts)), [[4, 0, 2, 3], [9, 1, 2, 3], [0, 8, 2, 2]]);
});

test('findSprites: sheet frames are found in reading order', () => {
  const image = imageFromRows([
    '##...##..',
    '##...##..',
    '.........',
    '...##....',
    '...##....',
  ], ALPHA_LEGEND);
  assertEqual(spriteRects(findSprites(image, { gap: 0 })), [[0, 0, 2, 2], [5, 0, 2, 2], [3, 3, 2, 2]]);
});

test('findSprites: minPixels filters out single dots', () => {
  const image = imageFromRows([
    '##...',
    '##..#',
  ], ALPHA_LEGEND);
  assertEqual(findSprites(image, { gap: 0 }).length, 2, 'dot counts as a sprite');
  assertEqual(spriteRects(findSprites(image, { gap: 0, minPixels: 2 })), [[0, 0, 2, 2]], 'dot dropped');
});

test('findSprites: an empty image gives no sprites', () => {
  assertEqual(findSprites(new ImageData(4, 4)), []);
});

test('spriteAt: the smallest of nested rects wins', () => {
  const saved = state.sprites;
  try {
    state.sprites = [
      { x: 0, y: 0, w: 10, h: 10, pixels: 100 },
      { x: 2, y: 2, w: 3, h: 3, pixels: 9 },
    ];
    assertEqual(spriteAt({ x: 3.5, y: 3.5 }), { x: 2, y: 2, w: 3, h: 3, pixels: 9 }, 'inside both');
    assertEqual(spriteAt({ x: 8.5, y: 8.5 }), { x: 0, y: 0, w: 10, h: 10, pixels: 100 }, 'outer only');
    assertEqual(spriteAt({ x: 10.5, y: 1 }), null, 'misses all');
  } finally {
    state.sprites = saved;
  }
});

test('spriteKey: the rect defines the key, pixel count does not', () => {
  assertEqual(spriteKey({ x: 1, y: 2, w: 3, h: 4, pixels: 5 }), spriteKey({ x: 1, y: 2, w: 3, h: 4, pixels: 9 }));
});

test('spriteFileName: number is zero-padded to the sprite count', () => {
  assertEqual(spriteFileName('3.jpg', 0, 10, 1), '3_01.png');
  assertEqual(spriteFileName('3.jpg', 9, 10, 1), '3_10.png');
  assertEqual(spriteFileName('3.jpg', 0, 120, 1), '3_001.png', 'width from the last number');
  assertEqual(spriteFileName('hero.png', 2, 4, 8), 'hero_03_x8.png', 'scale in the name');
  assertEqual(spriteFileName('', 0, 1, 1), 'image_01.png', 'no source name');
});

test('cropImage: the sprite rect cuts out its pixels', () => {
  const image = imageFromRows([
    '.....',
    '.##..',
    '.##..',
  ], ALPHA_LEGEND);
  const sprite = findSprites(image, { gap: 0 })[0];
  const part = cropImage(image, sprite);
  assertEqual([part.width, part.height], [2, 2]);
  assertEqual(alphaRows(part), ['##', '##']);
});

test('frameGridSprites: the grid cuts the sheet into equal frames in reading order', () => {
  const image = imageFromRows([
    '#..#',
    '....',
    '..#.',
    '#...',
  ], ALPHA_LEGEND);
  const sprites = frameGridSprites(image, { columns: 2, rows: 2 });
  assertEqual(spriteRects(sprites), [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]]);
  assertEqual(sprites.map((s) => s.pixels), [1, 1, 1, 1], 'pixels counted within the frame');
});

test('frameGridSprites: empty frames are filtered by minPixels', () => {
  const image = imageFromRows([
    '##..',
    '##..',
  ], ALPHA_LEGEND);
  assertEqual(frameGridSprites(image, { columns: 2, rows: 1 }).length, 1, 'empty frame dropped');
  assertEqual(frameGridSprites(image, { columns: 2, rows: 1, minPixels: 5 }).length, 0, 'threshold above the content');
});

test('frameGridSprites: sheet margins are cut before splitting into frames', () => {
  const image = imageFromRows([
    '......',
    '.#..#.',
    '......',
  ], ALPHA_LEGEND);
  assertEqual(spriteRects(frameGridSprites(image, { columns: 2, rows: 1, margin: 1 })), [[1, 1, 2, 1], [3, 1, 2, 1]]);
});

test('frameGridSprites: the remainder of a non-multiple size is spread across frames', () => {
  // 5 px over 2 columns: frames of 3 and 2 px, borders with no gaps or overlap
  const image = imageFromRows(['#####'], ALPHA_LEGEND);
  assertEqual(spriteRects(frameGridSprites(image, { columns: 2, rows: 1 })), [[0, 0, 3, 1], [3, 0, 2, 1]]);
});

test('frameGridSprites: a grid finer than the image gives no frames', () => {
  assertEqual(frameGridSprites(new ImageData(2, 2), { columns: 4, rows: 1 }), []);
});

test('packAtlas: frame sized by the largest sprite, aligned to bottom', () => {
  const image = imageFromRows([
    '#..##',
    '...##',
  ], ALPHA_LEGEND);
  const sprites = findSprites(image, { gap: 0 });
  assertEqual(spriteRects(sprites), [[0, 0, 1, 1], [3, 0, 2, 2]], 'source rects');
  const atlas = must(packAtlas(image, sprites, { columns: 2 }));
  assertEqual([atlas.frameW, atlas.frameH, atlas.columns, atlas.rows], [2, 2, 2, 1]);
  assertEqual([atlas.image.width, atlas.image.height], [4, 2]);
  // The small sprite sits at the bottom of its frame and is centered horizontally
  assertEqual(alphaRows(atlas.image), ['..##', '#.##']);
});

test('packAtlas: center alignment instead of bottom', () => {
  const image = imageFromRows([
    '#..###',
    '...###',
    '...###',
  ], ALPHA_LEGEND);
  const sprites = findSprites(image, { gap: 0 });
  const atlas = must(packAtlas(image, sprites, { columns: 2, isBottomAligned: false }));
  // The narrow sprite is centered horizontally too: one empty column on each side
  assertEqual(alphaRows(atlas.image), ['...###', '.#.###', '...###']);
});

test('packAtlas: default column count is close to square', () => {
  /** @type {Sprite[]} */
  const sprites = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, w: 1, h: 1, pixels: 1 }));
  const atlas = must(packAtlas(new ImageData(10, 1), sprites));
  assertEqual([atlas.columns, atlas.rows], [4, 3]);
  assertEqual(must(packAtlas(new ImageData(10, 1), sprites, { columns: 5 })).rows, 2, 'given column count');
  assertEqual(must(packAtlas(new ImageData(10, 1), sprites, { columns: 99 })).columns, 10, 'no more columns than sprites');
});

test('packAtlas: frames describe the cell and its opaque part', () => {
  const image = imageFromRows([
    '#..##',
    '...##',
  ], ALPHA_LEGEND);
  const atlas = must(packAtlas(image, findSprites(image, { gap: 0 }), { columns: 2 }));
  assertEqual(atlas.frames.length, 2, 'one frame per sprite');
  // 2x2 cell, 1x1 sprite centered horizontally and aligned to bottom
  assertEqual(atlas.frames[0], { x: 0, y: 0, w: 2, h: 2, trimmed: { x: 0, y: 1, w: 1, h: 1 } });
  // The large sprite fills the whole cell, so there are no margins
  assertEqual(atlas.frames[1], { x: 2, y: 0, w: 2, h: 2, trimmed: { x: 0, y: 0, w: 2, h: 2 } });
});

test('packAtlas: frames wrap to the second row', () => {
  /** @type {Sprite[]} */
  const sprites = Array.from({ length: 3 }, (_, i) => ({ x: i, y: 0, w: 1, h: 1, pixels: 1 }));
  const atlas = must(packAtlas(new ImageData(3, 1), sprites, { columns: 2 }));
  assertEqual(atlas.frames.map((f) => [f.x, f.y]), [[0, 0], [1, 0], [0, 1]]);
});

test('atlasMetadata: 1x describes the atlas as is', () => {
  const image = imageFromRows([
    '#..##',
    '...##',
  ], ALPHA_LEGEND);
  const atlas = must(packAtlas(image, findSprites(image, { gap: 0 }), { columns: 2 }));
  const meta = atlasMetadata(atlas, { sourceName: '3.jpg' });
  assertEqual(meta.image, '3_atlas_2x1_2x2.png');
  assertEqual([meta.scale, meta.width, meta.height], [1, 4, 2]);
  assertEqual([meta.frameW, meta.frameH, meta.columns, meta.rows], [2, 2, 2, 1]);
  assertEqual(meta.frames, atlas.frames, 'unscaled frames match the atlas');
});

test('atlasMetadata: scale multiplies all coordinates', () => {
  const image = imageFromRows([
    '#..##',
    '...##',
  ], ALPHA_LEGEND);
  const atlas = must(packAtlas(image, findSprites(image, { gap: 0 }), { columns: 2 }));
  const meta = atlasMetadata(atlas, { sourceName: '3.jpg', scale: 2 });
  assertEqual(meta.image, '3_atlas_2x1_4x4.png', 'file name also refers to the scaled atlas');
  assertEqual([meta.width, meta.height, meta.frameW, meta.frameH], [8, 4, 4, 4]);
  assertEqual([meta.columns, meta.rows], [2, 1], 'layout does not depend on scale');
  assertEqual(meta.frames[1], { x: 4, y: 0, w: 4, h: 4, trimmed: { x: 0, y: 0, w: 4, h: 4 } });
  assertEqual(meta.frames[0].trimmed, { x: 0, y: 2, w: 2, h: 2 }, 'margins inside the frame grow too');
  assertEqual(atlas.frames[0].trimmed, { x: 0, y: 1, w: 1, h: 1 }, 'source atlas untouched');
});

test('packAtlas: no sprites, no atlas', () => {
  assertEqual(packAtlas(new ImageData(2, 2), []), null);
});

test('atlasJsonFileName: scale suffix separates 1x and Nx files', () => {
  assertEqual(atlasJsonFileName('3.jpg', 1), '3_atlas.json');
  assertEqual(atlasJsonFileName('3.jpg', 2), '3_atlas_x2.json');
  assertEqual(atlasJsonFileName('', 1), 'image_atlas.json', 'no source name');
});

test('atlasFileName: frame size and layout in the name', () => {
  assertEqual(atlasFileName('3.jpg', { frameW: 55, frameH: 115, columns: 5, rows: 2 }, 1), '3_atlas_5x2_55x115.png');
  assertEqual(atlasFileName('3.jpg', { frameW: 55, frameH: 115, columns: 5, rows: 2 }, 4), '3_atlas_5x2_220x460.png');
});

// ---- PIPELINE ----

/**
 * Stub stage: copies the image and logs its name to the call list.
 * @param {string} name
 * @param {string} key
 * @param {string[]} calls
 * @returns {PipelineStage}
 */
function makeProbeStage(name, key, calls) {
  return {
    name,
    keys: [key],
    run: (image) => {
      calls.push(name);
      return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    },
  };
}

test('runPipelineWith: no stages returns the source', () => {
  const src = new ImageData(3, 2);
  const { image, recomputed } = runPipelineWith([], src, {}, createPipelineCache());
  assert(image === src, 'the same object must be returned');
  assertEqual(recomputed, []);
});

test('runPipelineWith: the cache recomputes only the changed stage and later ones', () => {
  /** @type {string[]} */
  const calls = [];
  const stages = [makeProbeStage('a', 'pa', calls), makeProbeStage('b', 'pb', calls), makeProbeStage('c', 'pc', calls)];
  const src = new ImageData(2, 2);
  const cache = createPipelineCache();
  const run = (/** @type {PipelineParams} */ params) => runPipelineWith(stages, src, params, cache).recomputed;

  assertEqual(run({ pa: 1, pb: 1, pc: 1 }), ['a', 'b', 'c'], 'first run');
  assertEqual(run({ pa: 1, pb: 1, pc: 1 }), [], 'no changes');
  assertEqual(run({ pa: 1, pb: 2, pc: 1 }), ['b', 'c'], 'b changed');
  assertEqual(run({ pa: 1, pb: 2, pc: 3 }), ['c'], 'c changed');
  assertEqual(run({ pa: 9, pb: 2, pc: 3 }), ['a', 'b', 'c'], 'a changed');
  assertEqual(run({ pa: 9, pb: 2, pc: 3, unrelated: 1 }), [], 'unrelated parameter');
  assertEqual(calls.length, 9, 'total run calls');
});

test('runPipelineWith: outputs holds every stage output, cached ones included', () => {
  /** @type {string[]} */
  const calls = [];
  const stages = [makeProbeStage('a', 'pa', calls), makeProbeStage('b', 'pb', calls)];
  const src = new ImageData(2, 2);
  const cache = createPipelineCache();
  const first = runPipelineWith(stages, src, { pa: 1, pb: 1 }, cache);
  assertEqual(Object.keys(first.outputs), ['a', 'b']);
  assert(first.outputs.b === first.image, 'the last stage output is the result');
  const second = runPipelineWith(stages, src, { pa: 1, pb: 1 }, cache);
  assert(second.outputs.a === first.outputs.a, 'same object from the cache');
});

test('runPipelineWith: a new source recomputes everything', () => {
  /** @type {string[]} */
  const calls = [];
  const stages = [makeProbeStage('a', 'pa', calls), makeProbeStage('b', 'pb', calls)];
  const cache = createPipelineCache();
  runPipelineWith(stages, new ImageData(2, 2), { pa: 1, pb: 1 }, cache);
  const { recomputed } = runPipelineWith(stages, new ImageData(2, 2), { pa: 1, pb: 1 }, cache);
  assertEqual(recomputed, ['a', 'b']);
});

test('runPipelineWith: a cached result is the same object', () => {
  const stages = [makeProbeStage('a', 'pa', [])];
  const src = new ImageData(2, 2);
  const cache = createPipelineCache();
  const first = runPipelineWith(stages, src, { pa: 1 }, cache).image;
  const second = runPipelineWith(stages, src, { pa: 1 }, cache).image;
  assert(first === second, 'expected the cached object');
  assert(first !== src, 'the stage must return a new object');
});

runTests();
