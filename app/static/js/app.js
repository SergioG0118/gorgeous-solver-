import { COLORS, COLOR_HEX, CubeScene, scrambleColors, solvedColors } from "./cube.js";

const $ = (sel) => document.querySelector(sel);

const ui = {
  root: $("#cube-root"),
  swatches: $("#swatches"),
  status: $("#status"),
  hint: $("#stage-hint"),
  btnSolve: $("#btn-solve"),
  btnReset: $("#btn-reset"),
  btnScramble: $("#btn-scramble"),
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
};

let cube;
let solutionMoves = [];
/** Index of next move to apply; 0 = at solution start state. */
let stepIndex = 0;
let playing = false;
let paintColor = "red";
/** Colors snapshot when solution was computed (before playback). */
let solutionBaseColors = null;

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
  // Rewind to base then replay — reliable vs reverse animation edge cases
  playing = false;
  ui.btnPlay.textContent = "Play";
  cube.setColors(solutionBaseColors);
  stepIndex = 0;
  for (let i = 0; i < target; i++) {
    await cube.animateMove(solutionMoves[i], 180);
    stepIndex = i + 1;
  }
  cube.setHighlight(-1);
  if (stepIndex < solutionMoves.length) {
    // Soft highlight via chip only
  }
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

  // Empty/loading first paint
  setStatus("loading", "Loading 3D stage…");
  requestAnimationFrame(() => {
    setStatus("idle", "Ready when your stickers match the cube in your hands.");
  });
}

init();
