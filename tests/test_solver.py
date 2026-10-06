"""Tests for Spinforge solver validation and Kociemba integration."""

from __future__ import annotations

import random

import pytest

from app.solver import (
    SOLVED_FACELETS,
    CubeValidationError,
    colors_to_facelets,
    solve_colors,
    solve_facelets,
    solved_colors,
)

# Verified against kociemba moveCube
FACE_CYCLES = {
    "U": [
        [0, 2, 8, 6],
        [1, 5, 7, 3],
        [9, 18, 36, 45],
        [10, 19, 37, 46],
        [11, 20, 38, 47],
    ],
    "R": [
        [2, 51, 29, 20],
        [5, 48, 32, 23],
        [8, 45, 35, 26],
        [9, 11, 17, 15],
        [10, 14, 16, 12],
    ],
    "F": [
        [6, 9, 29, 44],
        [7, 12, 28, 41],
        [8, 15, 27, 38],
        [18, 20, 26, 24],
        [19, 23, 25, 21],
    ],
    "D": [
        [15, 51, 42, 24],
        [16, 52, 43, 25],
        [17, 53, 44, 26],
        [27, 29, 35, 33],
        [28, 32, 34, 30],
    ],
    "L": [
        [0, 18, 27, 53],
        [3, 21, 30, 50],
        [6, 24, 33, 47],
        [36, 38, 44, 42],
        [37, 41, 43, 39],
    ],
    "B": [
        [0, 42, 35, 11],
        [1, 39, 34, 14],
        [2, 36, 33, 17],
        [45, 47, 53, 51],
        [46, 50, 52, 48],
    ],
}


def _apply_cycle(arr: list[str], cycle: list[int], times: int) -> None:
    n = times % 4
    if not n:
        return
    src = [arr[i] for i in cycle]
    for i, _ in enumerate(cycle):
        arr[cycle[(i + n) % len(cycle)]] = src[i]


def apply_move(facelets: str, move: str) -> str:
    face = move[0]
    turns = {"": 1, "'": 3, "2": 2}[move[1:]]
    arr = list(facelets)
    for cycle in FACE_CYCLES[face]:
        _apply_cycle(arr, cycle, turns)
    return "".join(arr)


def test_solved_is_noop():
    result = solve_facelets(SOLVED_FACELETS)
    assert result.moves == []
    assert result.move_count == 0


def test_solved_colors_roundtrip():
    colors = solved_colors()
    assert colors_to_facelets(colors) == SOLVED_FACELETS


def test_invalid_center_rejected():
    colors = solved_colors()
    colors[4] = "red"  # U center must stay white
    with pytest.raises(CubeValidationError, match="Center"):
        solve_colors(colors)


def test_wrong_color_counts_rejected():
    colors = solved_colors()
    colors[0] = "red"  # now 10 red, 8 white
    with pytest.raises(CubeValidationError, match="exactly 9"):
        solve_colors(colors)


def test_impossible_corner_twist():
    # Twist one corner: swap two stickers on URF (indices U9=8, R1=9)
    colors = solved_colors()
    colors[8], colors[9] = colors[9], colors[8]
    with pytest.raises(CubeValidationError):
        solve_colors(colors)


def test_scramble_then_solve_restores():
    random.seed(42)
    state = SOLVED_FACELETS
    last = None
    for _ in range(28):
        face = random.choice(list("URFDLB"))
        while face == last:
            face = random.choice(list("URFDLB"))
        last = face
        state = apply_move(state, face + random.choice(["", "'", "2"]))

    result = solve_facelets(state)
    assert result.move_count > 0
    cur = state
    for move in result.moves:
        cur = apply_move(cur, move)
    assert cur == SOLVED_FACELETS


def test_docstring_scramble():
    scramble = "BBURUDBFUFFFRRFUUFLULUFUDLRRDBBDBDBLUDDFLLRRBRLLLBRDDF"
    result = solve_facelets(scramble)
    assert result.move_count > 0
    cur = scramble
    for move in result.moves:
        cur = apply_move(cur, move)
    assert cur == SOLVED_FACELETS
