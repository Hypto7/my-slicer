// The 3D preview, drawn with three.js.
// Printer coordinates: X = left/right, Y = front/back, Z = up.

import * as THREE from "../lib/three.js";
import { TYPES } from "./pipeline.js";

export const TYPE_COLORS = {
  SKIRT: "#9aa0a6",
  "WALL-OUTER": "#ff8a3d",
  "WALL-INNER": "#ffd166",
  SOLID: "#b388ff",
  INFILL: "#4cc9f0",
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#15171c");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#444455", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(-1, -2, 3);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    this.camera.up.set(0, 0, 1);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.render());

    this.bed = new THREE.Group();
    this.scene.add(this.bed);
    this.model = null;
    this.paths = null;
    this.current = null;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  setBed(x, y) {
    this.bedSize = [x, y];
    this.bed.clear();
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(x, y),
      new THREE.MeshBasicMaterial({ color: "#23262e" }),
    );
    plate.position.set(x / 2, y / 2, -0.05);
    this.bed.add(plate);
    const step = 10;
    const grid = [];
    for (let gx = 0; gx <= x + 0.01; gx += step) grid.push(gx, 0, 0, gx, y, 0);
    for (let gy = 0; gy <= y + 0.01; gy += step) grid.push(0, gy, 0, x, gy, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
    this.bed.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#363a45" })));
    this.render();
  }

  setModel(positions) {
    if (this.model) { this.scene.remove(this.model); this.model.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    this.model = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: "#5aa9ff", roughness: 0.6, metalness: 0.05, flatShading: true,
    }));
    this.scene.add(this.model);
    this.clearPaths();
    g.computeBoundingBox();
    this.frame(g.boundingBox);
  }

  // Point the camera at a box so it fills the view.
  frame(box) {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const d = Math.max(size, 40) * 1.6;
    this.controls.target.copy(c);
    this.camera.position.set(c.x - d * 0.45, c.y - d * 0.75, c.z + d * 0.6);
    this.controls.update();
    this.render();
  }

  clearPaths() {
    for (const obj of [this.paths, this.current]) {
      if (obj) { this.scene.remove(obj); obj.geometry.dispose(); }
    }
    this.paths = this.current = null;
    if (this.model) this.model.visible = true;
    this.render();
  }

  // Draw the nozzle paths. Lower layers are dimmed a little so the
  // current layer stands out.
  setToolpaths(preview) {
    this.clearPaths();
    this.preview = preview;
    const { segments, types } = preview;
    const colors = new Float32Array(segments.length);
    const cols = TYPES.map((t) => new THREE.Color(TYPE_COLORS[t]));
    for (let i = 0; i < types.length; i++) {
      const c = cols[types[i]];
      for (let v = 0; v < 2; v++) {
        colors[i * 6 + v * 3] = c.r * 0.75;
        colors[i * 6 + v * 3 + 1] = c.g * 0.75;
        colors[i * 6 + v * 3 + 2] = c.b * 0.75;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(segments, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.paths = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.scene.add(this.paths);

    // a second copy, bright, used to highlight just the current layer
    const g2 = new THREE.BufferGeometry();
    const bright = colors.map((c) => Math.min(1, c / 0.75));
    g2.setAttribute("position", new THREE.BufferAttribute(segments, 3));
    g2.setAttribute("color", new THREE.BufferAttribute(bright, 3));
    this.current = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.scene.add(this.current);

    if (this.model) this.model.visible = false;
    this.showLayer(preview.layerEnds.length - 1);
  }

  showLayer(i) {
    if (!this.paths) return;
    const ends = this.preview.layerEnds;
    const end = ends[i] * 2;
    const start = i > 0 ? ends[i - 1] * 2 : 0;
    this.paths.geometry.setDrawRange(0, start);
    this.current.geometry.setDrawRange(start, end - start);
    this.render();
  }

  showModel(on) {
    if (this.model) this.model.visible = on;
    if (this.paths) { this.paths.visible = !on; this.current.visible = !on; }
    this.render();
  }
}
