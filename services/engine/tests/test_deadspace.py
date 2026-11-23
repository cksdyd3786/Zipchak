"""M3-3 데드 스페이스. 숫자는 mm, 근거는 주석."""
import numpy as np
from shapely.geometry import Polygon, box

from app.deadspace import dead_spaces_for, largest_rectangle, largest_rectangle_min_side, suggested_categories
from app.room import Room
from tests.helpers import box_room, item, layout, load

# 3200×4800 방(room.sample 크기), 문은 남쪽 x 1200…300 (offset 2000) 으로 옮겨 침대 쪽과 겹치지 않게 함
ROOM = box_room(3200, 4800, door={"offset": 2000, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 90}})


def test_largest_rectangle_basic():
    m = np.zeros((5, 6), dtype=bool)
    m[1:4, 2:6] = True  # 3×4 = 12
    m[0, 0] = True
    assert largest_rectangle(m) == (12, 1, 2, 3, 4)


def test_min_side_filter_skips_thin_strip():
    # 1칸 폭 긴 띠(면적 10) 와 2×2 정사각형(면적 4): 최소 변 2칸이면 정사각형만 답
    m = np.zeros((6, 12), dtype=bool)
    m[0, :10] = True
    m[3:5, 3:5] = True
    assert largest_rectangle_min_side(m, 2) == (3, 3, 2, 2)


def test_dead_1_shape_between_bed_and_cabinet():
    # layout.sample 의 dead_1(400×2000)과 같은 모양을 재현:
    #   침대 1100×2000 중심 (2600,3800) → x 2050…3150, z 2800…4800 (남쪽 벽에 붙임)
    #   왼쪽 장식장 400×2000 중심 (1450,3800) → x 1250…1650
    #   사이 틈 x 1650…2050 = 400 < 600 → 사람이 못 들어감 → 400×2000 데드 스페이스
    bed = item("bed", "bed", 1100, 2000, 450, 2600, 3800)
    cab = item("cab", "decor", 400, 2000, 1800, 1450, 3800)
    dead = dead_spaces_for(ROOM, layout(bed, cab))
    assert dead[0]["polygon"] == [{"x": 1650, "z": 2800}, {"x": 2050, "z": 2800}, {"x": 2050, "z": 4800}, {"x": 1650, "z": 4800}]
    assert dead[0]["maxBox"] == {"width": 400, "depth": 2000, "heightLimit": 2400}
    assert dead[0]["suggestedCategories"] == ["shelf", "storage"]


def test_empty_room_has_no_dead_space():
    # 가구가 없으면 모든 칸을 600 몸통이 덮는다
    assert dead_spaces_for(ROOM, layout()) == []


def test_gap_under_window_gets_sill_height_limit():
    # 창 x 1000…2000, 창틀 900. 장식장 x 600…1000 과 x 1400…1800 (깊이 400, 높이 800) 사이 틈 x 1000…1400, z 0…400
    # → 400×400, 창 앞 500 안 → heightLimit 900, 높이 < 1000 이라 storage 만 추천
    a = item("a", "decor", 400, 400, 800, 800, 200)
    b = item("b", "decor", 400, 400, 800, 1600, 200)
    dead = dead_spaces_for(ROOM, layout(a, b))
    target = [d for d in dead if d["polygon"][0] == {"x": 1000, "z": 0}]
    assert target and target[0]["maxBox"] == {"width": 400, "depth": 400, "heightLimit": 900}
    assert target[0]["suggestedCategories"] == ["storage"]


def test_gap_narrower_than_300_is_ignored():
    # 침대 x 0…1100 과 장식장 x 1350…1750 사이 250 → 300 미만이라 제외
    bed = item("bed", "bed", 1100, 2000, 450, 550, 1000)
    cab = item("cab", "decor", 400, 2000, 1800, 1550, 1000)
    dead = dead_spaces_for(ROOM, layout(bed, cab))
    assert not any(d["polygon"][0]["x"] == 1100 for d in dead)


def test_clearance_zone_is_not_dead_space():
    # 책상(앞 700) 앞 의자 자리는 비워야 하는 곳 → 데드 스페이스로 내놓지 않는다
    # 책상 x 0…1200, z 0…600, 오른쪽에 장식장 x 1600…2000 → 의자 자리 x 0…1200, z 600…1300 은 제외
    desk = item("desk", "desk", 1200, 600, 730, 600, 300)
    cab = item("cab", "decor", 400, 1300, 1800, 1800, 650)
    dead = dead_spaces_for(ROOM, layout(desk, cab))
    chair = box(0, 600, 1200, 1300)
    for d in dead:
        poly = Polygon([(p["x"], p["z"]) for p in d["polygon"]])
        assert poly.intersection(chair).area == 0


def test_door_swing_is_not_dead_space():
    # 문 부채꼴 (경첩 1200,4800 반지름 900) 과 겹치는 데드 스페이스는 없어야 한다
    bed = item("bed", "bed", 1100, 2000, 450, 2600, 3800)
    cab = item("cab", "decor", 400, 2000, 1800, 1450, 3800)
    sector = Room(ROOM).doors[0].swing_sector()
    for d in dead_spaces_for(ROOM, layout(bed, cab)):
        poly = Polygon([(p["x"], p["z"]) for p in d["polygon"]])
        assert poly.intersection(sector).area == 0


def test_all_results_inside_room_and_at_least_300():
    room, lay = load("room.sample.json"), load("layout.sample.json")
    poly = Room(room).polygon
    for d in dead_spaces_for(room, lay):
        assert d["maxBox"]["width"] >= 300 and d["maxBox"]["depth"] >= 300
        assert poly.covers(Polygon([(p["x"], p["z"]) for p in d["polygon"]]))


def test_suggested_categories_by_depth():
    assert suggested_categories(400, 2000, 2400) == ["shelf", "storage"]
    assert suggested_categories(500, 900, 2400) == ["storage", "shelf", "lamp"]
    assert suggested_categories(800, 800, 2400) == ["storage", "table", "lamp", "decor"]
