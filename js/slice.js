// Step 1 of slicing: cut the 3D model into flat layers.
//
// For each layer height z we find every triangle that crosses z. Each one
// crosses in a short line segment. Join the segments end to end and you get
// closed outlines ("loops") - the shape of the model at that height.
//
// We hand the loops to Clipper, a polygon library, which works out which
// loops are outsides and which are holes.
//
// Clipper works in whole numbers, so all 2D coordinates from here on are in
// microns (1 mm = 1000). See SCALE.

import ClipperLib from "../lib/clipper.mjs";

export const SCALE = 1000;
export { ClipperLib };

// Heights (mm) of the top of each layer.
export function layerTops(modelHeight, layerHeight, firstLayerHeight) {
  const tops = [];
  let z = firstLayerHeight;
  // keep adding layers until we pass the top of the model
  while (z - layerHeight / 2 < modelHeight + 1e-6) {
    tops.push(+z.toFixed(4));
    z += layerHeight;
  }
  if (tops.length === 0) tops.push(firstLayerHeight);
  return tops;
}

// Returns one entry per plane: an array of polygons (Clipper Paths).
export function sliceMesh(positions, planes) {
  const triCount = positions.length / 9;

  // Pre-compute the lowest and highest point of every triangle, and sort
  // triangles by their lowest point so each layer only looks at nearby ones.
  const zMin = new Float32Array(triCount);
  const zMax = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = positions[t * 9 + 2], b = positions[t * 9 + 5], c = positions[t * 9 + 8];
    zMin[t] = Math.min(a, b, c);
    zMax[t] = Math.max(a, b, c);
  }
  const order = Array.from({ length: triCount }, (_, i) => i).sort((a, b) => zMin[a] - zMin[b]);

  const result = [];
  let active = []; // triangles that might cross the current plane
  let next = 0;
  for (const z of planes) {
    while (next < triCount && zMin[order[next]] <= z) active.push(order[next++]);
    active = active.filter((t) => zMax[t] >= z);

    const segments = [];
    for (const t of active) {
      const seg = cutTriangle(positions, t * 9, z);
      if (seg) segments.push(seg);
    }
    result.push(cleanPolygons(joinSegments(segments)));
  }
  return result;
}

// Where does one triangle cross height z? Returns [x1,y1,x2,y2] in microns.
function cutTriangle(p, o, z) {
  const pts = [];
  for (let e = 0; e < 3; e++) {
    let a = o + e * 3;
    let b = o + ((e + 1) % 3) * 3;
    // A corner exactly on the plane counts as "above" - avoids double hits.
    const aAbove = p[a + 2] >= z;
    const bAbove = p[b + 2] >= z;
    if (aAbove === bAbove) continue;
    // Always calculate from the lower corner, so neighbouring triangles that
    // share this edge get exactly the same point and the loop joins up.
    if (p[a + 2] > p[b + 2] || (p[a + 2] === p[b + 2] && p[a] > p[b])) [a, b] = [b, a];
    const t = (z - p[a + 2]) / (p[b + 2] - p[a + 2]);
    pts.push(
      Math.round((p[a] + (p[b] - p[a]) * t) * SCALE),
      Math.round((p[a + 1] + (p[b + 1] - p[a + 1]) * t) * SCALE),
    );
  }
  if (pts.length !== 4) return null;
  if (pts[0] === pts[2] && pts[1] === pts[3]) return null; // zero length
  return pts;
}

// Join segments that share end points into loops.
function joinSegments(segments) {
  const key = (x, y) => x + "," + y;
  const byPoint = new Map();
  segments.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(i);
    }
  });

  const used = new Uint8Array(segments.length);
  const loops = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segments[i];
    const loop = [{ X: s[0], Y: s[1] }, { X: s[2], Y: s[3] }];
    const startKey = key(s[0], s[1]);
    let cur = { x: s[2], y: s[3] };
    for (;;) {
      const k = key(cur.x, cur.y);
      if (k === startKey) { loop.pop(); break; } // closed!
      const nextIdx = (byPoint.get(k) || []).find((j) => !used[j]);
      if (nextIdx === undefined) break; // gap in the model - close it anyway
      used[nextIdx] = 1;
      const n = segments[nextIdx];
      cur = n[0] === cur.x && n[1] === cur.y ? { x: n[2], y: n[3] } : { x: n[0], y: n[1] };
      loop.push({ X: cur.x, Y: cur.y });
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Tidy loops: merge overlaps, decide outsides vs holes (even-odd rule),
// and drop points that are too close together to matter.
function cleanPolygons(loops) {
  if (loops.length === 0) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(loops, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
  const cleaned = ClipperLib.Clipper.CleanPolygons(out, 10); // 10 microns
  return cleaned.filter((p) => p.length >= 3 && Math.abs(ClipperLib.Clipper.Area(p)) > 100 * 100);
}
