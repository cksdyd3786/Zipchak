"""데드 스페이스(자투리 공간) 탐지 (M3-3).

정의: 가구를 놓고 남은 바닥 중 **사람이 서거나 지나갈 수 없는(폭 600 미만) 틈**.
  - 쓸 수 있는 칸 = 방 안 − 가구 − 고정물 − 문 부채꼴·문 앞 통로 − 가구 여유 공간(clearance)
  - 열린 바닥 = 600×600 몸통이 들어가는 자리가 덮는 칸 (M2-2 그리드 재사용)
  - 데드 칸 = 쓸 수 있는 칸 − 열린 바닥
데드 칸에서 300×300mm 이상인 최대 직사각형을 큰 것부터 반복해서 뽑는다.

결과 형식은 FurnitureLayout.analysis.deadSpaces[]:
  { id, polygon[4], maxBox{width(=X 길이), depth(=Z 길이), heightLimit}, suggestedCategories }
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.constraints import Furniture, build_grid, furniture_from
from app.geometry import clearance_zones
from app.grid import CELL_MM, PASSAGE_MM, Grid
from app.room import DOOR_APPROACH_DEPTH_MM, Room, rect_polygon

MIN_SIDE_MM = 300
MAX_DEAD_SPACES = 8


def open_floor(grid: Grid) -> np.ndarray:
    """600 몸통이 놓일 수 있는 자리들이 덮는 칸 (nz, nx)."""
    s = PASSAGE_MM // CELL_MM
    free = grid.free_anchors(s)
    cover = np.zeros_like(grid.blocked)
    if free.size == 0:
        return cover
    # 앵커 (j,i) 가 비어 있으면 [j, j+s) × [i, i+s) 를 덮는다 → 2D 누적합으로 한 번에
    diff = np.zeros((grid.nz + 1, grid.nx + 1), dtype=np.int32)
    js, is_ = np.nonzero(free)
    np.add.at(diff, (js, is_), 1)
    np.add.at(diff, (js + s, is_), -1)
    np.add.at(diff, (js, is_ + s), -1)
    np.add.at(diff, (js + s, is_ + s), 1)
    cover = np.cumsum(np.cumsum(diff, axis=0), axis=1)[: grid.nz, : grid.nx] > 0
    return cover


def unusable_grid(room: Room, items: list[Furniture], obstacles: list[Furniture]) -> Grid:
    """가구·고정물에 더해 문 영역과 여유 공간까지 막은 그리드 (물건을 둘 수 없는 곳)."""
    grid = build_grid(room, items + obstacles)
    for door in room.doors:
        sector = door.swing_sector()
        if sector is not None:
            grid.block_polygon(sector)
        grid.block_polygon(door.strip(DOOR_APPROACH_DEPTH_MM))
    for f in items + obstacles:
        for _side, zone in clearance_zones(f.rect, f.clearance, f.rotation):
            grid.block_rect(zone)
    return grid


def largest_rectangle(mask: np.ndarray) -> tuple[int, int, int, int, int]:
    """True 칸으로만 된 최대 넓이 직사각형 (area, j0, i0, h, w). 히스토그램 스택 방식."""
    nz, nx = mask.shape
    heights = np.zeros(nx, dtype=np.int32)
    best = (0, 0, 0, 0, 0)
    for j in range(nz):
        heights = np.where(mask[j], heights + 1, 0)
        stack: list[int] = []
        for i in range(nx + 1):
            h = heights[i] if i < nx else 0
            start = i
            while stack and heights[stack[-1]] >= h:
                top = stack.pop()
                height = int(heights[top])
                left = stack[-1] + 1 if stack else 0
                width = i - left
                if height * width > best[0]:
                    best = (height * width, j - height + 1, left, height, width)
                start = left
            stack.append(i)
    return best


def largest_rectangle_min_side(mask: np.ndarray, min_cells: int) -> tuple[int, int, int, int] | None:
    """두 변이 모두 min_cells 이상인 최대 직사각형 (j0, i0, h, w).

    짧은 변이 min 미만인 큰 직사각형이 답을 가리지 않도록, 가로·세로 각각 min 이상이 보장되는
    마스크(침식 후 팽창 = opening)에서 찾는다.
    """
    k = min_cells
    nz, nx = mask.shape
    if nz < k or nx < k:
        return None
    ii = np.zeros((nz + 1, nx + 1), dtype=np.int32)
    ii[1:, 1:] = np.cumsum(np.cumsum(mask.astype(np.int32), axis=0), axis=1)
    full = (ii[k:, k:] - ii[:-k, k:] - ii[k:, :-k] + ii[:-k, :-k]) == k * k  # k×k 가 다 True 인 앵커
    if not full.any():
        return None
    opened = np.zeros_like(mask)
    js, is_ = np.nonzero(full)
    for j, i in zip(js, is_):
        opened[j : j + k, i : i + k] = True
    area, j0, i0, h, w = largest_rectangle(opened)
    if h < k or w < k:
        return None
    return j0, i0, h, w


def suggested_categories(width: int, depth: int, height_limit: int) -> list[str]:
    short = min(width, depth)
    if short <= 400:
        cats = ["shelf", "storage"]
    elif short <= 600:
        cats = ["storage", "shelf", "lamp"]
    else:
        cats = ["storage", "table", "lamp", "decor"]
    if height_limit < 1000:
        cats = [c for c in cats if c in ("storage", "decor")] or ["storage"]
    return cats


def detect_dead_spaces(room: Room, items: list[Furniture], obstacles: list[Furniture] | None = None) -> list[dict[str, Any]]:
    obstacles = obstacles or []
    grid = unusable_grid(room, items, obstacles)
    walk = open_floor(build_grid(room, items + obstacles))
    dead = (~grid.blocked) & (~walk)
    k = -(-MIN_SIDE_MM // CELL_MM)
    out = []
    while len(out) < MAX_DEAD_SPACES:
        found = largest_rectangle_min_side(dead, k)
        if found is None:
            break
        j0, i0, h, w = found
        dead[j0 : j0 + h, i0 : i0 + w] = False
        r = grid.cell_rect(i0, j0, w, h)
        poly = rect_polygon(r)
        height_limit = room.ceiling
        for win in room.windows:
            zone = win.window_zone()
            if poly.intersects(zone) and poly.intersection(zone).area > 0:
                height_limit = min(height_limit, win.sill_height)
        width, depth = r.max_x - r.min_x, r.max_z - r.min_z
        out.append({
            "id": f"dead_{len(out) + 1}",
            "polygon": [{"x": r.min_x, "z": r.min_z}, {"x": r.max_x, "z": r.min_z}, {"x": r.max_x, "z": r.max_z}, {"x": r.min_x, "z": r.max_z}],
            "maxBox": {"width": width, "depth": depth, "heightLimit": height_limit},
            "suggestedCategories": suggested_categories(width, depth, height_limit),
        })
    return out


def dead_spaces_for(room_data: dict[str, Any], layout: dict[str, Any], catalog: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    room = Room(room_data)
    by_id = {c["itemId"]: c for c in (catalog or [])}
    items = [furniture_from(p, by_id) for p in layout.get("placements", [])]
    placed = {f.instance_id for f in items}
    obstacles = [furniture_from(e, by_id) for e in room.fixed_furniture(placed)]
    return detect_dead_spaces(room, items, obstacles)
