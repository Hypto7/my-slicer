# my-slicer

A simple 3D printer slicer written in Python, built step by step as a learning project.

A slicer takes a 3D model (STL file), cuts it into thin layers, works out where the
nozzle should move on each layer, and writes that out as G-code for the printer.

## Run it

Needs Python 3.10 or newer. No extra packages required.

```
python main.py examples/cube.stl
```

Output:

```
Loaded 12 triangles
Size: 20.00 x 20.00 x 20.00 mm (width x depth x height)
```

Run the tests:

```
python -m unittest
```

## Project layout

| Folder      | Job                                         | Status   |
|-------------|---------------------------------------------|----------|
| `loader/`   | Read STL files into triangles               | ✅ Done  |
| `slicer/`   | Cut the triangles into layers (outlines)    | 🔜 Next  |
| `paths/`    | Turn outlines into walls and infill moves   | ⏳ Later |
| `gcode/`    | Write the moves out as G-code               | ⏳ Later |
| `examples/` | Small test models                           |          |
| `tests/`    | Automatic checks that the code still works  |          |

## Roadmap

- [x] Load ASCII and binary STL files
- [ ] Slice at a given layer height (e.g. 0.2 mm)
- [ ] Join slice segments into closed outlines
- [ ] Generate perimeters (walls)
- [ ] Generate simple infill (lines)
- [ ] Write G-code that a real printer can run
- [ ] Preview layers as images

## How I work on this (Git workflow)

1. Pull the latest changes
2. Make a branch for one feature, e.g. `slicing`
3. Commit small steps with clear messages
4. Push, open a Pull Request, merge into `main`

## License

MIT - see [LICENSE](LICENSE).
