/**
 * Camera face scan — getUserMedia + canvas 3×3 sticker sampling.
 * No ML model: classifies stickers by distance in HSL/RGB to Western palette.
 */

export const SCAN_FACES = [
  {
    id: "U",
    title: "Up (white)",
    center: "white",
    hold: "Hold the white center toward the camera. Keep the green face toward the bottom of the screen.",
  },
  {
    id: "R",
    title: "Right (red)",
    center: "red",
    hold: "Hold the red center toward the camera. Keep white toward the top of the screen.",
  },
  {
    id: "F",
    title: "Front (green)",
    center: "green",
    hold: "Hold the green center toward the camera. Keep white toward the top of the screen.",
  },
  {
    id: "D",
    title: "Down (yellow)",
    center: "yellow",
    hold: "Tip the cube so yellow faces the camera. Keep the green face toward the top of the screen.",
  },
  {
    id: "L",
    title: "Left (orange)",
    center: "orange",
    hold: "Hold the orange center toward the camera. Keep white toward the top of the screen.",
  },
  {
    id: "B",
    title: "Back (blue)",
    center: "blue",
    hold: "Hold the blue center toward the camera. Keep white toward the top of the screen.",
  },
];

/** Facelet index ranges in U,R,F,D,L,B order. */
export const FACE_OFFSET = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };

/** Reference RGB for classification (match cube.js hex). */
const REF = {
  white: { r: 244, g: 247, b: 242 },
  yellow: { r: 245, g: 215, b: 110 },
  red: { r: 226, g: 75, b: 75 },
  orange: { r: 240, g: 138, b: 58 },
  blue: { r: 59, g: 111, b: 212 },
  green: { r: 63, g: 173, b: 92 },
};

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/**
 * Classify a sampled RGB average as a cube sticker color.
 * Prefer hue for chromatics; luminance gates white vs yellow.
 */
export function classifyColor(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);

  // Very dark / muddy → low confidence, still pick nearest
  if (l < 0.12) {
    return { color: nearestRgb(r, g, b), confidence: 0.25, reason: "too-dark" };
  }

  // Low saturation → white / yellow by luminance
  if (s < 0.18) {
    if (l > 0.72) return { color: "white", confidence: 0.85, reason: "neutral-bright" };
    if (l > 0.45) return { color: "yellow", confidence: 0.55, reason: "neutral-mid" };
    return { color: nearestRgb(r, g, b), confidence: 0.35, reason: "neutral-dim" };
  }

  // Chromatic by hue bands (Western cube)
  let color;
  if (h < 18 || h >= 340) color = "red";
  else if (h < 45) color = "orange";
  else if (h < 75) color = l > 0.55 && s < 0.55 ? "yellow" : "yellow";
  else if (h < 160) color = "green";
  else if (h < 255) color = "blue";
  else color = "red";

  // Yellow vs orange fine-tune
  if (color === "yellow" && h < 42 && s > 0.55) color = "orange";
  if (color === "orange" && h > 48 && l > 0.6) color = "yellow";

  // White: bright + not too saturated
  if (l > 0.82 && s < 0.28) color = "white";

  const dist = rgbDist(r, g, b, REF[color]);
  const confidence = Math.max(0.3, Math.min(0.98, 1 - dist / 220));
  return { color, confidence, reason: "hue" };
}

function rgbDist(r, g, b, ref) {
  return Math.hypot(r - ref.r, g - ref.g, b - ref.b);
}

function nearestRgb(r, g, b) {
  let best = "white";
  let bestD = Infinity;
  for (const [name, ref] of Object.entries(REF)) {
    const d = rgbDist(r, g, b, ref);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/**
 * Sample 9 stickers from a video frame.
 * Grid is centered square covering `gridFrac` of the shorter video side.
 */
export function sampleFaceFromVideo(video, opts = {}) {
  const gridFrac = opts.gridFrac ?? 0.62;
  const patch = opts.patch ?? 10;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    return { ok: false, error: "Camera frame not ready yet.", colors: null };
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);

  const side = Math.min(w, h) * gridFrac;
  const left = (w - side) / 2;
  const top = (h - side) / 2;
  const cell = side / 3;

  const colors = [];
  const samples = [];
  let brightness = 0;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = Math.round(left + cell * (col + 0.5));
      const cy = Math.round(top + cell * (row + 0.5));
      const x0 = Math.max(0, cx - patch);
      const y0 = Math.max(0, cy - patch);
      const pw = Math.min(patch * 2, w - x0);
      const ph = Math.min(patch * 2, h - y0);
      const data = ctx.getImageData(x0, y0, pw, ph).data;
      let r = 0;
      let g = 0;
      let b = 0;
      const n = pw * ph;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      brightness += (r + g + b) / 3;
      const classified = classifyColor(r, g, b);
      colors.push(classified.color);
      samples.push({ r, g, b, ...classified, x: cx, y: cy });
    }
  }

  brightness /= 9;
  if (brightness < 28) {
    return {
      ok: false,
      error: "Too dark — add light so stickers are clearly visible.",
      colors,
      samples,
      brightness,
    };
  }

  return { ok: true, colors, samples, brightness };
}

/**
 * Apply a scanned face (9 colors) into a full 54-sticker array.
 * Center sticker is forced to the face's Western center color.
 */
export function applyFaceToCubeColors(allColors, faceId, faceColors9) {
  const offset = FACE_OFFSET[faceId];
  const faceMeta = SCAN_FACES.find((f) => f.id === faceId);
  const next = allColors.slice();
  for (let i = 0; i < 9; i++) {
    next[offset + i] = faceColors9[i];
  }
  // Lock center
  next[offset + 4] = faceMeta.center;
  return next;
}

export async function startCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("Camera API not available in this browser.");
    err.code = "unsupported";
    throw err;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    const err = new Error(
      e.name === "NotAllowedError" || e.name === "PermissionDeniedError"
        ? "Camera permission denied — allow access in the browser, then try again."
        : e.name === "NotFoundError"
          ? "No camera found on this device."
          : `Could not open camera: ${e.message || e.name}`
    );
    err.code =
      e.name === "NotAllowedError" || e.name === "PermissionDeniedError"
        ? "denied"
        : e.name === "NotFoundError"
          ? "missing"
          : "error";
    err.cause = e;
    throw err;
  }
}

export function stopCamera(stream, videoEl) {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }
}
