// The page: buttons, settings, and wiring it all together.

import { parseSTL, placeOnBed, bounds, rotate90, scale } from "./stl.js";
import { SAMPLES } from "./samples.js";
import { SETTING_GROUPS, DEFAULTS, PRESETS } from "./settings.js";
import { Viewer, TYPE_COLORS } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "my-slicer-settings";

const state = {
  original: null, // the model as loaded (before rotate/scale)
  rotations: [], // list of "x" / "y" / "z"
  model: null, // the model ready to print, placed on the bed
  name: "model",
  settings: loadSettings(),
  result: null,
  worker: null,
};

const viewer = new Viewer($("viewer"));
viewer.setBed(state.settings.bedX, state.settings.bedY);

// ---------------- settings ----------------

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch { /* private mode etc. */ }
}

function buildSettings() {
  const root = $("settings");
  root.innerHTML = "";
  SETTING_GROUPS.forEach((group, gi) => {
    const det = document.createElement("details");
    if (gi === 2 || gi === 3) det.open = true; // Quality + Strength open by default
    det.innerHTML = `<summary>${group.title}</summary>`;
    for (const f of group.fields) {
      const row = document.createElement("div");
      row.className = "field";
      const id = "set-" + f.key;
      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        for (const [v, label] of Object.entries(f.options)) input.add(new Option(label, v));
      } else {
        input = document.createElement("input");
        Object.assign(input, { type: "number", min: f.min, max: f.max, step: f.step });
      }
      input.id = id;
      input.value = state.settings[f.key];
      input.addEventListener("change", () => {
        let v = f.type === "select" ? input.value : parseFloat(input.value);
        if (f.type !== "select") {
          if (!Number.isFinite(v)) v = f.def;
          v = Math.min(f.max, Math.max(f.min, v));
          input.value = v;
        }
        state.settings[f.key] = v;
        $("preset").value = "";
        settingsChanged(f.key);
      });
      row.innerHTML = `<label for="${id}">${f.label}</label>`;
      row.appendChild(input);
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = f.unit || "";
      row.appendChild(unit);
      det.appendChild(row);
    }
    root.appendChild(det);
  });
}

function settingsChanged(key) {
  saveSettings();
  if (key === "bedX" || key === "bedY") {
    viewer.setBed(state.settings.bedX, state.settings.bedY);
    if (state.original) prepareModel();
  }
  markStale();
}

$("preset").add(new Option("Custom", ""));
for (const [k, p] of Object.entries(PRESETS)) $("preset").add(new Option(p.name, k));
$("preset").value = "";
$("preset").addEventListener("change", (e) => {
  const p = PRESETS[e.target.value];
  if (!p) return;
  Object.assign(state.settings, p.values);
  buildSettings();
  saveSettings();
  markStale();
});
$("reset").addEventListener("click", () => {
  state.settings = { ...DEFAULTS };
  buildSettings();
  saveSettings();
  viewer.setBed(state.settings.bedX, state.settings.bedY);
  if (state.original) prepareModel();
  $("preset").value = "standard";
  markStale();
});
buildSettings();

// ---------------- loading models ----------------

function loadModel(positions, name) {
  if (!positions.length) throw new Error("That file has no triangles in it.");
  state.original = positions;
  state.rotations = [];
  state.name = name.replace(/\.stl$/i, "") || "model";
  $("scale").value = 100;
  prepareModel();
}

function prepareModel() {
  let p = state.original;
  for (const axis of state.rotations) p = rotate90(p, axis);
  const factor = (parseFloat($("scale").value) || 100) / 100;
  if (factor !== 1) p = scale(p, factor);
  state.model = placeOnBed(p, state.settings.bedX / 2, state.settings.bedY / 2);
  viewer.setModel(state.model);

  const { min, max } = bounds(state.model);
  const size = [0, 1, 2].map((a) => (max[a] - min[a]).toFixed(1));
  $("model-info").textContent =
    `${state.name} · ${size.join(" × ")} mm · ${(state.model.length / 9).toLocaleString()} triangles`;
  $("model-tools").hidden = false;
  $("empty-hint").hidden = true;
  $("slice").disabled = false;
  markStale();
}

async function openFile(file) {
  if (!file) return;
  try {
    setStatus(`Reading ${file.name}…`);
    loadModel(parseSTL(await file.arrayBuffer()), file.name);
    setStatus("");
  } catch (err) {
    setStatus("Couldn't open that file: " + err.message);
  }
}

$("file").addEventListener("change", (e) => openFile(e.target.files[0]));

for (const [key, s] of Object.entries(SAMPLES)) {
  const b = document.createElement("button");
  b.className = "small";
  b.textContent = s.name;
  b.addEventListener("click", () => loadModel(s.make(), key));
  $("samples").appendChild(b);
}

document.querySelectorAll("[data-rot]").forEach((b) =>
  b.addEventListener("click", () => { state.rotations.push(b.dataset.rot); prepareModel(); }));
$("scale").addEventListener("change", () => state.original && prepareModel());

// drag and drop
const view = $("view");
view.addEventListener("dragover", (e) => { e.preventDefault(); view.classList.add("dragging"); });
view.addEventListener("dragleave", () => view.classList.remove("dragging"));
view.addEventListener("drop", (e) => {
  e.preventDefault();
  view.classList.remove("dragging");
  openFile(e.dataTransfer.files[0]);
});

// ---------------- slicing ----------------

function markStale() {
  if (!state.result) return;
  state.result = null;
  viewer.clearPaths();
  $("layer-bar").hidden = $("legend").hidden = true;
  $("download").hidden = true;
  $("stats").hidden = true;
  $("warnings").innerHTML = "";
  setStatus("Settings or model changed - slice again.");
}

function setStatus(text) { $("status").textContent = text; }
function setProgress(p) {
  $("progress").hidden = p === null;
  if (p !== null) $("progress").firstElementChild.style.width = Math.round(p * 100) + "%";
}

$("slice").addEventListener("click", () => {
  if (!state.model) return;
  if (state.worker) state.worker.terminate();
  $("slice").disabled = true;
  setProgress(0);
  setStatus("Starting…");
  const started = performance.now();

  const onDone = (result) => {
    state.worker = null;
    $("slice").disabled = false;
    setProgress(null);
    showResult(result, (performance.now() - started) / 1000);
  };
  const onError = (message) => {
    state.worker = null;
    $("slice").disabled = false;
    setProgress(null);
    setStatus("Slicing failed: " + message);
  };

  const job = { positions: state.model.slice(), settings: { ...state.settings } };
  try {
    const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    state.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { setProgress(m.p); setStatus(m.msg + "…"); }
      else if (m.type === "done") { w.terminate(); onDone(m.result); }
      else if (m.type === "error") { w.terminate(); onError(m.message); }
    };
    w.onerror = (e) => { e.preventDefault(); w.terminate(); runHere(job, onDone, onError); };
    w.postMessage(job, [job.positions.buffer]);
  } catch {
    runHere(job, onDone, onError);
  }
});

// Fallback for browsers without module workers: slice on the page itself.
async function runHere(job, onDone, onError) {
  try {
    const { slice } = await import("./pipeline.js");
    onDone(slice(state.model, job.settings, (p, msg) => { setProgress(p); setStatus(msg + "…"); }));
  } catch (err) {
    onError(err.message);
  }
}

function showResult(result, seconds) {
  state.result = result;
  const { stats, preview, warnings, layerCount } = result;

  $("warnings").innerHTML = warnings.map((w) => `<li>${w}</li>`).join("");
  $("stats").hidden = false;
  $("stats").innerHTML = [
    [formatTime(stats.time), "print time (estimate)"],
    [`${stats.filamentGrams.toFixed(1)} g`, `${(stats.filamentMm / 1000).toFixed(2)} m of filament`],
    [layerCount, "layers"],
    [`${seconds.toFixed(1)} s`, "to slice"],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  setStatus("Done! Drag the slider to see each layer.");
  $("download").hidden = false;

  viewer.setToolpaths(preview);
  const slider = $("layer");
  slider.max = layerCount - 1;
  slider.value = layerCount - 1;
  updateLayerLabel();
  $("layer-bar").hidden = false;
  $("legend").hidden = false;
  $("toggle-model").textContent = "Show model";
}

function updateLayerLabel() {
  const i = +$("layer").value;
  const z = state.result.preview.layerTops[i];
  $("layer-label").textContent = `Layer ${i + 1} · ${z.toFixed(2)} mm`;
}

$("layer").addEventListener("input", () => {
  viewer.showLayer(+$("layer").value);
  updateLayerLabel();
});

$("toggle-model").addEventListener("click", (e) => {
  const showingModel = e.target.textContent === "Show paths";
  viewer.showModel(!showingModel);
  e.target.textContent = showingModel ? "Show model" : "Show paths";
});

$("download").addEventListener("click", () => {
  if (!state.result) return;
  const blob = new Blob([state.result.gcode], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.name}.gcode`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

function formatTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// legend
$("legend").innerHTML = Object.entries({
  "WALL-OUTER": "Outer wall", "WALL-INNER": "Inner wall", SOLID: "Top/bottom", INFILL: "Infill", SKIRT: "Skirt",
}).map(([k, label]) => `<span><i style="background:${TYPE_COLORS[k]}"></i>${label}</span>`).join("");
