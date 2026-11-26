// Step 2 of slicing: turn each layer's outline into nozzle paths.
//
//   Walls  - copies of the outline, shrunk inwards one line-width at a time
//   Solid  - tightly packed lines on the top and bottom surfaces
//   Infill - sparse lines (a grid) inside, to save plastic and time
//   Skirt  - a loop around the model on layer 1, to get the plastic flowing
//
// All coordinates are in microns (see SCALE in slice.js).

import { ClipperLib, SCALE } from "./slice.js";

const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = ClipperLib;

// ---------- small polygon helpers ----------

export function offset(paths, deltaMm, join = JoinType.jtMiter) {
  if (!paths.length) return [];
  const co = new ClipperOffset(2, 0.01 * SCALE);
  co.AddPaths(paths, join, EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, deltaMm * SCALE);
  return out;
}

function boolOp(type, a, b) {
  if (!a.length) return type === ClipType.ctUnion ? b : [];
  const c = new Clipper();
  c.AddPaths(a, PolyType.ptSubject, true);
  if (b.length) c.AddPaths(b, PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}
export const union = (a, b) => boolOp(ClipType.ctUnion, a, b);
export const intersect = (a, b) => boolOp(ClipType.ctIntersection, a, b);
export const subtract = (a, b) => boolOp(ClipType.ctDifference, a, b);

export function area(paths) {
  return paths.reduce((s, p) => s + Clipper.Area(p), 0) / (SCALE * SCALE);
}

// ---------- walls ----------

// Returns { walls: [[loops of wall 0 (outer)], [loops of wall 1], ...], inner }
// "inner" is the area left inside the walls, which gets filled with infill.
export function makeWalls(outline, count, lineWidth) {
  const walls = [];
  for (let k = 0; k < count; k++) {
    const loops = offset(outline, -(lineWidth / 2 + k * lineWidth));
    if (!loops.length) break; // too thin for more walls
    walls.push(loops);
  }
  // Let infill overlap the innermost wall by 15% so they stick together.
  const inner = offset(outline, -(count - 0.15) * lineWidth);
  return { walls, inner };
}

// ---------- infill lines ----------

// Parallel lines at `angleDeg`, `spacing` mm apart, clipped to `region`.
// Lines are lined up to a fixed grid so they stack neatly layer to layer.
export function fillLines(region, spacing, angleDeg) {
  if (!region.length || spacing <= 0) return [];
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a); // along the line
  const nx = -dy, ny = dx; // across the lines

  // How far the region stretches in each direction
  let minN = Infinity, maxN = -Infinity, minD = Infinity, maxD = -Infinity;
  for (const p of region) for (const pt of p) {
    const n = pt.X * nx + pt.Y * ny, d = pt.X * dx + pt.Y * dy;
    if (n < minN) minN = n; if (n > maxN) maxN = n;
    if (d < minD) minD = d; if (d > maxD) maxD = d;
  }
  const s = spacing * SCALE;
  const lines = [];
  for (let k = Math.ceil(minN / s); k * s <= maxN; k++) {
    const o = k * s;
    lines.push([
      { X: Math.round(nx * o + dx * (minD - 1)), Y: Math.round(ny * o + dy * (minD - 1)) },
      { X: Math.round(nx * o + dx * (maxD + 1)), Y: Math.round(ny * o + dy * (maxD + 1)) },
    ]);
  }
  if (!lines.length) return [];

  // Cut the long lines down to just the parts inside the region.
  const c = new Clipper();
  c.AddPaths(lines, PolyType.ptSubject, false);
  c.AddPaths(region, PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return Clipper.OpenPathsFromPolyTree(tree).filter((l) => l.length >= 2);
}

// ---------- ordering ----------

const dist2 = (a, b) => (a.X - b.X) ** 2 + (a.Y - b.Y) ** 2;

// Print loops in an order that keeps travel short. Each loop starts at the
// corner closest to where the nozzle already is.
export function orderLoops(loops, pos) {
  const left = loops.slice();
  const out = [];
  while (left.length) {
    let best = 0, bestI = 0, bestD = Infinity;
    left.forEach((loop, li) => loop.forEach((pt, pi) => {
      const d = dist2(pt, pos);
      if (d < bestD) { bestD = d; best = li; bestI = pi; }
    }));
    const loop = left.splice(best, 1)[0];
    const rotated = loop.slice(bestI).concat(loop.slice(0, bestI));
    rotated.push(rotated[0]); // close the loop
    out.push(rotated);
    pos = rotated[0];
  }
  return { paths: out, pos };
}

// Print lines nearest-first, flipping each one if its far end is closer.
export function orderLines(lines, pos) {
  const left = lines.slice();
  const out = [];
  while (left.length) {
    let best = 0, flip = false, bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const l = left[i];
      const d0 = dist2(l[0], pos), d1 = dist2(l[l.length - 1], pos);
      if (d0 < bestD) { bestD = d0; best = i; flip = false; }
      if (d1 < bestD) { bestD = d1; best = i; flip = true; }
    }
    let l = left.splice(best, 1)[0];
    if (flip) l = l.slice().reverse();
    out.push(l);
    pos = l[l.length - 1];
  }
  return { paths: out, pos };
}

// Remove slivers thinner than `width` mm (they can't be printed well anyway).
export function removeSlivers(region, width) {
  return offset(offset(region, -width / 2), width / 2);
}
