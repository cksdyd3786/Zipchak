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


def fits(item_width: int, item_depth: int, slot_width: int, slot_depth: int, margin: int) -> bool:
    """'들어감' 판정 (M3-4). 좌우 여유 2×margin, 깊이 여유 margin. 90도 회전도 검사한다."""

    def _fits(w: int, d: int) -> bool:
        return w + 2 * margin <= slot_width and d + margin <= slot_depth

    return _fits(item_width, item_depth) or _fits(item_depth, item_width)


MARGIN_PRECISE_MM = 20  # 정밀 모드 (source = lidar)
MARGIN_FREE_MM = 50  # 자유 모드 (manual / template / floorplan)


def margin_for_source(source: str) -> int:
    return MARGIN_PRECISE_MM if source == "lidar" else MARGIN_FREE_MM
