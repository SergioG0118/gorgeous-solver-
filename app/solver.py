"""Cube validation and solving via the Kociemba two-phase algorithm."""

from __future__ import annotations

from dataclasses import dataclass

import kociemba

FACE_ORDER = ("U", "R", "F", "D", "L", "B")
FACELET_COUNT = 54
STICKERS_PER_FACE = 9

# Western color scheme: centers define face letters for the solver.
COLOR_TO_FACE = {
    "white": "U",
    "red": "R",
    "green": "F",
    "yellow": "D",
    "orange": "L",
    "blue": "B",
}

FACE_TO_COLOR = {v: k for k, v in COLOR_TO_FACE.items()}

CENTER_INDICES = {
    "U": 4,
    "R": 13,
    "F": 22,
    "D": 31,
    "L": 40,
    "B": 49,
}

SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"

KOCIEMBA_ERRORS = {
    "Error 1": "Each color must appear exactly nine times.",
    "Error 2": "Edge pieces are incomplete or duplicated.",
    "Error 3": "Impossible edge flip — check edge stickers.",
    "Error 4": "Corner pieces are incomplete or duplicated.",
    "Error 5": "Impossible corner twist — check corner stickers.",
    "Error 6": "Parity error — two pieces need to be swapped.",
    "Error 7": "No solution found within search depth.",
    "Error 8": "Solver timed out — try again.",
}


@dataclass
class SolveResult:
    moves: list[str]
    move_count: int
    facelets: str


class CubeValidationError(ValueError):
    """Raised when the painted cube cannot be solved."""


def colors_to_facelets(colors: list[str]) -> str:
    """Convert 54 color names into a Kociemba facelet string."""
    if len(colors) != FACELET_COUNT:
        raise CubeValidationError(
            f"Expected {FACELET_COUNT} stickers, got {len(colors)}."
        )

    normalized = [c.strip().lower() for c in colors]
    for color in normalized:
        if color not in COLOR_TO_FACE:
            raise CubeValidationError(
                f"Unknown color '{color}'. Use: {', '.join(COLOR_TO_FACE)}."
            )

    for face, idx in CENTER_INDICES.items():
        expected = FACE_TO_COLOR[face]
        actual = normalized[idx]
        if actual != expected:
            raise CubeValidationError(
                f"Center of the {face} face must stay {expected} "
                f"(got {actual}). Centers define orientation."
            )

    counts: dict[str, int] = {c: 0 for c in COLOR_TO_FACE}
    for color in normalized:
        counts[color] += 1
    bad = [f"{c}×{n}" for c, n in counts.items() if n != STICKERS_PER_FACE]
    if bad:
        raise CubeValidationError(
            "Each color needs exactly 9 stickers. Off counts: " + ", ".join(bad) + "."
        )

    return "".join(COLOR_TO_FACE[c] for c in normalized)


def parse_moves(solution: str) -> list[str]:
    solution = solution.strip()
    if not solution:
        return []
    return solution.split()


def is_solved(facelets: str) -> bool:
    return facelets == SOLVED_FACELETS


def solve_facelets(facelets: str) -> SolveResult:
    if len(facelets) != FACELET_COUNT or any(ch not in FACE_ORDER for ch in facelets):
        raise CubeValidationError("Internal facelet string is invalid.")

    if is_solved(facelets):
        return SolveResult(moves=[], move_count=0, facelets=facelets)

    try:
        raw = kociemba.solve(facelets)
    except ValueError as exc:
        message = str(exc)
        for code, friendly in KOCIEMBA_ERRORS.items():
            if code in message:
                raise CubeValidationError(friendly) from exc
        # Native wrapper often returns a generic message — try pure path details.
        raise CubeValidationError(
            _friendly_kociemba_failure(facelets, message)
        ) from exc

    if raw.startswith("Error"):
        raise CubeValidationError(
            KOCIEMBA_ERRORS.get(raw.split(".")[0].strip(), raw)
        )

    moves = parse_moves(raw)
    # Guard against known kociemba quirk on near-identity inputs.
    if is_solved(facelets):
        moves = []
    return SolveResult(moves=moves, move_count=len(moves), facelets=facelets)


def _friendly_kociemba_failure(facelets: str, fallback: str) -> str:
    try:
        from kociemba.pykociemba import search

        res = search.Search().solution(facelets, 24, 1000, False).strip()
        code = res.split()[0] + (" " + res.split()[1] if res.startswith("Error") else "")
        # res like "Error 3"
        key = " ".join(res.split()[:2]) if res.startswith("Error") else res
        return KOCIEMBA_ERRORS.get(key, fallback or "This color configuration is impossible.")
    except Exception:
        return fallback or "This color configuration is impossible to solve."


def solve_colors(colors: list[str]) -> SolveResult:
    facelets = colors_to_facelets(colors)
    return solve_facelets(facelets)


def solved_colors() -> list[str]:
    return [FACE_TO_COLOR[ch] for ch in SOLVED_FACELETS]
