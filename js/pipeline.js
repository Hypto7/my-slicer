// The whole slicer, start to finish:
//
//   model triangles -> layer outlines -> walls + infill -> G-code
//
// slice() returns the G-code text, some stats, and the toolpaths in a
// compact form the 3D preview can draw.

import { bounds } from "./stl.js";
import { layerTops, sliceMesh, SCALE, ClipperLib } from "./slice.js";
import {
  makeWalls, fillLines, orderLoops, orderLines,
  offset, union, intersect, subtract, removeSlivers,
} from "./toolpaths.js";

// Kinds of line, used for G-code comments and preview colours.
export const TYPES = ["SKIRT", "WALL-OUTER", "WALL-INNER", "SOLID", "INFILL"];
const SKIRT = 0, OUTER = 1, INNER = 2, SOLID = 3, INFILL = 4;

export function slice(positions, s, onProgress = () => {}) {
  const warnings = [];
  const box = bounds(positions);
  if (box.min[0] < 0 || box.min[1] < 0 || box.max[0] > s.bedX || box.max[1] > s.bedY) {
    warnings.push("The model is bigger than the bed. Try scaling it down.");
  }
  if (box.max[2] > s.maxZ) warnings.push("The model is taller than the printer can print.");

  // ---- 1. Cut into layers ----
  const tops = layerTops(box.max[2], s.layerHeight, s.firstLayerHeight);
  const heights = tops.map((_, i) => (i === 0 ? s.firstLayerHeight : s.layerHeight));
  const planes = tops.map((t, i) => t - heights[i] / 2); // cut through the middle of each layer
  onProgress(0.05, "Cutting layers");
  const outlines = sliceMesh(positions, planes);
  const n = outlines.length;

  // ---- 2. Walls ----
  onProgress(0.3, "Making walls");
  const lw = s.lineWidth;
  const shells = outlines.map((o) => makeWalls(o, s.walls, lw));

  // ---- 3. Work out which parts need solid top/bottom skin ----
  // A spot needs solid skin if, within `topLayers` layers above it, there's
  // a layer that doesn't cover it (it's near a top surface). Same for bottom.
  onProgress(0.45, "Finding top and bottom surfaces");
  const regions = shells.map((sh, i) => {
    const inner = sh.inner;
    const solid = union(
      exposed(inner, shells, i, +1, s.topLayers),
      exposed(inner, shells, i, -1, s.bottomLayers),
    );
    // Little leftover bits of sparse infill are better printed solid.
    const sparse = removeSlivers(subtract(inner, solid), lw * 3);
    // ...and hair-thin solid slivers left over from rounding are dropped.
    return { solid: removeSlivers(subtract(inner, sparse), lw / 2), sparse };
  });

  // ---- 4. Paths for every layer, in printing order ----
  onProgress(0.6, "Planning paths");
  let pos = { X: 0, Y: 0 };
  const layers = [];
  for (let i = 0; i < n; i++) {
    const moves = []; // { type, path }
    const add = (type, r) => { for (const p of r.paths) moves.push({ type, path: p }); pos = r.pos; };

    if (i === 0 && s.skirtLoops > 0 && outlines[0].length) {
      // only go around the outsides of the model, not around its holes
      const outsides = outlines[0].filter((p) => ClipperLib.Clipper.Orientation(p));
      const loops = [];
      for (let k = 0; k < s.skirtLoops; k++) {
        const ring = offset(outsides, s.skirtDistance + lw / 2 + k * lw, ClipperLib.JoinType.jtRound);
        loops.push(...ring.filter((p) => ClipperLib.Clipper.Orientation(p)));
      }
      add(SKIRT, orderLoops(loops.reverse(), pos));
    }

    // walls: inside ones first, outer wall last for a cleaner surface
    const w = shells[i].walls;
    for (let k = w.length - 1; k >= 0; k--) add(k === 0 ? OUTER : INNER, orderLoops(w[k], pos));

    // solid skin: tight lines, crossing direction every layer
    const angle = i % 2 === 0 ? 45 : 135;
    add(SOLID, orderLines(fillLines(regions[i].solid, lw, angle), pos));

    // sparse infill
    const d = s.infill / 100;
    if (d > 0) {
      let lines;
      if (s.pattern === "grid") {
        const spacing = (2 * lw) / d;
        lines = [...fillLines(regions[i].sparse, spacing, 45), ...fillLines(regions[i].sparse, spacing, 135)];
      } else {
        lines = fillLines(regions[i].sparse, lw / d, angle);
      }
      add(INFILL, orderLines(lines, pos));
    }
    layers.push(moves);
    if (i % 10 === 0) onProgress(0.6 + (0.3 * i) / n, `Planning layer ${i + 1} of ${n}`);
  }

  // ---- 5. Write G-code ----
  onProgress(0.9, "Writing G-code");
  const out = writeGcode(layers, tops, heights, s);
  out.warnings = warnings;
  out.layerCount = n;
  onProgress(1, "Done");
  return out;
}

// Parts of `inner` (layer i) not covered by all of the next `count` layers
// in direction `dir` (+1 = above, -1 = below).
function exposed(inner, shells, i, dir, count) {
  if (count <= 0 || !inner.length) return [];
  let cover = null;
  for (let j = 1; j <= count; j++) {
    const k = i + dir * j;
    if (k < 0 || k >= shells.length) return inner; // close to the very top/bottom
    cover = cover === null ? shells[k].inner : intersect(cover, shells[k].inner);
    if (!cover.length) return inner;
  }
  return subtract(inner, cover);
}

// ---------------- G-code ----------------

function writeGcode(layers, tops, heights, s) {
  const filamentArea = Math.PI * (s.filament / 2) ** 2;
  const g = [];
  const f3 = (v) => (+v.toFixed(3)).toString();
  const f5 = (v) => (+v.toFixed(5)).toString();

  // preview data
  const segs = []; // x1,y1,z1,x2,y2,z2 ...
  const segTypes = [];
  const layerEnds = [];

  let x = 0, y = 0, time = 0, filament = 0, retracted = false, lastF = 0;
  const feed = (mmPerSec) => {
    const F = Math.round(mmPerSec * 60);
    if (F === lastF) return "";
    lastF = F;
    return ` F${F}`;
  };

  g.push(
    "; Generated by my-slicer - https://github.com/Hypto7/my-slicer",
    `; layer_height = ${s.layerHeight}, walls = ${s.walls}, infill = ${s.infill}% ${s.pattern}`,
    `;LAYER_COUNT:${layers.length}`,
    `M140 S${s.bedTemp} ; start heating bed`,
    `M104 S${s.nozzleTemp} ; start heating nozzle`,
    "G28 ; home all axes",
    `M190 S${s.bedTemp} ; wait for bed`,
    `M109 S${s.nozzleTemp} ; wait for nozzle`,
    "G90 ; absolute positions",
    "M83 ; relative extrusion",
    "M107 ; fan off",
    "; purge line along the left edge of the bed",
    "G1 Z0.3 F3000",
    "G1 X3 Y20 F6000",
    `G1 X3 Y${f3(Math.min(120, s.bedY - 20))} E${f5(purgeE(s, Math.min(100, s.bedY - 40)))} F1200`,
    "G1 X3.5 F3000",
    `G1 X3.5 Y20 E${f5(purgeE(s, Math.min(100, s.bedY - 40)))} F1200`,
    "G1 Z2 F3000",
  );
  x = 3.5; y = 20;
  lastF = 0;

  layers.forEach((moves, i) => {
    const z = tops[i];
    const ePerMm = (s.lineWidth * heights[i]) / filamentArea;
    g.push(`;LAYER:${i}`, `G1 Z${f3(z)} F600`);
    lastF = 600;
    time += heights[i] / 10;
    if (i === 1 && s.fan > 0) g.push(`M106 S${Math.round(s.fan * 2.55)} ; fan on`);
    let lastType = -1;

    for (const { type, path } of moves) {
      if (type !== lastType) { g.push(`;TYPE:${TYPES[type]}`); lastType = type; }
      const sx = path[0].X / SCALE, sy = path[0].Y / SCALE;

      // travel to the start of the path
      const travel = Math.hypot(sx - x, sy - y);
      if (travel > 0.01) {
        if (travel > 2 && s.retractLength > 0 && !retracted) {
          g.push(`G1 E-${f5(s.retractLength)}${feed(s.retractSpeed)}`);
          retracted = true;
          time += s.retractLength / s.retractSpeed;
        }
        g.push(`G0 X${f3(sx)} Y${f3(sy)}${feed(s.speedTravel)}`);
        time += travel / s.speedTravel;
        x = sx; y = sy;
      }
      if (retracted) {
        g.push(`G1 E${f5(s.retractLength)}${feed(s.retractSpeed)}`);
        retracted = false;
        time += s.retractLength / s.retractSpeed;
      }

      // extrude along the path
      let speed = type === INFILL || type === SOLID ? s.speedInfill : s.speedWall;
      if (type === OUTER) speed *= 0.75; // outer wall a bit slower = nicer surface
      if (i === 0) speed = s.speedFirst;
      for (let p = 1; p < path.length; p++) {
        const px = path[p].X / SCALE, py = path[p].Y / SCALE;
        const len = Math.hypot(px - x, py - y);
        if (len < 0.001) continue;
        const e = len * ePerMm;
        g.push(`G1 X${f3(px)} Y${f3(py)} E${f5(e)}${feed(speed)}`);
        segs.push(x, y, z, px, py, z);
        segTypes.push(type);
        filament += e;
        time += len / speed;
        x = px; y = py;
      }
    }
    layerEnds.push(segTypes.length);
  });

  g.push(
    "; end",
    "M107 ; fan off",
    `G1 E-2${feed(s.retractSpeed)}`,
    `G0 Z${f3(Math.min(tops[tops.length - 1] + 10, s.maxZ))} F600 ; lift`,
    `G0 X5 Y${f3(s.bedY - 10)} F6000 ; present the print`,
    "M104 S0 ; nozzle off",
    "M140 S0 ; bed off",
    "M84 ; motors off",
    "",
  );

  const filamentGrams = filament * filamentArea * s.density / 1000;
  return {
    gcode: g.join("\n"),
    stats: { time, filamentMm: filament, filamentGrams },
    preview: {
      segments: new Float32Array(segs),
      types: new Uint8Array(segTypes),
      layerEnds: Uint32Array.from(layerEnds),
      layerTops: Float32Array.from(tops),
    },
  };
}

function purgeE(s, length) {
  // a thick line: 0.8 mm wide, 0.3 mm tall
  return (0.8 * 0.3 * length) / (Math.PI * (s.filament / 2) ** 2);
}
