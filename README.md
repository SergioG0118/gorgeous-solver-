# Spinforge

Interactive 3D Rubik’s cube simulator and solver. Paint stickers to match your physical cube, then get a real step-by-step solution in standard notation (R, U, F′, …) with animated playback on the cube.

Powered by the **Kociemba two-phase algorithm** (`kociemba` Python package) — not a fake or canned solver.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3847
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

## How to use

1. Pick a color in the Paint panel.
2. Click / tap stickers on the 3D cube to match your cube (centers are locked — they define face orientation).
3. Click **Solve cube**.
4. Step through or **Play** the solution; the cube animates each move.

**Random scramble** loads a valid scrambled state for a quick demo.

## API

- `GET /api/health` — status and supported colors
- `GET /api/solved` — solved sticker color list
- `POST /api/solve` — body `{ "colors": [54 color names...] }` in U,R,F,D,L,B facelet order

Colors: `white`, `red`, `green`, `yellow`, `orange`, `blue` (Western scheme: U white, R red, F green, D yellow, L orange, B blue).

## Stack

- Python 3.12 · FastAPI · Uvicorn
- Three.js (ES modules via CDN) for the 3D cube
- `kociemba` for solving

## Project layout

```
app/
  main.py          # FastAPI routes
  solver.py        # validation + Kociemba wrapper
  static/          # UI, CSS, Three.js client
requirements.txt
```
