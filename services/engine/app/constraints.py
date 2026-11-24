"""하드 제약 검사 (M2-2). 물리적으로 불가능한 배치를 violations 로 돌려준다.

코드 (furniture-layout.schema.json):
  DOOR_SWING          문 회전 부채꼴 또는 문 바로 안쪽 통로(문 폭 × 600mm)를 가구가 막음
  WINDOW_BLOCK        창문 앞 500mm 안에 창틀(sillHeight)보다 높은 가구
  WALL_OVERLAP        가구가 바닥 윤곽 밖으로 나가거나 고정물(라디에이터·기둥·붙박이장)과 겹침
  FURNITURE_OVERLAP   가구끼리 겹침 (모서리가 맞닿는 것은 허용)
  CIRCULATION_NARROW  문에서 가구 앞까지 폭 600mm 통로가 없음 (50mm 그리드 BFS)
  CLEARANCE_BLOCKED   사용 여유 공간(책상 앞 의자 자리 700 등)이 벽·가구·고정물에 막힘
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable

from shapely.geometry import Polygon

from app.geometry import Rect, clearance_zones, footprint, side_band, world_side
from app.grid import CELL_MM, PASSAGE_MM, Grid, anchors_touching, reachable
from app.room import DOOR_APPROACH_DEPTH_MM, Room, rect_polygon

# 카탈로그 정보가 없을 때 쓰는 카테고리별 사용 여유 공간 (mm, 회전 0도 기준)
DEFAULT_CLEARANCE: dict[str, dict[str, int]] = {
    "desk": {"front": 700},
    "storage": {"front": 450},
    "wardrobe": {"front": 600},
    "shelf": {"front": 300},
    "sofa": {"front": 400},
}

# 다가가야 하는 면 (동선 검사 대상). 없으면 동선 검사를 하지 않는다.
ACCESS_SIDES: dict[str, tuple[str, ...]] = {
    "bed": ("front", "left", "right"),
    "chair": ("front", "back", "left", "right"),
    "table": ("front", "back", "left", "right"),
    "sofa": ("front",),
    "desk": ("front",),
    "storage": ("front",),
    "wardrobe": ("front",),
    "shelf": ("front",),
    "etc": ("front", "back", "left", "right"),
}

# 다른 가구의 여유 공간 안에 있어도 되는 가구 (책상 앞 의자)
ALLOWED_IN_CLEARANCE: dict[str, set[str]] = {"desk": {"chair"}, "table": {"chair"}}


@dataclass
class Furniture:
    instance_id: str
    category: str
    width: int
    depth: int
    height: int
    x: int
    z: int
    rotation: int
    clearance: dict[str, int] = field(default_factory=dict)
    under_window_allowed: bool | None = None

    @property
    def rect(self) -> Rect:
        return footprint(self.x, self.z, self.width, self.depth, self.rotation)

    @property
    def poly(self) -> Polygon:
        return rect_polygon(self.rect)


def furniture_from(entry: dict[str, Any], catalog_by_id: dict[str, dict[str, Any]] | None = None) -> Furniture:
    """layout.placements[] 또는 room.existingFurniture[] 항목 → Furniture."""
    item = (catalog_by_id or {}).get(entry.get("catalogItemId") or "")
    cat = entry.get("category", "etc")
    clearance = dict(item["clearance"]) if item else dict(DEFAULT_CLEARANCE.get(cat, {}))
    d = entry["dimensions"]
    return Furniture(
        instance_id=entry["instanceId"],
        category=cat,
        width=int(d["width"]),
        depth=int(d["depth"]),
        height=int(d.get("height", 0)),
        x=int(entry["position"]["x"]),
        z=int(entry["position"]["z"]),
        rotation=int(entry.get("rotationDeg", 0)),
        clearance=clearance,
        under_window_allowed=item["placementRules"]["underWindowAllowed"] if item else None,
    )


def _v(code: str, iid: str, message: str) -> dict[str, str]:
    return {"code": code, "instanceId": iid, "message": message}


def _overlaps(a: Polygon, b: Polygon) -> bool:
    return a.intersects(b) and a.intersection(b).area > 0


# ---------------------------------------------------------------------------
# 개별 검사 (순서대로 테스트하기 쉽게 분리)
# ---------------------------------------------------------------------------
def check_walls(room: Room, items: list[Furniture]) -> list[dict]:
    out = []
    for f in items:
        if not room.polygon.covers(f.poly):
            out.append(_v("WALL_OVERLAP", f.instance_id, f"{f.instance_id}이(가) 벽 밖으로 나갔어요"))
            continue
        for fid, fpoly, _h in room.fixture_polygons:
            if _overlaps(f.poly, fpoly):
                out.append(_v("WALL_OVERLAP", f.instance_id, f"{f.instance_id}이(가) 고정물 {fid}과(와) 겹쳐요"))
                break
    return out


def check_furniture_overlap(items: list[Furniture], obstacles: list[Furniture]) -> list[dict]:
    out = []
    flagged: set[str] = set()
    pool = items + obstacles
    for i, a in enumerate(items):
        for b in pool[i + 1 :]:
            if a.rect.intersects(b.rect):
                for iid, other in ((a.instance_id, b.instance_id), (b.instance_id, a.instance_id)):
                    if iid not in flagged and any(iid == f.instance_id for f in items):
                        flagged.add(iid)
                        out.append(_v("FURNITURE_OVERLAP", iid, f"{iid}이(가) {other}과(와) 겹쳐요"))
    return out


def check_doors(room: Room, items: list[Furniture]) -> list[dict]:
    out = []
    for f in items:
        for door in room.doors:
            sector = door.swing_sector()
            approach = door.strip(DOOR_APPROACH_DEPTH_MM)
            if sector is not None and _overlaps(f.poly, sector):
                out.append(_v("DOOR_SWING", f.instance_id, f"{f.instance_id}이(가) 문 {door.id}이 열리는 자리를 막아요"))
                break
            if _overlaps(f.poly, approach):
                out.append(_v("DOOR_SWING", f.instance_id, f"{f.instance_id}이(가) 문 {door.id} 바로 앞 통로를 막아요"))
                break
    return out


def check_windows(room: Room, items: list[Furniture]) -> list[dict]:
    out = []
    for f in items:
        for win in room.windows:
            if not _overlaps(f.poly, win.window_zone()):
                continue
            too_tall = f.height > win.sill_height
            if too_tall or f.under_window_allowed is False:
                why = f"높이 {f.height}mm > 창틀 {win.sill_height}mm" if too_tall else "창문 아래 금지 상품"
                out.append(_v("WINDOW_BLOCK", f.instance_id, f"{f.instance_id}이(가) 창문 {win.id}을 가려요 ({why})"))
                break
    return out


def check_clearance(room: Room, items: list[Furniture], obstacles: list[Furniture]) -> list[dict]:
    out = []
    pool = items + obstacles
    for f in items:
        for side, zone in clearance_zones(f.rect, f.clearance, f.rotation):
            zpoly = rect_polygon(zone)
            blocker = None
            if not room.polygon.covers(zpoly):
                blocker = "벽"
            else:
                for fid, fpoly, _h in room.fixture_polygons:
                    if _overlaps(zpoly, fpoly):
                        blocker = fid
                        break
            if blocker is None:
                allowed = ALLOWED_IN_CLEARANCE.get(f.category, set())
                for g in pool:
                    if g.instance_id != f.instance_id and g.category not in allowed and zone.intersects(g.rect):
                        blocker = g.instance_id
                        break
            if blocker:
                need = f.clearance.get(side, 0)
                out.append(_v("CLEARANCE_BLOCKED", f.instance_id, f"{f.instance_id} {_SIDE_KO[side]} {need}mm 여유 공간을 {blocker}이(가) 막아요"))
                break
    return out


_SIDE_KO = {"front": "앞", "back": "뒤", "left": "왼쪽", "right": "오른쪽"}


def build_grid(room: Room, solids: Iterable[Furniture]) -> Grid:
    grid = Grid.for_polygon(room.polygon)
    for _fid, fpoly, _h in room.fixture_polygons:
        grid.block_polygon(fpoly)
    for f in solids:
        grid.block_rect(f.rect)
    return grid


def check_circulation(room: Room, items: list[Furniture], obstacles: list[Furniture]) -> list[dict]:
    """문 안쪽에서 출발한 600×600 몸통이 각 가구의 접근 면 바로 앞까지 갈 수 있는지."""
    targets = [f for f in items if ACCESS_SIDES.get(f.category)]
    if not targets or not room.doors:
        return []
    grid = build_grid(room, items + obstacles)
    s = PASSAGE_MM // CELL_MM
    free = grid.free_anchors(s)
    starts: list[tuple[int, int]] = []
    for door in room.doors:
        b = door.strip(CELL_MM).bounds  # 문 폭 × 안쪽 첫 칸
        entry = Rect(math.floor(b[0]), math.floor(b[1]), math.ceil(b[2]), math.ceil(b[3]))
        starts += anchors_touching(grid, free, s, entry)
    seen = reachable(free, starts) if free.size else free
    out = []
    for f in targets:
        ok = False
        for side in ACCESS_SIDES[f.category]:
            band = side_band(f.rect, world_side(side, f.rotation), CELL_MM)
            if band and any(seen[a] for a in anchors_touching(grid, free, s, band)):
                ok = True
                break
        if not ok:
            out.append(_v("CIRCULATION_NARROW", f.instance_id, f"문에서 {f.instance_id}까지 폭 {PASSAGE_MM}mm 통로가 없어요"))
    return out


# ---------------------------------------------------------------------------
def validate_layout(room_data: dict[str, Any], layout: dict[str, Any], catalog: list[dict[str, Any]] | None = None) -> list[dict]:
    room = Room(room_data)
    catalog_by_id = {c["itemId"]: c for c in (catalog or [])}
    items = [furniture_from(p, catalog_by_id) for p in layout.get("placements", [])]
    placed = {f.instance_id for f in items}
    obstacles = [furniture_from(e, catalog_by_id) for e in room.fixed_furniture(placed)]
    return validate_items(room, items, obstacles)


def validate_items(room: Room, items: list[Furniture], obstacles: list[Furniture] | None = None) -> list[dict]:
    obstacles = obstacles or []
    return (
        check_walls(room, items)
        + check_furniture_overlap(items, obstacles)
        + check_doors(room, items)
        + check_windows(room, items)
        + check_clearance(room, items, obstacles)
        + check_circulation(room, items, obstacles)
    )
