"""RoomData 해석 (M2-2). 벽·개구부 위치, 방 안쪽 방향, 문 회전 부채꼴, 창문 앞 영역.

모두 mm 정수 입력 → shapely 도형. 좌표 규약은 루트 CLAUDE.md.

hingeSide 해석 (웹 #54와 같은 기준): **방 안쪽에 서서 문을 바라볼 때 왼손 쪽이 left**.
평면도(위쪽 = −Z)에서 바깥 방향 f 를 바라볼 때 왼손 방향은 (f.z, −f.x) 이다.
예) room.sample 의 door_main (wall_S, offset 300, 폭 900) → 경첩 (2900, 4800), 닫힌 문 끝 (2000, 4800),
    90° 열린 문 끝 (2900, 3900).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import cached_property
from typing import Any

from shapely.geometry import Polygon, box

WINDOW_ZONE_DEPTH_MM = 500  # 창문 앞 이 깊이 안에서는 가구 높이가 창틀(sillHeight) 이하여야 한다
DOOR_APPROACH_DEPTH_MM = 600  # 문 바로 안쪽 통로 (문 폭 × 600mm) 는 비워 둔다


@dataclass(frozen=True)
class Opening:
    id: str
    type: str
    wall_id: str
    p0: tuple[float, float]  # 벽 start 쪽 모서리
    p1: tuple[float, float]  # 벽 end 쪽 모서리
    inward: tuple[float, float]  # 방 안쪽 단위 법선
    width: int
    height: int
    sill_height: int
    swing: dict[str, Any] | None
    facing: str | None

    @property
    def outward(self) -> tuple[float, float]:
        return (-self.inward[0], -self.inward[1])

    @property
    def center(self) -> tuple[float, float]:
        return ((self.p0[0] + self.p1[0]) / 2, (self.p0[1] + self.p1[1]) / 2)

    def hinge_and_free_end(self) -> tuple[tuple[float, float], tuple[float, float]]:
        """(경첩 점, 닫힌 문의 반대쪽 끝)."""
        fx, fz = self.outward
        left = (fz, -fx)
        side = (self.hinge_side() == "left")
        # p0→p1 방향이 left 와 같은 쪽이면 p1 이 왼쪽 모서리
        d = (self.p1[0] - self.p0[0], self.p1[1] - self.p0[1])
        p1_is_left = d[0] * left[0] + d[1] * left[1] > 0
        left_pt, right_pt = (self.p1, self.p0) if p1_is_left else (self.p0, self.p1)
        return (left_pt, right_pt) if side else (right_pt, left_pt)

    def hinge_side(self) -> str:
        return (self.swing or {}).get("hingeSide", "left")

    def strip(self, depth: float) -> Polygon:
        """개구부 폭 × 안쪽 depth 의 사각형."""
        nx, nz = self.inward
        a, b = self.p0, self.p1
        return Polygon([a, b, (b[0] + nx * depth, b[1] + nz * depth), (a[0] + nx * depth, a[1] + nz * depth)])

    def swing_sector(self, step_deg: int = 5) -> Polygon | None:
        """여닫이 문이 방 안쪽으로 열릴 때 쓸고 지나가는 부채꼴. 미닫이·바깥 열림·각도 0이면 None."""
        sw = self.swing
        if self.type != "door" or not sw or sw.get("kind") != "hinged" or not sw.get("opensInward"):
            return None
        max_deg = int(sw.get("maxAngleDeg", 90))
        if max_deg <= 0:
            return None
        hinge, free = self.hinge_and_free_end()
        ux, uz = free[0] - hinge[0], free[1] - hinge[1]
        r = math.hypot(ux, uz)
        ux, uz = ux / r, uz / r
        nx, nz = self.inward
        sign = 1.0 if (ux * nz - uz * nx) > 0 else -1.0  # u 에서 n 쪽으로 도는 방향
        pts = [hinge]
        steps = max(1, max_deg // step_deg)
        for i in range(steps + 1):
            a = math.radians(max_deg * i / steps) * sign
            c, s = math.cos(a), math.sin(a)
            pts.append((hinge[0] + r * (ux * c - uz * s), hinge[1] + r * (ux * s + uz * c)))
        return Polygon(pts)

    def window_zone(self) -> Polygon:
        return self.strip(WINDOW_ZONE_DEPTH_MM)


class Room:
    def __init__(self, data: dict[str, Any]):
        self.data = data
        self.source: str = data.get("source", "manual")
        self.ceiling: int = int(data.get("ceilingHeight", 2400))
        self.polygon = Polygon([(p["x"], p["z"]) for p in data["floorPolygon"]])
        if not self.polygon.is_valid or self.polygon.area <= 0:
            raise ValueError("ROOM_NOT_CLOSED: 바닥 윤곽이 올바른 다각형이 아니다")
        self.walls = {w["id"]: w for w in data.get("walls", [])}

    @cached_property
    def bounds(self) -> tuple[int, int, int, int]:
        minx, minz, maxx, maxz = self.polygon.bounds
        return int(minx), int(minz), int(math.ceil(maxx)), int(math.ceil(maxz))

    def wall_inward(self, wall: dict[str, Any]) -> tuple[float, float]:
        sx, sz = wall["start"]["x"], wall["start"]["z"]
        ex, ez = wall["end"]["x"], wall["end"]["z"]
        L = math.hypot(ex - sx, ez - sz)
        dx, dz = (ex - sx) / L, (ez - sz) / L
        mx, mz = (sx + ex) / 2, (sz + ez) / 2
        for n in ((-dz, dx), (dz, -dx)):
            if self.polygon.contains(_pt(mx + n[0] * 10, mz + n[1] * 10)):
                return n
        return (-dz, dx)

    @cached_property
    def openings(self) -> list[Opening]:
        result = []
        for o in self.data.get("openings", []):
            wall = self.walls.get(o["wallId"])
            if wall is None:
                continue
            sx, sz = wall["start"]["x"], wall["start"]["z"]
            ex, ez = wall["end"]["x"], wall["end"]["z"]
            L = math.hypot(ex - sx, ez - sz)
            dx, dz = (ex - sx) / L, (ez - sz) / L
            p0 = (sx + dx * o["offset"], sz + dz * o["offset"])
            p1 = (p0[0] + dx * o["width"], p0[1] + dz * o["width"])
            result.append(Opening(
                id=o["id"], type=o["type"], wall_id=o["wallId"], p0=p0, p1=p1,
                inward=self.wall_inward(wall), width=o["width"], height=o["height"],
                sill_height=o.get("sillHeight", 0), swing=o.get("swing"), facing=o.get("facing"),
            ))
        return result

    @property
    def doors(self) -> list[Opening]:
        return [o for o in self.openings if o.type in ("door", "opening")]

    @property
    def windows(self) -> list[Opening]:
        return [o for o in self.openings if o.type == "window"]

    @cached_property
    def fixture_polygons(self) -> list[tuple[str, Polygon, int]]:
        """바닥을 차지하는 고정물 (id, 도형, 높이). footprint 없는 것(에어컨·콘센트)은 제외."""
        out = []
        for f in self.data.get("fixtures", []):
            fp = f.get("footprint")
            if fp and len(fp) >= 3:
                out.append((f["id"], Polygon([(p["x"], p["z"]) for p in fp]), int(f.get("height", self.ceiling))))
        return out

    def fixed_furniture(self, placed_ids: set[str]) -> list[dict[str, Any]]:
        """배치안에 없는 움직일 수 없는 기존 가구 → 장애물로 취급."""
        return [f for f in self.data.get("existingFurniture", []) if not f.get("movable", True) and f["instanceId"] not in placed_ids]


def _pt(x: float, z: float):
    from shapely.geometry import Point

    return Point(x, z)


def rect_polygon(r) -> Polygon:
    return box(r.min_x, r.min_z, r.max_x, r.max_z)
