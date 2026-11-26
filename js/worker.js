// Runs the slicer in the background, so the page doesn't freeze while it works.

import { slice } from "./pipeline.js";

self.onmessage = (e) => {
  try {
    const { positions, settings } = e.data;
    const result = slice(positions, settings, (p, msg) => self.postMessage({ type: "progress", p, msg }));
    const pv = result.preview;
    self.postMessage({ type: "done", result }, [pv.segments.buffer, pv.types.buffer, pv.layerEnds.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
