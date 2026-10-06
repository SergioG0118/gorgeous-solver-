import { COLORS, COLOR_HEX, CubeScene, scrambleColors, solvedColors } from "./cube.js";
import {
  SCAN_FACES,
  applyFaceToCubeColors,
  sampleFaceFromVideo,
  startCamera,
  stopCamera,
} from "./camera.js";

const $ = (sel) => document.querySelector(sel);

const ui = {
  root: $("#cube-root"),
  swatches: $("#swatches"),
  status: $("#status"),
  hint: $("#stage-hint"),
  btnSolve: $("#btn-solve"),
  btnReset: $("#btn-reset"),
  btnScramble: $("#btn-scramble"),
  btnScan: $("#btn-scan"),
  btnPlay: $("#btn-play"),
  btnPrev: $("#btn-prev"),
  btnNext: $("#btn-next"),
  btnRewind: $("#btn-rewind"),
  solutionBlock: $("#solution-block"),
  moves: $("#moves"),
  moveCount: $("#move-count"),
  stepLabel: $("#step-label"),
  btnLabel: $(".btn-label"),
  btnSpinner: $(".btn-spinner"),
  scanModal: $("#scan-modal"),
  scanVideo: $("#scan-video"),
  scanGrid: $("#scan-grid"),
  scanEmpty: $("#scan-empty"),
  scanEmptyMsg: $("#scan-empty-msg"),
  scanPreview: $("#scan-preview"),
  scanStatus: $("#scan-status"),
  scanHold: $("#scan-hold"),
  scanTitle: $("#scan-title"),
  scanProgress: $("#scan-progress"),
  btnScanClose: $("#btn-scan-close"),
  btnScanCapture: $("#btn-scan-capture"),
  btnScanBack: $("#btn-scan-back"),
};

let cube;
let solutionMoves = [];
/** Index of next move to apply; 0 = at solution start state. */
let stepIndex = 0;
let playing = false;
let paintColor = "red";
/** Colors snapshot when solution was computed (before playback). */
let solutionBaseColors = null;

/** Camera scan state */
let scanStream = null;
let scanFaceIndex = 0;
let scanDraftColors = null;
let scanLiveColors = null;
let scanRaf = 0;
let scanOpen = false;

function setStatus(kind, message) {
  ui.status.className = `status ${kind}`;
  ui.status.textContent = message;
}

function setLoading(on) {
  ui.btnSolve.disabled = on;
  ui.btnSpinner.hidden = !on;
  ui.btnLabel.textContent = on ? "Solving…" : "Solve cube";
}

function buildSwatches() {
  ui.swatches.innerHTML = "";
  for (const color of COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `swatch ${color}`;
    btn.title = color;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-label", color);
    btn.setAttribute("aria-selected", color === paintColor ? "true" : "false");
    btn.style.background = `#${COLOR_HEX[color].toString(16).padStart(6, "0")}`;
    btn.addEventListener("click", () => {
      paintColor = color;
      cube.setPaintColor(color);
      for (const el of ui.swatches.children) {
        el.setAttribute("aria-selected", el === btn ? "true" : "false");
      }
      ui.hint.textContent = `Painting ${color}. Tap stickers on the cube. Centers stay locked.`;
    });
    ui.swatches.appendChild(btn);
  }
}

function clearSolutionUi() {
  solutionMoves = [];
  stepIndex = 0;
  playing = false;
  solutionBaseColors = null;
  ui.solutionBlock.hidden = true;
  ui.moves.innerHTML = "";
  ui.moveCount.textContent = "";
  ui.stepLabel.textContent = "Step 0 of 0";
  ui.btnPlay.textContent = "Play";
  cube?.setHighlight(-1);
  updatePlaybackButtons();
}

function renderMoves() {
  ui.moves.innerHTML = "";
  solutionMoves.forEach((move, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "move-chip";
    chip.textContent = move;
    chip.dataset.index = String(i);
    if (i < stepIndex) chip.classList.add("done");
    if (i === stepIndex) chip.classList.add("active");
    chip.addEventListener("click", async () => {
      if (cube.animating || playing) return;
      await jumpToStep(i);
    });
    ui.moves.appendChild(chip);
  });
  ui.moveCount.textContent = `${solutionMoves.length} moves`;
  ui.stepLabel.textContent = `Step ${stepIndex} of ${solutionMoves.length}`;
  updatePlaybackButtons();
}

function updatePlaybackButtons() {
  const has = solutionMoves.length > 0;
  ui.btnPrev.disabled = !has || stepIndex <= 0 || playing || cube?.animating;
  ui.btnNext.disabled = !has || stepIndex >= solutionMoves.length || playing || cube?.animating;
  ui.btnPlay.disabled = !has || cube?.animating;
  ui.btnRewind.disabled = !has || playing || cube?.animating;
}

async function jumpToStep(target) {
  if (!solutionBaseColors || target === stepIndex) return;
  playing = false;
  ui.btnPlay.textContent = "Play";
  cube.setColors(solutionBaseColors);
  stepIndex = 0;
  for (let i = 0; i < target; i++) {
    await cube.animateMove(solutionMoves[i], 180);
    stepIndex = i + 1;
  }
  cube.setHighlight(-1);
  renderMoves();
}

async function stepForward() {
  if (stepIndex >= solutionMoves.length || cube.animating) return;
  const move = solutionMoves[stepIndex];
  cube.setHighlight(-1);
  await cube.animateMove(move, 340);
  stepIndex += 1;
  renderMoves();
}

async function stepBack() {
  if (stepIndex <= 0 || cube.animating) return;
  await jumpToStep(stepIndex - 1);
}

async function playAll() {
  if (playing) {
    playing = false;
    ui.btnPlay.textContent = "Play";
    updatePlaybackButtons();
    return;
  }
  if (stepIndex >= solutionMoves.length) {
    await jumpToStep(0);
  }
  playing = true;
  ui.btnPlay.textContent = "Pause";
  updatePlaybackButtons();
  while (playing && stepIndex < solutionMoves.length) {
    await stepForward();
    if (!playing) break;
    await delay(120);
  }
  playing = false;
  ui.btnPlay.textContent = "Play";
  updatePlaybackButtons();
  if (stepIndex >= solutionMoves.length) {
    setStatus("ok", "Sequence complete — cube should be solved.");
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function solveCube() {
  clearSolutionUi();
  setLoading(true);
  setStatus("loading", "Running Kociemba two-phase search…");
  try {
    const res = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colors: cube.getColors() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail || "Could not solve this configuration.";
      setStatus("error", typeof detail === "string" ? detail : JSON.stringify(detail));
      ui.hint.textContent = "Fix the highlighted issue, then try Solve again.";
      return;
    }
    solutionMoves = data.moves || [];
    solutionBaseColors = cube.getColors();
    stepIndex = 0;
    ui.solutionBlock.hidden = false;
    renderMoves();
    setStatus("ok", data.message || "Solution ready.");
    ui.hint.textContent =
      solutionMoves.length === 0
        ? "Already solved. Paint a scramble or hit Random scramble."
        : "Press Play or step through moves. Active move is highlighted.";
  } catch (err) {
    setStatus("error", "Network error — is the Spinforge server running?");
    console.error(err);
  } finally {
    setLoading(false);
    updatePlaybackButtons();
  }
}

function hexCss(colorName) {
  return `#${COLOR_HEX[colorName].toString(16).padStart(6, "0")}`;
}

function renderScanPreview(colors9) {
  ui.scanPreview.innerHTML = "";
  const face = SCAN_FACES[scanFaceIndex];
  for (let i = 0; i < 9; i++) {
    const color = i === 4 ? face.center : colors9?.[i] || "white";
    const sw = document.createElement("span");
    sw.style.background = hexCss(color);
    sw.title = color;
    ui.scanPreview.appendChild(sw);
  }
}

function setScanFaceUi() {
  const face = SCAN_FACES[scanFaceIndex];
  ui.scanProgress.textContent = `Face ${scanFaceIndex + 1} of ${SCAN_FACES.length}`;
  ui.scanTitle.textContent = face.title;
  ui.scanHold.textContent = face.hold;
  ui.btnScanBack.disabled = scanFaceIndex === 0;
  ui.btnScanCapture.textContent =
    scanFaceIndex === SCAN_FACES.length - 1 ? "Capture & finish" : "Capture face";
  for (const cell of ui.scanGrid.querySelectorAll(".scan-cell")) {
    cell.classList.toggle("center-lock", cell.dataset.i === "4");
  }
  renderScanPreview(scanLiveColors);
}

function setScanStatus(kind, message) {
  ui.scanStatus.className = `scan-status${kind ? ` ${kind}` : ""}`;
  ui.scanStatus.textContent = message;
}

function showScanEmpty(message) {
  ui.scanEmpty.hidden = false;
  ui.scanEmptyMsg.textContent = message;
}

function hideScanEmpty() {
  ui.scanEmpty.hidden = true;
}

function scanLoop() {
  if (!scanOpen) return;
  if (ui.scanVideo.readyState >= 2) {
    const result = sampleFaceFromVideo(ui.scanVideo);
    if (result.ok) {
      scanLiveColors = result.colors;
      renderScanPreview(result.colors);
      hideScanEmpty();
      if (ui.scanStatus.classList.contains("error") === false) {
        // keep capture hint unless error
      }
    } else if (result.error && result.brightness != null && result.brightness < 28) {
      setScanStatus("error", result.error);
      showScanEmpty(result.error);
    }
  }
  scanRaf = requestAnimationFrame(scanLoop);
}

async function openScanner() {
  if (scanOpen) return;
  scanOpen = true;
  scanFaceIndex = 0;
  scanDraftColors = cube.getColors();
  scanLiveColors = null;
  ui.scanModal.hidden = false;
  setScanFaceUi();
  setScanStatus("", "Starting camera…");
  showScanEmpty("Starting camera…");
  ui.btnScanCapture.disabled = true;

  try {
    scanStream = await startCamera(ui.scanVideo);
    hideScanEmpty();
    setScanStatus("", "Align the face in the grid, then capture.");
    ui.btnScanCapture.disabled = false;
    cancelAnimationFrame(scanRaf);
    scanRaf = requestAnimationFrame(scanLoop);
  } catch (err) {
    console.error(err);
    showScanEmpty(err.message);
    setScanStatus("error", err.message);
    ui.btnScanCapture.disabled = true;
  }
}

function closeScanner() {
  scanOpen = false;
  cancelAnimationFrame(scanRaf);
  stopCamera(scanStream, ui.scanVideo);
  scanStream = null;
  ui.scanModal.hidden = true;
  ui.btnScanCapture.disabled = false;
}

function captureCurrentFace() {
  if (!scanOpen) return;
  const face = SCAN_FACES[scanFaceIndex];
  let colors9 = scanLiveColors;

  if (!colors9) {
    const result = sampleFaceFromVideo(ui.scanVideo);
    if (!result.ok && !result.colors) {
      setScanStatus("error", result.error || "Could not sample frame.");
      return;
    }
    if (!result.ok && result.error) {
      setScanStatus("error", result.error);
      return;
    }
    colors9 = result.colors;
  }

  // Re-check brightness on capture
  const check = sampleFaceFromVideo(ui.scanVideo);
  if (check.brightness != null && check.brightness < 28) {
    setScanStatus("error", check.error || "Too dark to capture reliably.");
    return;
  }

  colors9 = colors9.slice();
  colors9[4] = face.center;
  scanDraftColors = applyFaceToCubeColors(scanDraftColors, face.id, colors9);
  cube.setColors(scanDraftColors);
  clearSolutionUi();

  if (scanFaceIndex >= SCAN_FACES.length - 1) {
    closeScanner();
    setStatus(
      "ok",
      "Camera scan applied. Spot-check stickers (especially orange/red), then Solve."
    );
    ui.hint.textContent =
      "Scan complete — paint any wrong stickers, then hit Solve cube.";
    return;
  }

  scanFaceIndex += 1;
  scanLiveColors = null;
  setScanFaceUi();
  setScanStatus("ok", `${face.title} saved. Next face…`);
}

function scanGoBack() {
  if (scanFaceIndex <= 0) return;
  scanFaceIndex -= 1;
  scanLiveColors = null;
  setScanFaceUi();
  setScanStatus("", "Re-capture this face when ready.");
}

function init() {
  buildSwatches();
  cube = new CubeScene(ui.root, {
    onPaint: ({ blocked, reason }) => {
      clearSolutionUi();
      if (blocked) {
        setStatus("error", reason);
      } else {
        setStatus("idle", "Stickers updated. Solve when the cube matches yours.");
      }
    },
    onReady: () => setStatus("idle", "Ready when your stickers match the cube in your hands."),
  });
  cube.setPaintColor(paintColor);

  ui.btnReset.addEventListener("click", () => {
    clearSolutionUi();
    cube.setColors(solvedColors());
    setStatus("idle", "Reset to a solved cube.");
    ui.hint.textContent = "Pick a color, then tap stickers to match your physical cube.";
  });

  ui.btnScramble.addEventListener("click", () => {
    clearSolutionUi();
    cube.setColors(scrambleColors(28));
    setStatus("idle", "Random scramble loaded — hit Solve when ready.");
    ui.hint.textContent = "Or keep painting to match your physical cube exactly.";
  });

  ui.btnScan.addEventListener("click", () => openScanner());
  ui.btnScanClose.addEventListener("click", () => {
    closeScanner();
    setStatus("idle", "Scan cancelled. Paint or resume scan anytime.");
  });
  ui.btnScanCapture.addEventListener("click", () => captureCurrentFace());
  ui.btnScanBack.addEventListener("click", () => scanGoBack());
  ui.scanModal.addEventListener("click", (e) => {
    if (e.target === ui.scanModal) {
      closeScanner();
      setStatus("idle", "Scan cancelled. Paint or resume scan anytime.");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && scanOpen) {
      closeScanner();
      setStatus("idle", "Scan cancelled. Paint or resume scan anytime.");
    }
  });

  ui.btnSolve.addEventListener("click", () => solveCube());
  ui.btnPlay.addEventListener("click", () => playAll());
  ui.btnNext.addEventListener("click", () => stepForward());
  ui.btnPrev.addEventListener("click", () => stepBack());
  ui.btnRewind.addEventListener("click", async () => {
    if (!solutionBaseColors) return;
    playing = false;
    cube.setColors(solutionBaseColors);
    stepIndex = 0;
    renderMoves();
    setStatus("ok", "Rewound to the start of the solution.");
  });

  setStatus("loading", "Loading 3D stage…");
  requestAnimationFrame(() => {
    setStatus("idle", "Ready when your stickers match the cube in your hands.");
  });
}

init();
