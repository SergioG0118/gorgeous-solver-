"""FastAPI entrypoint for Spinforge."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.solver import (
    COLOR_TO_FACE,
    CubeValidationError,
    solve_colors,
    solved_colors,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="Spinforge",
    description="3D Rubik's cube simulator and Kociemba solver",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class SolveRequest(BaseModel):
    colors: list[str] = Field(
        ...,
        min_length=54,
        max_length=54,
        description="54 sticker colors in U,R,F,D,L,B facelet order",
    )


class SolveResponse(BaseModel):
    ok: bool = True
    moves: list[str]
    move_count: int
    facelets: str
    message: str


class HealthResponse(BaseModel):
    status: str
    solver: str
    colors: list[str]


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        solver="kociemba",
        colors=list(COLOR_TO_FACE.keys()),
    )


@app.get("/api/solved")
async def get_solved() -> dict:
    return {"colors": solved_colors()}


@app.post("/api/solve", response_model=SolveResponse)
async def solve(req: SolveRequest) -> SolveResponse:
    try:
        result = solve_colors(req.colors)
    except CubeValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - unexpected solver failures
        raise HTTPException(
            status_code=500,
            detail=f"Solver failed unexpectedly: {exc}",
        ) from exc

    if result.move_count == 0:
        message = "Already solved — no moves needed."
    else:
        message = f"Solution found · {result.move_count} moves"

    return SolveResponse(
        moves=result.moves,
        move_count=result.move_count,
        facelets=result.facelets,
        message=message,
    )
