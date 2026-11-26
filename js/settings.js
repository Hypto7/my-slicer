// All the slicer settings, with sensible defaults for a typical
// 0.4 mm nozzle printer running PLA (e.g. Ender 3, Prusa, Bambu A1).

export const SETTING_GROUPS = [
  {
    title: "Printer",
    fields: [
      { key: "bedX", label: "Bed width", unit: "mm", def: 220, min: 50, max: 1000, step: 1 },
      { key: "bedY", label: "Bed depth", unit: "mm", def: 220, min: 50, max: 1000, step: 1 },
      { key: "maxZ", label: "Max height", unit: "mm", def: 250, min: 50, max: 1000, step: 1 },
      { key: "nozzle", label: "Nozzle size", unit: "mm", def: 0.4, min: 0.1, max: 2, step: 0.05 },
      { key: "filament", label: "Filament diameter", unit: "mm", def: 1.75, min: 1, max: 3, step: 0.05 },
    ],
  },
  {
    title: "Material",
    fields: [
      { key: "nozzleTemp", label: "Nozzle temp", unit: "°C", def: 210, min: 150, max: 320, step: 5 },
      { key: "bedTemp", label: "Bed temp", unit: "°C", def: 60, min: 0, max: 130, step: 5 },
      { key: "fan", label: "Cooling fan", unit: "%", def: 100, min: 0, max: 100, step: 5 },
      { key: "density", label: "Material density", unit: "g/cm³", def: 1.24, min: 0.5, max: 3, step: 0.01 },
    ],
  },
  {
    title: "Quality",
    fields: [
      { key: "layerHeight", label: "Layer height", unit: "mm", def: 0.2, min: 0.04, max: 1, step: 0.02 },
      { key: "firstLayerHeight", label: "First layer height", unit: "mm", def: 0.24, min: 0.1, max: 1, step: 0.02 },
      { key: "lineWidth", label: "Line width", unit: "mm", def: 0.45, min: 0.1, max: 2, step: 0.01 },
    ],
  },
  {
    title: "Strength",
    fields: [
      { key: "walls", label: "Walls", unit: "", def: 2, min: 1, max: 10, step: 1 },
      { key: "topLayers", label: "Top layers", unit: "", def: 4, min: 0, max: 20, step: 1 },
      { key: "bottomLayers", label: "Bottom layers", unit: "", def: 3, min: 0, max: 20, step: 1 },
      { key: "infill", label: "Infill", unit: "%", def: 15, min: 0, max: 100, step: 5 },
      { key: "pattern", label: "Infill pattern", type: "select", def: "grid", options: { grid: "Grid", lines: "Lines" } },
    ],
  },
  {
    title: "Speed",
    fields: [
      { key: "speedWall", label: "Wall speed", unit: "mm/s", def: 40, min: 5, max: 500, step: 5 },
      { key: "speedInfill", label: "Infill speed", unit: "mm/s", def: 60, min: 5, max: 500, step: 5 },
      { key: "speedFirst", label: "First layer speed", unit: "mm/s", def: 20, min: 5, max: 200, step: 5 },
      { key: "speedTravel", label: "Travel speed", unit: "mm/s", def: 150, min: 20, max: 1000, step: 10 },
    ],
  },
  {
    title: "Retraction & skirt",
    fields: [
      { key: "retractLength", label: "Retract length", unit: "mm", def: 5, min: 0, max: 15, step: 0.1 },
      { key: "retractSpeed", label: "Retract speed", unit: "mm/s", def: 40, min: 5, max: 150, step: 5 },
      { key: "skirtLoops", label: "Skirt loops", unit: "", def: 2, min: 0, max: 10, step: 1 },
      { key: "skirtDistance", label: "Skirt distance", unit: "mm", def: 5, min: 0, max: 50, step: 0.5 },
    ],
  },
];

export const DEFAULTS = Object.fromEntries(
  SETTING_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.def])),
);

// One-tap presets. They only change the fields listed.
export const PRESETS = {
  draft: { name: "Draft (fast)", values: { layerHeight: 0.28, firstLayerHeight: 0.28, walls: 2, topLayers: 3, bottomLayers: 3, infill: 10 } },
  standard: { name: "Standard", values: { layerHeight: 0.2, firstLayerHeight: 0.24, walls: 2, topLayers: 4, bottomLayers: 3, infill: 15 } },
  fine: { name: "Fine (detailed)", values: { layerHeight: 0.12, firstLayerHeight: 0.2, walls: 3, topLayers: 6, bottomLayers: 5, infill: 15 } },
  strong: { name: "Strong", values: { layerHeight: 0.2, firstLayerHeight: 0.24, walls: 4, topLayers: 5, bottomLayers: 4, infill: 40 } },
};
