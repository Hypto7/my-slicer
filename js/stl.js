// Read STL files (the 3D model format most printers use).
//
// An STL file is a big list of triangles. Each triangle has 3 corners, and
// each corner is an (x, y, z) point in millimetres. There are two flavours:
//   - ASCII:  readable text ("facet normal ... vertex 1 2 3 ...")
//   - Binary: compact bytes - most real models use this
//
// We return a Float32Array of corner coordinates, 9 numbers per triangle:
//   [x1,y1,z1, x2,y2,z2, x3,y3,z3,  x1,y1,z1, ...]
// That flat format is fast and is exactly what three.js wants for drawing.

export function parseSTL(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (looksBinary(arrayBuffer)) return parseBinary(arrayBuffer);
  return parseASCII(new TextDecoder().decode(bytes));
}

function looksBinary(buffer) {
  // Binary STL: 80-byte header, 4-byte triangle count, then 50 bytes per
  // triangle. If the size adds up, it's binary. (Some binary files start
  // with the word "solid" too, so we can't just check the first word.)
  if (buffer.byteLength < 84) return false;
  const count = new DataView(buffer).getUint32(80, true);
  return buffer.byteLength === 84 + count * 50;
}

function parseBinary(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const out = new Float32Array(count * 9);
  let offset = 84;
  for (let i = 0; i < count; i++) {
    offset += 12; // skip the normal - we work it out ourselves when needed
    for (let j = 0; j < 9; j++) {
      out[i * 9 + j] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // "attribute byte count", unused
  }
  return out;
}

function parseASCII(text) {
  const values = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    values.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  if (values.length === 0 || values.length % 9 !== 0) {
    throw new Error("This doesn't look like a valid STL file.");
  }
  return new Float32Array(values);
}

// Size and position of a model: { min: [x,y,z], max: [x,y,z] }
export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

// Move the model so it sits on the bed (z = 0), centred at (cx, cy).
export function placeOnBed(positions, cx, cy) {
  const { min, max } = bounds(positions);
  const dx = cx - (min[0] + max[0]) / 2;
  const dy = cy - (min[1] + max[1]) / 2;
  const dz = -min[2];
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] + dx;
    out[i + 1] = positions[i + 1] + dy;
    out[i + 2] = positions[i + 2] + dz;
  }
  return out;
}

// Scale the model (1 = 100%).
export function scale(positions, factor) {
  return positions.map((v) => v * factor);
}

// Rotate the model 90 degrees around the X, Y or Z axis.
export function rotate90(positions, axis) {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (axis === "x") { out[i] = x; out[i + 1] = -z; out[i + 2] = y; }
    else if (axis === "y") { out[i] = z; out[i + 1] = y; out[i + 2] = -x; }
    else { out[i] = -y; out[i + 1] = x; out[i + 2] = z; }
  }
  return out;
}
