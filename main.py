"""Run the slicer from the command line.

Usage:
    python main.py examples/cube.stl
"""

import sys

from loader.stl import load_stl


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python main.py <model.stl>")
        sys.exit(1)

    mesh = load_stl(sys.argv[1])
    w, d, h = mesh.size()

    print(f"Loaded {len(mesh.triangles)} triangles")
    print(f"Size: {w:.2f} x {d:.2f} x {h:.2f} mm (width x depth x height)")

    # Next steps (see README): slice into layers -> make paths -> write G-code


if __name__ == "__main__":
    main()
