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

1. **Paint** — pick a color, tap stickers on the 3D cube (centers stay locked).
2. **Or scan** — click **Scan with camera**, show each face (U→R→F→D→L→B) in the on-screen grid, capture, then fix any wrong stickers by painting.
3. Click **Solve cube**.
4. Step through or **Play** the solution; the cube animates each move.

**Random scramble** loads a valid scrambled state for a quick demo.

### Camera scan tips

- Use even lighting; avoid glare on stickers.
- Follow each face prompt so orientation matches the Western scheme (U white, R red, F green, D yellow, L orange, B blue).
- Detection is a **3×3 canvas sample** (no ML) — orange/red and white/yellow can confuse under bad light. Always spot-check before solving.
- If the browser blocks the camera, allow permission and retry. HTTPS or `localhost` is required for `getUserMedia`.

## API

- `GET /api/health` — status and supported colors
- `GET /api/solved` — solved sticker color list
- `POST /api/solve` — body `{ "colors": [54 color names...] }` in U,R,F,D,L,B facelet order

Colors: `white`, `red`, `green`, `yellow`, `orange`, `blue` (Western scheme: U white, R red, F green, D yellow, L orange, B blue).

## Stack

- Python 3.12 · FastAPI · Uvicorn
- Three.js (ES modules via CDN) for the 3D cube
- Browser camera via `getUserMedia` + canvas sticker sampling
- `kociemba` for solving

## Project layout

```
app/
  main.py          # FastAPI routes
  solver.py        # validation + Kociemba wrapper
  static/          # UI, CSS, Three.js + camera client
requirements.txt
```
