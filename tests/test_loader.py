"""Tests for the STL loader. Run with:  python -m unittest"""

import os
import struct
import tempfile
import unittest

from loader.stl import load_stl

HERE = os.path.dirname(__file__)
CUBE = os.path.join(HERE, "..", "examples", "cube.stl")


class TestLoader(unittest.TestCase):
    def test_ascii_cube(self):
        mesh = load_stl(CUBE)
        self.assertEqual(len(mesh.triangles), 12)  # 6 faces x 2 triangles
        self.assertEqual(mesh.size(), (20.0, 20.0, 20.0))

    def test_binary_triangle(self):
        # Build a tiny binary STL with one triangle
        data = b"\0" * 80 + struct.pack("<I", 1)
        data += struct.pack("<12fH", 0, 0, 1, 0, 0, 0, 10, 0, 0, 0, 10, 5, 0)
        with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
            f.write(data)
        try:
            mesh = load_stl(f.name)
        finally:
            os.remove(f.name)
        self.assertEqual(len(mesh.triangles), 1)
        self.assertEqual(mesh.size(), (10.0, 10.0, 5.0))


if __name__ == "__main__":
    unittest.main()
