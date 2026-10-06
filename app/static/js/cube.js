import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const COLORS = ["white", "yellow", "red", "orange", "blue", "green"];

export const COLOR_HEX = {
  white: 0xf4f7f2,
  yellow: 0xf5d76e,
  red: 0xe24b4b,
  orange: 0xf08a3a,
  blue: 0x3b6fd4,
  green: 0x3fad5c,
};

const PLASTIC = 0x141a17;
const FACE_SIZE = 0.92;
const CUBIE = 0.95;
const GAP = 1.05;

/** Facelet index → cubie grid position + normal axis */
const FACELET_MAP = (() => {
  const map = new Array(54);
  // U 0-8
  const u = [
    [-1, 1, -1],
    [0, 1, -1],
    [1, 1, -1],
    [-1, 1, 0],
    [0, 1, 0],
    [1, 1, 0],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  u.forEach((p, i) => {
    map[i] = { pos: p, face: "U" };
  });
  // R 9-17
  const r = [
    [1, 1, 1],
    [1, 1, 0],
    [1, 1, -1],
    [1, 0, 1],
    [1, 0, 0],
    [1, 0, -1],
    [1, -1, 1],
    [1, -1, 0],
    [1, -1, -1],
  ];
  r.forEach((p, i) => {
    map[9 + i] = { pos: p, face: "R" };
  });
  // F 18-26
  const f = [
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [-1, 0, 1],
    [0, 0, 1],
    [1, 0, 1],
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
  ];
  f.forEach((p, i) => {
    map[18 + i] = { pos: p, face: "F" };
  });
  // D 27-35
  const d = [
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
    [-1, -1, 0],
    [0, -1, 0],
    [1, -1, 0],
    [-1, -1, -1],
    [0, -1, -1],
    [1, -1, -1],
  ];
  d.forEach((p, i) => {
    map[27 + i] = { pos: p, face: "D" };
  });
  // L 36-44
  const l = [
    [-1, 1, -1],
    [-1, 1, 0],
    [-1, 1, 1],
    [-1, 0, -1],
    [-1, 0, 0],
    [-1, 0, 1],
    [-1, -1, -1],
    [-1, -1, 0],
    [-1, -1, 1],
  ];
  l.forEach((p, i) => {
    map[36 + i] = { pos: p, face: "L" };
  });
  // B 45-53
  const b = [
    [1, 1, -1],
    [0, 1, -1],
    [-1, 1, -1],
    [1, 0, -1],
    [0, 0, -1],
    [-1, 0, -1],
    [1, -1, -1],
    [0, -1, -1],
    [-1, -1, -1],
  ];
  b.forEach((p, i) => {
    map[45 + i] = { pos: p, face: "B" };
  });
  return map;
})();

const CENTER_INDICES = new Set([4, 13, 22, 31, 40, 49]);

const FACE_NORMAL = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

/** Clockwise facelet cycles — verified against kociemba moveCube. */
const FACE_CYCLES = {
  U: [
    [0, 2, 8, 6],
    [1, 5, 7, 3],
    [9, 18, 36, 45],
    [10, 19, 37, 46],
    [11, 20, 38, 47],
  ],
  R: [
    [2, 51, 29, 20],
    [5, 48, 32, 23],
    [8, 45, 35, 26],
    [9, 11, 17, 15],
    [10, 14, 16, 12],
  ],
  F: [
    [6, 9, 29, 44],
    [7, 12, 28, 41],
    [8, 15, 27, 38],
    [18, 20, 26, 24],
    [19, 23, 25, 21],
  ],
  D: [
    [15, 51, 42, 24],
    [16, 52, 43, 25],
    [17, 53, 44, 26],
    [27, 29, 35, 33],
    [28, 32, 34, 30],
  ],
  L: [
    [0, 18, 27, 53],
    [3, 21, 30, 50],
    [6, 24, 33, 47],
    [36, 38, 44, 42],
    [37, 41, 43, 39],
  ],
  B: [
    [0, 42, 35, 11],
    [1, 39, 34, 14],
    [2, 36, 33, 17],
    [45, 47, 53, 51],
    [46, 50, 52, 48],
  ],
};

const AXIS_FOR_FACE = {
  U: "y",
  D: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z",
};

const LAYER_VALUE = {
  U: 1,
  D: -1,
  R: 1,
  L: -1,
  F: 1,
  B: -1,
};

/** Signed quarter-turns for a CW face turn in Three.js space (matches kociemba). */
const CW_QUARTERS = {
  U: -1,
  D: 1,
  R: -1,
  L: 1,
  F: -1,
  B: 1,
};

export function solvedColors() {
  const faceColor = {
    U: "white",
    R: "red",
    F: "green",
    D: "yellow",
    L: "orange",
    B: "blue",
  };
  const out = [];
  for (const face of ["U", "R", "F", "D", "L", "B"]) {
    for (let i = 0; i < 9; i++) out.push(faceColor[face]);
  }
  return out;
}

function applyCycle(arr, cycle, times) {
  const n = ((times % 4) + 4) % 4;
  if (n === 0) return;
  const src = cycle.map((i) => arr[i]);
  for (let i = 0; i < cycle.length; i++) {
    arr[cycle[(i + n) % cycle.length]] = src[i];
  }
}

export function applyMoveToColors(colors, move) {
  const face = move[0];
  const suffix = move.slice(1);
  let turns = 1;
  if (suffix === "'") turns = 3;
  else if (suffix === "2") turns = 2;
  const next = colors.slice();
  for (const cycle of FACE_CYCLES[face]) {
    applyCycle(next, cycle, turns);
  }
  return next;
}

export function scrambleColors(moves = 25) {
  const faces = ["U", "R", "F", "D", "L", "B"];
  const mods = ["", "'", "2"];
  let colors = solvedColors();
  let last = null;
  for (let i = 0; i < moves; i++) {
    let face;
    do {
      face = faces[Math.floor(Math.random() * faces.length)];
    } while (face === last);
    last = face;
    const move = face + mods[Math.floor(Math.random() * mods.length)];
    colors = applyMoveToColors(colors, move);
  }
  return colors;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CubeScene {
  constructor(container, { onPaint, onReady } = {}) {
    this.container = container;
    this.onPaint = onPaint;
    this.colors = solvedColors();
    this.paintColor = "red";
    this.animating = false;
    this.highlightIndex = -1;
    this.stickers = new Map(); // faceletIndex -> mesh
    this.cubies = [];
    this._raf = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(4.6, 3.4, 5.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 12;
    this.controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(5, 8, 4);
    const fill = new THREE.DirectionalLight(0x9fd6ff, 0.35);
    fill.position.set(-4, 2, -3);
    this.scene.add(ambient, key, fill);

    this.cubeRoot = new THREE.Group();
    this.scene.add(this.cubeRoot);
    this.pivot = new THREE.Group();
    this.cubeRoot.add(this.pivot);

    this._buildCubies();
    this._applyColors();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._bindEvents();
    this._resize();
    this._animate();
    onReady?.();
  }

  _bindEvents() {
    this._onResize = () => this._resize();
    window.addEventListener("resize", this._onResize);

    this._pointerDown = null;
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      this._pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (!this._pointerDown || this._pointerDown.id !== e.pointerId) return;
      const dx = e.clientX - this._pointerDown.x;
      const dy = e.clientY - this._pointerDown.y;
      this._pointerDown = null;
      if (Math.hypot(dx, dy) > 6) return;
      this._tryPaint(e);
    });
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _buildCubies() {
    const geo = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE);
    const stickerGeo = new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const mat = new THREE.MeshStandardMaterial({
            color: PLASTIC,
            roughness: 0.55,
            metalness: 0.08,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * GAP, y * GAP, z * GAP);
          mesh.userData.grid = { x, y, z };
          this.cubeRoot.add(mesh);
          this.cubies.push(mesh);

          for (const [face, normal] of Object.entries(FACE_NORMAL)) {
            const [nx, ny, nz] = normal;
            if (x * nx + y * ny + z * nz !== 1) continue;
            const idx = FACELET_MAP.findIndex(
              (m) => m.face === face && m.pos[0] === x && m.pos[1] === y && m.pos[2] === z
            );
            if (idx < 0) continue;
            const sticker = new THREE.Mesh(
              stickerGeo,
              new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.4,
                metalness: 0.05,
                emissive: 0x000000,
                emissiveIntensity: 0,
              })
            );
            sticker.position.set(nx * 0.501, ny * 0.501, nz * 0.501);
            if (face === "U") sticker.rotation.x = -Math.PI / 2;
            else if (face === "D") sticker.rotation.x = Math.PI / 2;
            else if (face === "R") sticker.rotation.y = Math.PI / 2;
            else if (face === "L") sticker.rotation.y = -Math.PI / 2;
            else if (face === "B") sticker.rotation.y = Math.PI;
            sticker.userData.faceletIndex = idx;
            sticker.userData.isCenter = CENTER_INDICES.has(idx);
            mesh.add(sticker);
            this.stickers.set(idx, sticker);
          }
        }
      }
    }
  }

  _applyColors() {
    for (let i = 0; i < 54; i++) {
      const sticker = this.stickers.get(i);
      if (!sticker) continue;
      const color = this.colors[i];
      sticker.material.color.setHex(COLOR_HEX[color] ?? 0x888888);
      const active = i === this.highlightIndex;
      sticker.material.emissive.setHex(active ? 0xc8f542 : 0x000000);
      sticker.material.emissiveIntensity = active ? 0.55 : 0;
      sticker.scale.setScalar(active ? 1.06 : 1);
    }
  }

  setColors(colors, { resetHighlight = true } = {}) {
    this.colors = colors.slice();
    if (resetHighlight) this.highlightIndex = -1;
    this._resetCubieTransforms();
    this._applyColors();
  }

  getColors() {
    return this.colors.slice();
  }

  setPaintColor(color) {
    this.paintColor = color;
  }

  setHighlight(index) {
    this.highlightIndex = index;
    this._applyColors();
  }

  _tryPaint(event) {
    if (this.animating) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [...this.stickers.values()];
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return;
    const sticker = hits[0].object;
    const idx = sticker.userData.faceletIndex;
    if (sticker.userData.isCenter) {
      this.onPaint?.({ blocked: true, reason: "Centers stay fixed — they define each face." });
      return;
    }
    this.colors[idx] = this.paintColor;
    this._applyColors();
    this.onPaint?.({ blocked: false, index: idx, color: this.paintColor });
  }

  _resetCubieTransforms() {
    for (const cubie of this.cubies) {
      if (cubie.parent !== this.cubeRoot) this.cubeRoot.attach(cubie);
      const { x, y, z } = cubie.userData.grid;
      cubie.position.set(x * GAP, y * GAP, z * GAP);
      cubie.rotation.set(0, 0, 0);
      cubie.quaternion.identity();
    }
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.quaternion.identity();
  }

  _cubiesOnLayer(face) {
    const axis = AXIS_FOR_FACE[face];
    const value = LAYER_VALUE[face];
    return this.cubies.filter((c) => c.userData.grid[axis] === value);
  }

  async animateMove(move, duration = 320) {
    if (this.animating) return;
    this.animating = true;
    this.controls.enabled = false;

    const face = move[0];
    const suffix = move.slice(1);
    let quarters = CW_QUARTERS[face];
    if (suffix === "'") quarters *= -1;
    else if (suffix === "2") quarters *= 2;

    const angle = quarters * (Math.PI / 2);
    const axis = AXIS_FOR_FACE[face];
    const layerCubies = this._cubiesOnLayer(face);

    this.pivot.rotation.set(0, 0, 0);
    for (const c of layerCubies) this.pivot.attach(c);

    const start = performance.now();
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOutCubic(t);
        this.pivot.rotation[axis] = angle * e;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    for (const c of layerCubies) this.cubeRoot.attach(c);
    this.pivot.rotation.set(0, 0, 0);

    // Stickers stay in fixed facelet slots; only colors permute.
    this.colors = applyMoveToColors(this.colors, move);
    this._resetCubieTransforms();
    this._applyColors();

    this.animating = false;
    this.controls.enabled = true;
  }

  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    this.controls.update();
    // Subtle idle sway when idle
    if (!this.animating) {
      const t = performance.now() * 0.00035;
      this.cubeRoot.rotation.y = Math.sin(t) * 0.04;
      this.cubeRoot.rotation.x = Math.cos(t * 0.8) * 0.02;
    } else {
      this.cubeRoot.rotation.set(0, 0, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.innerHTML = "";
  }
}
