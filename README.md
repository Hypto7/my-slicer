# my-slicer

A free 3D printer slicer that runs entirely in your web browser — on a computer or a phone.
Nothing is uploaded anywhere: your model is sliced on your own device.

**Try it:** https://hypto7.github.io/my-slicer/ (once GitHub Pages is switched on — see below)

## What it does

1. **Load a model** — open an STL file, drag one onto the page, or try a built-in sample.
2. **Pick settings** — presets (Draft, Standard, Fine, Strong) or tweak layer height, walls, infill, temperatures and speeds.
3. **Slice** — see every layer in 3D with a slider, plus print time and filament estimates.
4. **Download G-code** — copy it to your printer's SD card or upload it to the printer.

Defaults suit a typical 0.4 mm nozzle printer with PLA (Ender 3, Prusa, Bambu A1 etc.).
Always check the first layer of a new slicer's G-code on your printer!

## How a slicer works

```
STL triangles ──► cut into layers ──► walls + infill ──► G-code
   stl.js            slice.js          toolpaths.js     pipeline.js
```

| File | Job |
|------|-----|
| `js/stl.js` | Reads STL files (text and binary), moves/rotates/scales the model |
| `js/slice.js` | Cuts the model into layers and joins the cut lines into outlines |
| `js/toolpaths.js` | Shrinks outlines into walls, fills the inside with lines |
| `js/pipeline.js` | Runs every step and writes the G-code |
| `js/settings.js` | All settings, defaults and presets |
| `js/viewer.js` | The 3D preview (three.js) |
| `js/app.js` | The page: buttons, settings panel, slicing in the background |
| `js/samples.js` | Built-in test models |
| `lib/` | Libraries: [three.js](https://threejs.org) (MIT) and [Clipper](http://www.angusj.com) (Boost) |

## Run it on your computer

Browsers won't run this straight from a file, so start a tiny local web server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Run the automatic checks with `npm test` (needs Node.js 20+).

## Put it online with GitHub Pages

Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
After a minute it's live at https://hypto7.github.io/my-slicer/.

## Roadmap

- [x] Load ASCII and binary STL files
- [x] Slice into layers, walls, top/bottom skin, grid and line infill
- [x] Skirt, retraction, fan control, Marlin-style G-code
- [x] 3D layer preview that works on phones
- [ ] Supports (for overhangs — a model with a rounded bottom needs them)
- [ ] Brim for better bed grip
- [ ] More infill patterns (gyroid, honeycomb)
- [ ] Save/load printer profiles
- [ ] AI assistant that suggests settings for your model

## How I work on this (Git workflow)

1. Pull the latest changes
2. Make a branch for one feature, e.g. `supports`
3. Commit small steps with clear messages
4. Push, open a Pull Request, merge into `main`

## License

MIT — see [LICENSE](LICENSE).
