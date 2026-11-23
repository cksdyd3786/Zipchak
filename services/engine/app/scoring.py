"""소프트 점수 6항목 (M2-3). 각 항목 0~1 + 사유 문장.

score_layout(room, items, weights) -> {"breakdown": {키: 0~1}, "reasons": {키: 문장}, "score": 0~100}

| 키 | 계산 |
| --- | --- |
| monitorGlare  | 책상 정면 f(+Z, 회전 반영)와 가장 가까운 창의 안쪽 법선 n 의 내적.                    |
|               | 창이 등 뒤(f·n = −1, 화면에 창이 비침) 0.2 / 창을 마주봄(+1, 역광) 0.6 / 직각(0) 1.0 |
|               | 창에서 멀수록 영향이 줄어 4m 이상이면 1.0                                          |
| daylight      | 책상 중심 ~ 창 중심 거리 0 → 1, 3000mm 이상 → 0, × 창 방위 계수 (S 1.0 … N 0.7, 모름 0.85) |
| circulation   | 문에서 각 가구 접근 면까지 600 몸통 BFS 경로 길이 대비 (맨해튼) 직선거리 비율 평균, 못 가면 0 |
| openness      | 0.5 × 600 몸통이 설 수 있는 바닥 비율 + 0.5 × (가장 큰 빈 정사각형 한 변 / 방 짧은 변)² |
| storageAccess | 수납 가구(storage·wardrobe·shelf) 앞 빈 깊이 ÷ (필요 여유 + 300) 평균, 없으면 1      |
| bedPlacement  | 0.7 + 0.3 × (머리맡~문 거리 / 대각선 0.8) 에서 감점: 문에서 머리맡이 보임 −0.35 · 에어컨 바람길 −0.35 · 머리맡이 창 1m 안 −0.15 · |
|               | 침대가 문 1.2m 안 −0.15                                                           |
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from shapely.geometry import LineString, Point

from app.constraints import ACCESS_SIDES, DEFAULT_CLEARANCE, Furniture, build_grid
from app.geometry import Rect, side_band, world_side
from app.grid import CELL_MM, PASSAGE_MM, Grid, anchors_touching, bfs_distance
from app.room import Opening, Room, rect_polygon

SCORE_KEYS = ("monitorGlare", "daylight", "circulation", "openness", "storageAccess", "bedPlacement")
STORAGE_CATS = ("storage", "wardrobe", "shelf")
FACING_FACTOR = {"S": 1.0, "SE": 0.95, "SW": 0.95, "E": 0.85, "W": 0.85, "NE": 0.75, "NW": 0.75, "N": 0.7, None: 0.85}
DAYLIGHT_RANGE_MM = 3000
GLARE_RANGE_MM = 4000
VIEW_BLOCK_HEIGHT_MM = 1000  # 이보다 높은 가구는 문→침대 시야를 가린다
AIRCON_REACH_MM = 4000


def total_score(breakdown: dict[str, float], weights: dict[str, float]) -> int:
    wsum = sum(max(0.0, weights.get(k, 1.0)) for k in SCORE_KEYS)
    if wsum <= 0:
        return round(100 * sum(breakdown[k] for k in SCORE_KEYS) / len(SCORE_KEYS))
    return round(100 * sum(max(0.0, weights.get(k, 1.0)) * breakdown[k] for k in SCORE_KEYS) / wsum)


def _first(items: list[Furniture], category: str) -> Furniture | None:
    return next((f for f in items if f.category == category), None)


def _center(r: Rect) -> tuple[float, float]:
    return ((r.min_x + r.max_x) / 2, (r.min_z + r.max_z) / 2)


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, v))


def _window_dist(p: tuple[float, float], w: Opening) -> float:
    return LineString([w.p0, w.p1]).distance(Point(p))


# ---------------------------------------------------------------- 항목별
def monitor_glare(room: Room, items: list[Furniture]) -> tuple[float, str]:
    desk = _first(items, "desk")
    if desk is None:
        return 1.0, "책상이 없어 모니터 반사 걱정이 없어요"
    if not room.windows:
        return 1.0, "창문이 없어 모니터에 빛이 비치지 않아요"
    c = _center(desk.rect)
    win = min(room.windows, key=lambda w: _window_dist(c, w))
    f = world_side("front", desk.rotation)
    dot = f[0] * win.inward[0] + f[1] * win.inward[1]
    raw = 1.0 - 0.8 * max(0.0, -dot) - 0.4 * max(0.0, dot)
    falloff = _clamp(1.0 - _window_dist(c, win) / GLARE_RANGE_MM)
    s = 1.0 - (1.0 - raw) * falloff
    if dot <= -0.7:
        why = "창문을 등지고 앉아 모니터에 창이 비칠 수 있어요"
    elif dot >= 0.7:
        why = "창문을 마주 보고 앉아 화면이 역광이 될 수 있어요"
    else:
        why = "책상을 창문과 직각으로 두어 모니터 빛 반사를 피했어요"
    return round(_clamp(s), 3), why


def daylight(room: Room, items: list[Furniture]) -> tuple[float, str]:
    desk = _first(items, "desk")
    if not room.windows:
        return 0.3, "창문이 없어 자연광이 부족해요"
    if desk is None:
        return 0.5, "책상이 없어 채광은 보통으로 계산했어요"
    c = _center(desk.rect)
    win = min(room.windows, key=lambda w: math.dist(c, w.center))
    d = math.dist(c, win.center)
    s = _clamp(1.0 - d / DAYLIGHT_RANGE_MM) * FACING_FACTOR.get(win.facing, 0.85)
    if s >= 0.6:
        why = "책상을 창가에 두어 낮에 밝아요"
    else:
        why = f"책상이 창문에서 {d / 1000:.1f}m 떨어져 있어 조금 어두워요"
    return round(s, 3), why


def _door_bfs(grid: Grid, room: Room) -> tuple[np.ndarray, np.ndarray, int]:
    """600 몸통 앵커 기준, 문에서의 BFS 거리(칸). 못 가면 −1."""
    s = PASSAGE_MM // CELL_MM
    free = grid.free_anchors(s)
    if free.size == 0:
        return free, np.full(free.shape, -1, dtype=np.int32), s
    starts = []
    for door in room.doors:
        b = door.strip(CELL_MM).bounds
        starts += anchors_touching(grid, free, s, Rect(math.floor(b[0]), math.floor(b[1]), math.ceil(b[2]), math.ceil(b[3])))
    return free, bfs_distance(free, starts), s


def circulation(room: Room, items: list[Furniture], grid: Grid) -> tuple[float, str]:
    targets = [f for f in items if ACCESS_SIDES.get(f.category)]
    if not targets or not room.doors:
        return 1.0, "다가갈 가구가 없어 동선이 자유로워요"
    free, dist, s = _door_bfs(grid, room)
    ratios: list[tuple[float, Furniture]] = []
    for f in targets:
        best = None
        for side in ACCESS_SIDES[f.category]:
            band = side_band(f.rect, world_side(side, f.rotation), CELL_MM)
            for a in (anchors_touching(grid, free, s, band) if band else []):
                if dist[a] >= 0 and (best is None or dist[a] < best[0]):
                    best = (int(dist[a]), a)
        if best is None:
            ratios.append((0.0, f))
            continue
        steps, (j, i) = best
        body = (grid.x0 + (i + s / 2) * CELL_MM, grid.z0 + (j + s / 2) * CELL_MM)
        start = min(room.doors, key=lambda d: math.dist(d.center, body))
        sx, sz = start.center[0] + start.inward[0] * PASSAGE_MM / 2, start.center[1] + start.inward[1] * PASSAGE_MM / 2
        straight = abs(body[0] - sx) + abs(body[1] - sz)
        path = steps * CELL_MM
        ratios.append((_clamp((straight + CELL_MM) / (path + CELL_MM)), f))
    value = sum(r for r, _ in ratios) / len(ratios)
    worst_r, worst = min(ratios, key=lambda t: t[0])
    if worst_r == 0.0:
        why = f"문에서 {worst.category}까지 지나갈 길이 없어요"
    elif worst_r >= 0.9:
        why = "문에서 모든 가구까지 돌아가지 않고 바로 갈 수 있어요"
    else:
        why = f"문에서 {worst.category}까지 가려면 조금 돌아가야 해요"
    return round(value, 3), why


def _inside_cells(room: Room) -> int:
    cached = getattr(room, "_inside_cells", None)
    if cached is None:
        cached = int(np.count_nonzero(~Grid.for_polygon(room.polygon).blocked))
        room._inside_cells = cached  # type: ignore[attr-defined]
    return cached


def largest_free_square(blocked: np.ndarray) -> int:
    """막힌 칸이 없는 가장 큰 정사각형 한 변(칸 수). 적분 영상 + 이분 탐색."""
    nz, nx = blocked.shape
    ii = np.zeros((nz + 1, nx + 1), dtype=np.int32)
    ii[1:, 1:] = np.cumsum(np.cumsum(blocked.astype(np.int32), axis=0), axis=1)

    def exists(k: int) -> bool:
        if k == 0:
            return True
        if k > nz or k > nx:
            return False
        sums = ii[k:, k:] - ii[:-k, k:] - ii[k:, :-k] + ii[:-k, :-k]
        return bool((sums == 0).any())

    lo, hi = 0, min(nz, nx)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if exists(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo


def openness(room: Room, grid: Grid) -> tuple[float, str]:
    """0.5 × 걸을 수 있는 바닥 비율 + 0.5 × 한데 모인 빈 공간(가장 큰 빈 정사각형 넓이 / 방 짧은 변²)."""
    from app.deadspace import open_floor

    inside = _inside_cells(room)
    ratio = float(np.count_nonzero(open_floor(grid))) / inside if inside else 0.0
    short = min(room.bounds[2] - room.bounds[0], room.bounds[3] - room.bounds[1])
    side_mm = largest_free_square(grid.blocked) * CELL_MM
    square = min(1.0, (side_mm / short) ** 2) if short else 0.0
    value = 0.5 * ratio + 0.5 * square
    if value >= 0.6:
        why = f"가운데에 {side_mm / 1000:.1f}m × {side_mm / 1000:.1f}m 빈 공간이 남아 트여 보여요"
    else:
        why = f"한데 모인 빈 공간이 {side_mm / 1000:.1f}m 정도라 조금 답답해요"
    return round(_clamp(value), 3), why


def _free_depth(room: Room, f: Furniture, others: list[Furniture], limit: int) -> int:
    """가구 정면 앞으로 막힘 없이 비어 있는 깊이 (mm, 50 단위, 최대 limit)."""
    direction = world_side("front", f.rotation)
    depth = limit
    # 다른 가구: 정면 띠(limit 깊이)와 겹치는 가구까지의 거리
    full = side_band(f.rect, direction, limit)
    r = f.rect
    for g in others:
        if g is f or not full.intersects(g.rect):
            continue
        q = g.rect
        gap = {(0, 1): q.min_z - r.max_z, (0, -1): r.min_z - q.max_z, (1, 0): q.min_x - r.max_x, (-1, 0): r.min_x - q.max_x}[direction]
        depth = min(depth, max(0, gap))
    # 벽·고정물: 고정물까지 막은 기본 그리드를 한 줄씩 본다
    grid = room.base_grid
    steps = 0
    while steps * CELL_MM < depth:
        band = side_band(r, direction, (steps + 1) * CELL_MM)
        zs, xs = grid.cell_range(band)
        if zs.stop == zs.start or xs.stop == xs.start or not _within(grid, band) or grid.blocked[zs, xs].any():
            break
        steps += 1
    return min(depth, steps * CELL_MM) // CELL_MM * CELL_MM


def _within(grid: Grid, r: Rect) -> bool:
    return r.min_x >= grid.x0 and r.min_z >= grid.z0 and r.max_x <= grid.x0 + grid.nx * CELL_MM and r.max_z <= grid.z0 + grid.nz * CELL_MM


def storage_access(room: Room, items: list[Furniture]) -> tuple[float, str]:
    stores = [f for f in items if f.category in STORAGE_CATS]
    if not stores:
        return 1.0, "수납 가구가 없어 문 열림을 따질 필요가 없어요"
    vals = []
    for f in stores:
        need = int(f.clearance.get("front", DEFAULT_CLEARANCE.get(f.category, {}).get("front", 300))) + 300
        vals.append(min(1.0, _free_depth(room, f, items, need) / need))
    s = sum(vals) / len(vals)
    if s >= 0.9:
        why = "수납장 앞이 넉넉해 문과 서랍을 끝까지 열 수 있어요"
    else:
        why = "수납장 앞 공간이 빠듯해 문을 열 때 걸릴 수 있어요"
    return round(s, 3), why


def bed_head(bed: Furniture) -> tuple[float, float]:
    """침대 머리맡 = 로컬 뒤쪽(−Z) 면 가운데에서 100mm 안쪽."""
    bx, bz = world_side("back", bed.rotation)
    cx, cz = _center(bed.rect)
    reach = bed.depth / 2 - 100
    return (cx + bx * reach, cz + bz * reach)


def bed_placement(room: Room, items: list[Furniture]) -> tuple[float, str]:
    bed = _first(items, "bed")
    if bed is None:
        return 1.0, "침대가 없어요"
    head = bed_head(bed)
    diag = math.hypot(room.bounds[2] - room.bounds[0], room.bounds[3] - room.bounds[1]) or 1.0
    far = min((math.dist(head, d.center) for d in room.doors), default=diag)
    s, notes = 0.7 + 0.3 * _clamp(far / (diag * 0.8)), []
    blockers = [rect_polygon(g.rect) for g in items if g is not bed and g.height > VIEW_BLOCK_HEIGHT_MM]
    for door in room.doors:
        eye = (door.center[0] + door.inward[0] * 300, door.center[1] + door.inward[1] * 300)
        if not any(LineString([eye, head]).intersects(p) for p in blockers):
            s -= 0.35
            notes.append("문에서 침대 머리맡이 바로 보여요")
            break
    for fx in room.data.get("fixtures", []):
        if fx.get("type") != "aircon" or not fx.get("position") or not fx.get("direction"):
            continue
        p = (fx["position"]["x"], fx["position"]["z"])
        d = (fx["direction"]["x"], fx["direction"]["z"])
        L = math.hypot(*d) or 1.0
        ray = LineString([p, (p[0] + d[0] / L * AIRCON_REACH_MM, p[1] + d[1] / L * AIRCON_REACH_MM)])
        if ray.intersects(rect_polygon(bed.rect)):
            s -= 0.35
            notes.append("에어컨 바람이 침대로 바로 와요")
            break
    if any(_window_dist(head, w) < 1000 for w in room.windows):
        s -= 0.15
        notes.append("머리맡이 창문 가까이라 아침 빛·외풍이 있을 수 있어요")
    if any(rect_polygon(bed.rect).distance(Point(d.center)) < 1200 for d in room.doors):
        s -= 0.15
        notes.append("침대가 현관문과 가까워요")
    why = notes[0] if notes else "침대를 문에서 안 보이는 안쪽, 바람이 직접 닿지 않는 곳에 두었어요"
    return round(_clamp(s), 3), why


# ---------------------------------------------------------------- 묶음
def score_layout_fast(room: Room, items: list[Furniture]) -> dict[str, float]:
    """그리드가 필요 없는 4항목 (circulation·openness 는 0.5 고정). 빔 서치에서 후보를 거르는 용도."""
    return {
        "monitorGlare": monitor_glare(room, items)[0],
        "daylight": daylight(room, items)[0],
        "circulation": 0.5,
        "openness": 0.5,
        "storageAccess": storage_access(room, items)[0],
        "bedPlacement": bed_placement(room, items)[0],
    }


def score_layout(room: Room, items: list[Furniture], weights: dict[str, float]) -> dict[str, Any]:
    """items 에 고정 가구까지 모두 넣어 부른다."""
    grid = build_grid(room, items)
    parts = {
        "monitorGlare": monitor_glare(room, items),
        "daylight": daylight(room, items),
        "circulation": circulation(room, items, grid),
        "openness": openness(room, grid),
        "storageAccess": storage_access(room, items),
        "bedPlacement": bed_placement(room, items),
    }
    breakdown = {k: float(v[0]) for k, v in parts.items()}
    reasons = {k: v[1] for k, v in parts.items()}
    return {"breakdown": breakdown, "reasons": reasons, "score": total_score(breakdown, weights)}


def top_reasons(result: dict[str, Any], weights: dict[str, float], n: int = 3) -> list[str]:
    """가중치 × 점수가 큰 항목의 사유부터 n개 (M2-4 규칙 기반 설명의 재료)."""
    keys = sorted(SCORE_KEYS, key=lambda k: -max(0.0, weights.get(k, 1.0)) * result["breakdown"][k])
    return [result["reasons"][k] for k in keys[:n]]
