"""Read STL files (the 3D model format most printers use).

An STL file is just a big list of triangles. Each triangle has 3 corners
(called vertices), and each corner is an (x, y, z) point in millimetres.

STL files come in two flavours:
  - ASCII:  human-readable text ("facet normal ... vertex 1 2 3 ...")
  - Binary: compact bytes, much smaller - most real models use this

This loader handles both, using only Python's built-in libraries.
"""

import struct
from dataclasses import dataclass

# A point in 3D space: (x, y, z)
Point = tuple[float, float, float]
# A triangle: three points
Triangle = tuple[Point, Point, Point]


@dataclass
class Mesh:
    """A 3D model made of triangles."""

    triangles: list[Triangle]

    def bounding_box(self) -> tuple[Point, Point]:
        """Return the (smallest corner, biggest corner) of the model."""
        xs = [p[0] for tri in self.triangles for p in tri]
        ys = [p[1] for tri in self.triangles for p in tri]
        zs = [p[2] for tri in self.triangles for p in tri]
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

    def size(self) -> Point:
        """Width, depth and height of the model in mm."""
        lo, hi = self.bounding_box()
        return (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])


def load_stl(path: str) -> Mesh:
    """Open an STL file and return a Mesh. Works out the format by itself."""
    with open(path, "rb") as f:
        data = f.read()

    if _looks_binary(data):
        return _load_binary(data)
    return _load_ascii(data.decode("utf-8", errors="replace"))


def _looks_binary(data: bytes) -> bool:
    # A binary STL has an 80-byte header, then a 4-byte triangle count,
    # then exactly 50 bytes per triangle. If the file size matches that,
    # it's binary. (Some binary files start with the word "solid" too,
    # so we can't just check the first word.)
    if len(data) < 84:
        return False
    count = struct.unpack_from("<I", data, 80)[0]
    return len(data) == 84 + count * 50


def _load_binary(data: bytes) -> Mesh:
    count = struct.unpack_from("<I", data, 80)[0]
    triangles = []
    offset = 84
    for _ in range(count):
        # 12 floats: normal (3, we skip it), then 3 vertices (9)
        values = struct.unpack_from("<12f", data, offset)
        v = values[3:]
        triangles.append(((v[0], v[1], v[2]), (v[3], v[4], v[5]), (v[6], v[7], v[8])))
        offset += 50  # 48 bytes of floats + 2 spare bytes
    return Mesh(triangles)


def _load_ascii(text: str) -> Mesh:
    triangles = []
    corners = []
    for line in text.splitlines():
        parts = line.split()
        if parts and parts[0] == "vertex":
            corners.append((float(parts[1]), float(parts[2]), float(parts[3])))
            if len(corners) == 3:
                triangles.append(tuple(corners))
                corners = []
    return Mesh(triangles)
