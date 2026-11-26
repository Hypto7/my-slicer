// Built-in test models, so you can try the slicer without finding an STL.
// Each returns triangles in the same flat format as parseSTL.

// A box: size x, y, z in mm.
export function box(sx = 20, sy = 20, sz = 20) {
  const v = [
    [0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0],
    [0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [3, 7, 6], [3, 6, 2], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5], // right
  ];
  return new Float32Array(faces.flatMap((f) => f.flatMap((i) => v[i])));
}

// A tube: a cylinder with a hole down the middle. Good for testing holes.
export function tube(outer = 15, inner = 8, height = 25, sides = 64) {
  const tris = [];
  const ring = (r, z) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return [r * Math.cos(a), r * Math.sin(a), z];
    });
  const ob = ring(outer, 0), ot = ring(outer, height);
  const ib = ring(inner, 0), it = ring(inner, height);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tris.push(ob[i], ob[j], ot[j], ob[i], ot[j], ot[i]); // outside wall
    tris.push(ib[i], it[j], ib[j], ib[i], it[i], it[j]); // inside wall
    tris.push(ot[i], ot[j], it[j], ot[i], it[j], it[i]); // top ring
    tris.push(ob[i], ib[j], ob[j], ob[i], ib[i], ib[j]); // bottom ring
  }
  return new Float32Array(tris.flat());
}

// A small stepped pyramid - shows top surfaces at several heights.
export function steps() {
  const parts = [box(40, 40, 6), offset(box(28, 28, 6), 6, 6, 6), offset(box(16, 16, 6), 12, 12, 12)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function offset(p, dx, dy, dz) {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = p[i] + dx; out[i + 1] = p[i + 1] + dy; out[i + 2] = p[i + 2] + dz;
  }
  return out;
}

export const SAMPLES = {
  cube: { name: "20 mm cube", make: () => box() },
  tube: { name: "Tube (has a hole)", make: () => tube() },
  steps: { name: "Stepped pyramid", make: () => steps() },
};
