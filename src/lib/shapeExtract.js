// Extract a clean SVG outline path from an uploaded image.
//
// Pipeline (all client-side, no API):
//   1. Draw the image to a 256x256 canvas, preserving aspect ratio.
//   2. Sample background colour from the four corners (5x5 box each)
//      and build a binary mask: pixels far enough from every sampled
//      colour are "subject"; pixels close to any sample are "background".
//      Threshold is tunable so the user can dial it in for busier
//      backgrounds.
//   3. Flood-fill from each corner across the background pixels to
//      catch anti-aliased halos and disconnected bg specks; anything
//      still standing is the subject.
//   4. Keep the largest connected subject component (drops noise).
//   5. Trace its boundary with Moore-neighbour contour tracing.
//   6. Simplify the polygon with Douglas–Peucker (~3000 → ~120 points).
//   7. Normalise into a 0..100 viewBox so the path drops into
//      SHAPE_DEFS alongside the built-in shapes.
//
// Returns { path, points, preview } — preview is a data URL of the
// extracted silhouette filled black-on-white, useful for the library
// tile thumbnail.

const PROC = 256;

export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function drawToCanvas(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const ratio = Math.min(size / img.width, size / img.height);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return { canvas, ctx };
}

// Sample 5x5 boxes from each of 8 perimeter locations (4 corners + 4
// edge midpoints), so a textured/gradient background gets represented
// by several reference colours rather than only the corners. Returns
// a flat [[r,g,b], ...] list.
function samplePerimeter(data, W, H) {
  const samples = [];
  const add = (sx, sy) => {
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        const x = Math.min(W - 1, Math.max(0, sx + dx));
        const y = Math.min(H - 1, Math.max(0, sy + dy));
        const i = (y * W + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  };
  // 4 corners
  add(0, 0); add(W - 5, 0); add(0, H - 5); add(W - 5, H - 5);
  // 4 edge midpoints
  const mx = Math.floor(W / 2) - 2, my = Math.floor(H / 2) - 2;
  add(mx, 0); add(mx, H - 5); add(0, my); add(W - 5, my);
  return samples;
}

// Build a binary mask: 1 = subject, 0 = background.
function buildMask(imageData, threshold) {
  const { data, width, height } = imageData;
  const samples = samplePerimeter(data, width, height);
  const t2 = threshold * threshold;
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    let near = false;
    for (let s = 0; s < samples.length; s++) {
      const sr = samples[s][0], sg = samples[s][1], sb = samples[s][2];
      const d = (r - sr) * (r - sr) + (g - sg) * (g - sg) + (b - sb) * (b - sb);
      if (d <= t2) { near = true; break; }
    }
    mask[p] = near ? 0 : 1;
  }
  // Flood-fill from each corner across background pixels to clean
  // disconnected bg specks and halos. We need 0-pixels to be reachable
  // from a corner; anything not reached we'll later treat as subject
  // (in case the threshold was too tight). For now we use it to
  // dilate the background slightly.
  const bgReach = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (mask[i] === 0 && !bgReach[i]) { bgReach[i] = 1; stack.push(i); }
  };
  push(0, 0); push(width - 1, 0); push(0, height - 1); push(width - 1, height - 1);
  while (stack.length) {
    const i = stack.pop();
    const x = i % width, y = (i / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  // A "true background" pixel was originally 0 AND reachable from a
  // corner. Anything 0-but-unreachable was a hole-in-subject — flip
  // it back to subject (fills small interior gaps from texture noise).
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 && !bgReach[i]) mask[i] = 1;
  }
  return mask;
}

// Morphological dilate — every off-pixel that has any on-neighbour
// (8-conn) flips on. Iterating thickens the subject region.
function dilate(src, W, H, iterations = 1) {
  let cur = src;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cur[i]) { next[i] = 1; continue; }
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy++) {
          for (let dx = -1; dx <= 1 && !on; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && cur[ny * W + nx]) on = 1;
          }
        }
        next[i] = on;
      }
    }
    cur = next;
  }
  return cur;
}

// Morphological erode — every on-pixel that has any off-neighbour
// (8-conn) flips off. Iterating thins the subject region.
function erode(src, W, H, iterations = 1) {
  let cur = src;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!cur[i]) continue;
        let allOn = 1;
        outer:
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) { allOn = 0; break outer; }
            if (!cur[ny * W + nx]) { allOn = 0; break outer; }
          }
        }
        next[i] = allOn;
      }
    }
    cur = next;
  }
  return cur;
}

// Morphological closing — dilate then erode. Fills small holes in
// the subject and bridges narrow gaps between fragments. This is the
// key step that prevents leaf-vein textures or noise from shattering
// the subject into many tiny components.
function closeMask(mask, W, H, iterations = 2) {
  return erode(dilate(mask, W, H, iterations), W, H, iterations);
}

// Connected-component labelling (8-connected, so diagonal contacts
// keep neighbouring pixels in the same component). Returns labels
// array and a size-per-label map. Background pixels get label 0.
function labelComponents(mask, W, H) {
  const labels = new Int32Array(W * H);
  const sizes = [0];
  let next = 1;
  const stack = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i] && !labels[i]) {
        labels[i] = next;
        sizes.push(0);
        stack.push(i);
        while (stack.length) {
          const j = stack.pop();
          sizes[next]++;
          const jx = j % W, jy = (j / W) | 0;
          const neigh = [
            [jx+1,jy],[jx-1,jy],[jx,jy+1],[jx,jy-1],
            [jx+1,jy+1],[jx+1,jy-1],[jx-1,jy+1],[jx-1,jy-1],
          ];
          for (const [nx, ny] of neigh) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (mask[ni] && !labels[ni]) { labels[ni] = next; stack.push(ni); }
          }
        }
        next++;
      }
    }
  }
  // Find the biggest component.
  let bestLabel = 0, bestSize = 0;
  for (let l = 1; l < next; l++) {
    if (sizes[l] > bestSize) { bestSize = sizes[l]; bestLabel = l; }
  }
  // Keep only that component in the mask.
  for (let i = 0; i < mask.length; i++) {
    mask[i] = labels[i] === bestLabel ? 1 : 0;
  }
  return mask;
}

// Moore-neighbour contour tracing. Returns ordered [{x,y}, …] points
// around the outer boundary of the (single, connected) subject.
function traceContour(mask, W, H) {
  // Find the top-left-most subject pixel.
  let sx = -1, sy = -1;
  outer:
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx === -1) return [];

  // 8-neighbour offsets clockwise starting at east.
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1,  1,  0, -1,-1,-1];
  const isSubject = (x, y) =>
    x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;

  const points = [];
  let cx = sx, cy = sy;
  let entryDir = 4; // we entered from the west (came from -1 to 0)
  const startX = sx, startY = sy;

  const maxSteps = W * H * 4;
  for (let step = 0; step < maxSteps; step++) {
    points.push({ x: cx, y: cy });
    // Search neighbours clockwise starting from one position past the
    // entry direction. Looking at entryDir itself would let us walk
    // straight back to the previous pixel — Moore-Neighbour requires
    // skipping it. The first subject neighbour found becomes the next
    // boundary pixel.
    let nextDir = -1;
    for (let i = 0; i < 8; i++) {
      const d = (entryDir + 1 + i) % 8;
      const nx = cx + dx[d], ny = cy + dy[d];
      if (isSubject(nx, ny)) { nextDir = d; break; }
    }
    if (nextDir === -1) break; // isolated pixel
    cx = cx + dx[nextDir];
    cy = cy + dy[nextDir];
    entryDir = (nextDir + 4) % 8;
    if (cx === startX && cy === startY && points.length > 2) break;
  }
  return points;
}

// Douglas–Peucker. Recursively drops points that lie within `epsilon`
// of the line between the segment endpoints. Returns a simplified
// point array.
function simplifyDP(points, epsilon) {
  if (points.length < 3) return points.slice();
  const sq = (a) => a * a;
  const perpSq = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return sq(p.x - a.x) + sq(p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const tc = Math.max(0, Math.min(1, t));
    const px = a.x + tc * dx, py = a.y + tc * dy;
    return sq(p.x - px) + sq(p.y - py);
  };
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const e2 = epsilon * epsilon;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxD = 0, maxI = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpSq(points[i], points[lo], points[hi]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxI !== -1 && maxD > e2) {
      keep[maxI] = 1;
      stack.push([lo, maxI]);
      stack.push([maxI, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Normalise points into a 0..100 viewBox preserving aspect, centred.
function normalize(points, W, H) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = 96 / Math.max(w, h); // fit into 96 with a 2px margin
  const offX = (100 - w * scale) / 2 - minX * scale;
  const offY = (100 - h * scale) / 2 - minY * scale;
  return points.map(p => ({
    x: p.x * scale + offX,
    y: p.y * scale + offY,
  }));
}

function pathFromPoints(pts) {
  if (!pts.length) return '';
  let s = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    s += `L${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return s + 'Z';
}

// Render the extracted subject WITH its original colours by masking
// the source image: subject pixels keep their RGB, background pixels
// go transparent. The dataURL is what gets stored as the saved shape's
// preview and shown in the library tile + modal — so the user sees
// their actual leaf (or whatever they uploaded), not a black silhouette.
function renderSubjectImage(srcImageData, labelledMask, W, H) {
  // Find the bounding box of the subject so we can crop tightly and
  // not waste pixels on transparent border space.
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (labelledMask[y * W + x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return ''; // no subject pixels
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const c = document.createElement('canvas');
  c.width = cropW; c.height = cropH;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(cropW, cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcI = ((y + minY) * W + (x + minX)) * 4;
      const dstI = (y * cropW + x) * 4;
      if (labelledMask[(y + minY) * W + (x + minX)]) {
        out.data[dstI]     = srcImageData.data[srcI];
        out.data[dstI + 1] = srcImageData.data[srcI + 1];
        out.data[dstI + 2] = srcImageData.data[srcI + 2];
        out.data[dstI + 3] = 255;
      } else {
        out.data[dstI + 3] = 0;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}

// Render the current binary mask to a dataURL — useful diagnostic
// when extraction returns empty (the user can see what the pipeline
// is classifying as subject vs background).
function renderMaskPreview(mask, W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(W, H);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 26 : 255;
    out.data[i * 4]     = v;
    out.data[i * 4 + 1] = v;
    out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL();
}

// Top-level — run the whole pipeline on a data URL.
//
//   threshold: RGB-distance (0..255). Higher = more bg pixels (busier
//              backgrounds need higher). Lower = strict matching (only
//              near-identical bg colors collapse). 90 is a balanced
//              default that handles most real photos.
//   epsilon:   Douglas-Peucker tolerance in pixel units. ~1.5 is a
//              good default; raise to 3 for chunkier shapes.
export async function extractShape(dataUrl, { threshold = 90, epsilon = 1.5 } = {}) {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = drawToCanvas(img, PROC);
  const imageData = ctx.getImageData(0, 0, PROC, PROC);
  const rawMask = buildMask(imageData, threshold);
  // Morphological closing — bridges narrow gaps and fills small bg
  // holes inside the subject (the leaf-vein case). Two iterations are
  // enough for most photo noise; more would over-smooth the silhouette.
  const closedMask = closeMask(rawMask, PROC, PROC, 2);
  const subjectPixels = closedMask.reduce((n, v) => n + v, 0);
  const coverage = subjectPixels / closedMask.length;
  // Diagnostic mask preview always available so the modal can show
  // the user what was detected when no contour is produced.
  const maskPreview = renderMaskPreview(closedMask, PROC, PROC);
  // labelComponents mutates the mask in place keeping only the biggest
  // 8-connected component, and reports its pixel count via the returned
  // mask sum.
  const labelled = labelComponents(new Uint8Array(closedMask), PROC, PROC);
  const biggestPixels = labelled.reduce((n, v) => n + v, 0);
  const fragmented = subjectPixels > 200 && biggestPixels < subjectPixels * 0.35;
  const contour = traceContour(labelled, PROC, PROC);
  if (contour.length < 8) {
    return {
      path: '', points: [], preview: '',
      empty: true, coverage, maskPreview, fragmented,
      biggestRatio: subjectPixels ? biggestPixels / subjectPixels : 0,
    };
  }
  const simplified = simplifyDP(contour, epsilon);
  const normalized = normalize(simplified, PROC, PROC);
  return {
    path: pathFromPoints(normalized),
    points: normalized,
    preview: renderSubjectImage(imageData, labelled, PROC, PROC),
    pointCount: normalized.length,
    coverage,
    maskPreview,
    fragmented,
    biggestRatio: subjectPixels ? biggestPixels / subjectPixels : 0,
  };
}
