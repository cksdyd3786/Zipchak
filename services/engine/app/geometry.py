"""기하 연산 (순수 함수, 단위 mm 정수).

좌표 규약: 바닥 = XZ 평면, 가구 기준점 = 바닥면 중심, 회전 0도에서 정면 +Z.
MVP 회전은 0/90/180/270 이므로 가구 바닥면은 항상 축 정렬 사각형(AABB)이다.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    """축 정렬 사각형 (min_x, min_z) ~ (max_x, max_z)."""

    min_x: int
    min_z: int
    max_x: int
    max_z: int

    def intersects(self, other: "Rect") -> bool:
        """경계가 맞닿는 것은 겹침이 아니다 (벽에 딱 붙인 가구 허용)."""
        return (
            self.min_x < other.max_x
            and other.min_x < self.max_x
            and self.min_z < other.max_z
            and other.min_z < self.max_z
        )

    def expand(self, front: int = 0, back: int = 0, left: int = 0, right: int = 0) -> "Rect":
        """회전 0도 기준 여유 공간을 더한 사각형 (정면 = +Z)."""
        return Rect(self.min_x - left, self.min_z - back, self.max_x + right, self.max_z + front)


def footprint(x: int, z: int, width: int, depth: int, rotation_deg: int) -> Rect:
    """가구 중심 (x, z)와 규격으로 바닥면 사각형을 구한다."""
    if rotation_deg % 90 != 0:
        raise ValueError("MVP는 0/90/180/270도만 지원한다")
    if (rotation_deg // 90) % 2 == 1:
        width, depth = depth, width
    hw, hd = width // 2, depth // 2
    return Rect(x - hw, z - hd, x - hw + width, z - hd + depth)


def local_to_world(dx: int, dz: int, rotation_deg: int) -> tuple[int, int]:
    """가구 로컬 방향 → 월드 방향. Y축 기준 반시계(Three.js rotation.y 와 같음).

    회전 θ: x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ. 정면 (0, +1) 은 90° 에서 +X, 180° 에서 −Z.
    """
    q = (rotation_deg // 90) % 4
    for _ in range(q):
        dx, dz = dz, -dx
    return dx, dz


SIDES = {"front": (0, 1), "back": (0, -1), "left": (-1, 0), "right": (1, 0)}


def world_side(local_side: str, rotation_deg: int) -> tuple[int, int]:
    """'front'|'back'|'left'|'right' (회전 0도 기준, left = −X) → 월드 단위 방향."""
    return local_to_world(*SIDES[local_side], rotation_deg)


def expand_world(r: Rect, direction: tuple[int, int], amount: int) -> Rect:
    dx, dz = direction
    return Rect(
        r.min_x - (amount if dx < 0 else 0),
        r.min_z - (amount if dz < 0 else 0),
        r.max_x + (amount if dx > 0 else 0),
        r.max_z + (amount if dz > 0 else 0),
    )


def side_band(r: Rect, direction: tuple[int, int], depth: int) -> Rect | None:
    """사각형 r 의 direction 쪽 바깥에 붙은 폭 depth 띠. depth <= 0 이면 None."""
    if depth <= 0:
        return None
    dx, dz = direction
    if dx > 0:
        return Rect(r.max_x, r.min_z, r.max_x + depth, r.max_z)
    if dx < 0:
        return Rect(r.min_x - depth, r.min_z, r.min_x, r.max_z)
    if dz > 0:
        return Rect(r.min_x, r.max_z, r.max_x, r.max_z + depth)
    return Rect(r.min_x, r.min_z - depth, r.max_x, r.min_z)


def clearance_zones(r: Rect, clearance: dict[str, int], rotation_deg: int) -> list[tuple[str, Rect]]:
    """사용 여유 공간(책상 앞 의자 자리 등)을 면별 띠로 돌려준다. 회전 반영."""
    zones = []
    for side in ("front", "back", "left", "right"):
        band = side_band(r, world_side(side, rotation_deg), int(clearance.get(side, 0)))
        if band is not None:
            zones.append((side, band))
    return zones


def fits(item_width: int, item_depth: int, slot_width: int, slot_depth: int, margin: int) -> bool:
    """'들어감' 판정 (M3-4). 좌우 여유 2×margin, 깊이 여유 margin. 90도 회전도 검사한다."""

    def _fits(w: int, d: int) -> bool:
        return w + 2 * margin <= slot_width and d + margin <= slot_depth

    return _fits(item_width, item_depth) or _fits(item_depth, item_width)


MARGIN_PRECISE_MM = 20  # 정밀 모드 (source = lidar)
MARGIN_FREE_MM = 50  # 자유 모드 (manual / template / floorplan)


def margin_for_source(source: str) -> int:
    return MARGIN_PRECISE_MM if source == "lidar" else MARGIN_FREE_MM
