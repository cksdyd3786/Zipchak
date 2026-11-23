"""소프트 점수 (M2-3) — 인터페이스.

score_layout(room, items, weights) -> {"breakdown": {키: 0~1}, "reasons": {키: 문장}, "score": 0~100}

⚠️ 지금 구현은 M2-1(배치안 생성)을 돌리기 위한 **임시 근사**다. 항목 정의와 정확한 계산은 M2-3(#20)에서 채운다.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from app.constraints import Furniture, build_grid
from app.geometry import world_side
from app.room import Room

SCORE_KEYS = ("monitorGlare", "daylight", "circulation", "openness", "storageAccess", "bedPlacement")


def total_score(breakdown: dict[str, float], weights: dict[str, float]) -> int:
    wsum = sum(max(0.0, weights.get(k, 1.0)) for k in SCORE_KEYS)
    if wsum <= 0:
        return round(100 * sum(breakdown.values()) / len(SCORE_KEYS))
    return round(100 * sum(max(0.0, weights.get(k, 1.0)) * breakdown[k] for k in SCORE_KEYS) / wsum)


def _first(items: list[Furniture], category: str) -> Furniture | None:
    return next((f for f in items if f.category == category), None)


def _center(f: Furniture) -> tuple[float, float]:
    r = f.rect
    return ((r.min_x + r.max_x) / 2, (r.min_z + r.max_z) / 2)


def _open_ratio(room: Room, items: list[Furniture]) -> float:
    from app.deadspace import open_floor

    grid = build_grid(room, items)
    inside = Room_inside_cells(room)
    if inside == 0:
        return 0.0
    return float(np.count_nonzero(open_floor(grid))) / inside


def Room_inside_cells(room: Room) -> int:  # noqa: N802 - 캐시용 보조 함수
    cached = getattr(room, "_inside_cells", None)
    if cached is None:
        from app.grid import Grid

        cached = int(np.count_nonzero(~Grid.for_polygon(room.polygon).blocked))
        room._inside_cells = cached  # type: ignore[attr-defined]
    return cached


def score_layout_fast(room: Room, items: list[Furniture]) -> dict[str, float]:
    """그리드 계산이 필요한 openness 를 뺀 항목들 (openness 는 0.5 고정). 빔 서치 후보 거르기용."""
    b = {k: 0.5 for k in SCORE_KEYS}
    desk = _first(items, "desk")
    bed = _first(items, "bed")
    windows = room.windows
    diag = math.hypot(room.bounds[2] - room.bounds[0], room.bounds[3] - room.bounds[1]) or 1.0

    if desk and windows:
        dc = _center(desk)
        win = min(windows, key=lambda w: math.dist(dc, w.center))
        d = math.dist(dc, win.center)
        b["daylight"] = max(0.0, 1.0 - d / diag)
        fx, fz = world_side("front", desk.rotation)
        view = (-fx, -fz)  # 앉은 사람은 정면의 반대(책상 쪽)를 본다
        to_win = ((win.center[0] - dc[0]) / (d or 1), (win.center[1] - dc[1]) / (d or 1))
        cos = view[0] * to_win[0] + view[1] * to_win[1]
        b["monitorGlare"] = 0.6 if cos > 0.7 else (0.2 if cos < -0.7 else 1.0)
    if bed and room.doors:
        bc = _center(bed)
        v = min(1.0, min(math.dist(bc, d.center) for d in room.doors) / (diag * 0.7))
        # 창 바로 옆(1m 안)이면 아침 빛, 에어컨 바람길이면 감점 (M2-3 에서 정밀화)
        if any(math.dist(bc, w.center) < 1000 + min(bed.width, bed.depth) / 2 for w in windows):
            v -= 0.3
        for fx in room.data.get("fixtures", []):
            if fx.get("type") == "aircon" and fx.get("position") and fx.get("direction"):
                px, pz = fx["position"]["x"], fx["position"]["z"]
                dx, dz = fx["direction"]["x"], fx["direction"]["z"]
                r = bed.rect
                for t in range(0, 4000, 100):
                    x, z = px + dx * t, pz + dz * t
                    if r.min_x <= x <= r.max_x and r.min_z <= z <= r.max_z:
                        v -= 0.3
                        break
        b["bedPlacement"] = max(0.0, v)
    b["circulation"] = 1.0
    b["storageAccess"] = 1.0
    return b


def score_layout(room: Room, items: list[Furniture], weights: dict[str, float]) -> dict[str, Any]:
    b = score_layout_fast(room, items)
    b["openness"] = min(1.0, _open_ratio(room, items))
    b = {k: round(float(v), 3) for k, v in b.items()}
    return {"breakdown": b, "reasons": {}, "score": total_score(b, weights)}
