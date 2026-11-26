// Automatic checks. Run with:  npm test   (or: node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseSTL, bounds, placeOnBed } from "../js/stl.js";
import { box, tube, steps } from "../js/samples.js";
import { sliceMesh, layerTops } from "../js/slice.js";
import { area } from "../js/toolpaths.js";
import { slice } from "../js/pipeline.js";
import { DEFAULTS } from "../js/settings.js";

const cubeFile = readFileSync(new URL("../examples/cube.stl", import.meta.url));
const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

test("reads an ASCII STL", () => {
  const p = parseSTL(buf(cubeFile));
  assert.equal(p.length / 9, 12);
  assert.deepEqual(bounds(p), { min: [0, 0, 0], max: [20, 20, 20] });
});

test("reads a binary STL", () => {
  const tri = box();
  const b = new ArrayBuffer(84 + 50 * (tri.length / 9));
  const v = new DataView(b);
  v.setUint32(80, tri.length / 9, true);
  for (let t = 0; t < tri.length / 9; t++) {
    for (let j = 0; j < 9; j++) v.setFloat32(84 + t * 50 + 12 + j * 4, tri[t * 9 + j], true);
  }
  assert.deepEqual(parseSTL(b), tri);
});

test("layer heights", () => {
  const tops = layerTops(2, 0.2, 0.3);
  assert.equal(tops[0], 0.3);
  assert.equal(tops.at(-1), 2.1);
});

test("a slice of the cube is a 20x20 square", () => {
  const [layer] = sliceMesh(box(), [10]);
  assert.equal(layer.length, 1);
  assert.ok(Math.abs(area(layer) - 400) < 0.01);
});

test("a slice of the tube has a hole", () => {
  const [layer] = sliceMesh(tube(15, 8, 25, 64), [12]);
  assert.equal(layer.length, 2); // outside + hole
  const expected = Math.PI * (15 ** 2 - 8 ** 2);
  assert.ok(Math.abs(area(layer) - expected) / expected < 0.01);
});

test("slicing the cube makes sensible G-code", () => {
  const model = placeOnBed(box(), 110, 110);
  const { gcode, stats, layerCount, warnings, preview } = slice(model, DEFAULTS);
  assert.equal(warnings.length, 0);
  assert.equal(layerCount, 100); // 0.24 first layer + 99 x 0.2 = 20.04 mm
  assert.equal((gcode.match(/;LAYER:/g) || []).length, layerCount);

  // every move stays on the bed
  for (const m of gcode.matchAll(/G[01] X([\d.-]+) Y([\d.-]+)/g)) {
    const x = +m[1], y = +m[2];
    assert.ok(x >= 0 && x <= 220 && y >= 0 && y <= 220, `off the bed: ${m[0]}`);
  }

  // Plastic used should be between "just the walls" and "solid cube".
  const filamentArea = Math.PI * 0.875 ** 2;
  const volume = stats.filamentMm * filamentArea;
  assert.ok(volume > 2000 && volume < 8000, `volume ${volume}`);
  assert.ok(stats.time > 10 * 60 && stats.time < 3 * 3600, `time ${stats.time}`);
  assert.equal(preview.layerEnds.length, layerCount);
});

test("top surfaces get solid skin, middle layers don't", () => {
  const model = placeOnBed(steps(), 110, 110);
  const { gcode } = slice(model, DEFAULTS);
  const layers = gcode.split(";LAYER:").slice(1);
  const hasSolid = (i) => layers[i].includes(";TYPE:SOLID");
  assert.ok(hasSolid(0)); // bottom
  assert.ok(hasSolid(28)); // just under the first step's top (z = 6 mm)
  assert.ok(hasSolid(layers.length - 1)); // very top
  // the middle of the bottom block is only sparse infill... except the
  // ring that's exposed by the step above. Check the centre isn't solid:
  assert.ok(layers[15].includes(";TYPE:INFILL"));
});

test("the skirt goes around the outside only, not inside holes", () => {
  const model = placeOnBed(tube(), 110, 110);
  const layer0 = slice(model, DEFAULTS).gcode.split(";LAYER:")[1];
  const skirt = layer0.split(";TYPE:")[1];
  for (const m of skirt.matchAll(/X([\d.]+) Y([\d.]+)/g)) {
    const r = Math.hypot(+m[1] - 110, +m[2] - 110);
    assert.ok(r > 19, `skirt point too close to the middle: r = ${r}`);
  }
});
