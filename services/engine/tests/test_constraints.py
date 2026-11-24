"""M2-2 하드 제약 검사. 모든 숫자는 mm, 계산 근거를 주석에 적었다 (사람이 검산).

기본 방 (helpers.box_room): 3000×4000, 남쪽 문 x 1800…2700 (경첩 2700,4000 · 반지름 900),
북쪽 창 x 1000…2000 · 창틀 900 · 창 앞 금지 깊이 500.
"""
import pytest
from fastapi.testclient import TestClient

from app.constraints import validate_layout
from app.geometry import Rect, clearance_zones, world_side
from app.main import app
from app.room import Room
from tests.helpers import TEMPLATE_FILES, box_room, codes, item, layout, load

import json


# ---------------------------------------------------------------- 문 해석
def test_01_hinge_left_is_left_hand_facing_door_from_inside():
    # wall_S: (3000,4000)→(0,4000). offset 300 → 모서리 (2700,4000), +900 → (1800,4000).
    # 안에서 문(+Z)을 보면 왼손 = +X 쪽 → 경첩 (2700,4000)
    door = Room(box_room()).doors[0]
    assert door.hinge_and_free_end() == ((2700.0, 4000.0), (1800.0, 4000.0))


def test_02_room_sample_door_matches_web_m4_3():
    # #54(웹)와 같은 결과: 경첩 (2900,4800), 90° 열린 문 끝 (2900,3900)
    door = Room(load("room.sample.json")).doors[0]
    hinge, free = door.hinge_and_free_end()
    assert hinge == (2900.0, 4800.0) and free == (2000.0, 4800.0)
    minx, minz, maxx, maxz = door.swing_sector().bounds
    assert (round(minx), round(minz), round(maxx), round(maxz)) == (2000, 3900, 2900, 4800)


def test_03_right_hinge_moves_hinge_to_other_edge():
    room = box_room(door={"offset": 300, "width": 900, "swing": {"kind": "hinged", "hingeSide": "right", "opensInward": True, "maxAngleDeg": 90}})
    assert Room(room).doors[0].hinge_and_free_end()[0] == (1800.0, 4000.0)


def test_04_sliding_or_outward_door_has_no_sector():
    sliding = box_room(door={"offset": 300, "width": 900, "swing": {"kind": "sliding", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 0}})
    outward = box_room(door={"offset": 300, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": False, "maxAngleDeg": 90}})
    assert Room(sliding).doors[0].swing_sector() is None
    assert Room(outward).doors[0].swing_sector() is None


# ---------------------------------------------------------------- 기본
def test_05_empty_layout_has_no_violations():
    assert validate_layout(box_room(), layout()) == []


def test_06_bed_against_wall_corner_is_ok():
    # 침대 1000×2000 중심 (500,1000) → x 0…1000, z 0…2000. 벽에 딱 붙음 = 허용
    # 창 앞 영역(x 1000…2000)과는 x=1000 에서 맞닿기만 함
    assert validate_layout(box_room(), layout(item("bed", "bed", 1000, 2000, 450, 500, 1000))) == []


# ---------------------------------------------------------------- WALL_OVERLAP
def test_07_furniture_through_wall():
    # 중심 x=400 → x −100…900 : 벽 밖 100mm
    assert codes(validate_layout(box_room(), layout(item("bed", "bed", 1000, 2000, 450, 400, 1000)))) == ["WALL_OVERLAP"]


def test_08_furniture_on_fixture():
    # 기둥 x 0…300, z 2000…2300 / 수납장 600×400 중심 (500,2200) → x 200…800 : 기둥과 100mm 겹침
    pillar = {"id": "fix_pillar", "type": "pillar", "footprint": [{"x": 0, "z": 2000}, {"x": 300, "z": 2000}, {"x": 300, "z": 2300}, {"x": 0, "z": 2300}], "height": 2400}
    v = validate_layout(box_room(fixtures=[pillar]), layout(item("st", "decor", 600, 400, 800, 500, 2200)))
    assert codes(v) == ["WALL_OVERLAP"] and "fix_pillar" in v[0]["message"]


def test_09_l_shaped_template_notch_is_outside():
    # 6평 템플릿: x 3200…4600, z 0…1600 은 잘린 부분. 중심 (3900,800) 500×500 → 완전히 방 밖
    tpl = json.loads([p for p in TEMPLATE_FILES if "6py" in p.name][0].read_text(encoding="utf-8"))
    assert "WALL_OVERLAP" in codes(validate_layout(tpl, layout(item("x", "decor", 500, 500, 500, 3900, 800))))


# ---------------------------------------------------------------- FURNITURE_OVERLAP
def test_10_overlap_by_1mm():
    # A: x 0…1000 / B: 중심 1499, 폭 1000 → x 999…1999 : 1mm 겹침 → 둘 다 표시
    a = item("a", "decor", 1000, 500, 500, 500, 2000)
    b = item("b", "decor", 1000, 500, 500, 1499, 2000)
    assert codes(validate_layout(box_room(), layout(a, b))) == ["FURNITURE_OVERLAP", "FURNITURE_OVERLAP"]


def test_11_touching_furniture_is_ok():
    # A: x 0…1000 / B: x 1000…2000 → 맞닿음
    a = item("a", "decor", 1000, 500, 500, 500, 2000)
    b = item("b", "decor", 1000, 500, 500, 1500, 2000)
    assert validate_layout(box_room(), layout(a, b)) == []


def test_12_immovable_existing_furniture_is_obstacle():
    # 고정 기존 가구 x 0…1000, z 1500…2500 / 새 가구 중심 (900,2000) 400×400 → x 700…1100 겹침
    fixed = {"instanceId": "old", "category": "wardrobe", "dimensions": {"width": 1000, "depth": 1000, "height": 2000},
             "position": {"x": 500, "z": 2000}, "rotationDeg": 90, "movable": False}
    v = validate_layout(box_room(existing=[fixed]), layout(item("n", "decor", 400, 400, 400, 900, 2000)))
    assert [x["instanceId"] for x in v if x["code"] == "FURNITURE_OVERLAP"] == ["n"]


# ---------------------------------------------------------------- DOOR_SWING
def test_13_inside_door_swing_sector():
    # 400×400 중심 (2250,3500) → 먼 모서리 (2450,3700)… 가까운 모서리 (2450,3700) 와 경첩 거리 √(250²+300²)=390 < 900
    v = validate_layout(box_room(), layout(item("box", "decor", 400, 400, 400, 2250, 3500)))
    assert "DOOR_SWING" in codes(v)


def test_14_outside_sector_but_in_door_approach():
    # 100×100 중심 (1850,3450) → x 1800…1900, z 3400…3500. 경첩에 가장 가까운 점 (1900,3500): √(800²+500²)=943 > 900
    # → 부채꼴 밖이지만 문 앞 통로(x 1800…2700, z 3400…4000) 안
    v = validate_layout(box_room(), layout(item("box", "decor", 100, 100, 100, 1850, 3450)))
    assert codes(v) == ["DOOR_SWING"] and "통로" in v[0]["message"]


def test_15_sliding_door_still_needs_approach():
    # 미닫이: 부채꼴 없음. 300×300 중심 (2250,3850) → z 3700…4000 은 문 앞 600 통로 안
    room = box_room(door={"offset": 300, "width": 900, "swing": {"kind": "sliding", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 0}})
    assert codes(validate_layout(room, layout(item("box", "decor", 300, 300, 300, 2250, 3850)))) == ["DOOR_SWING"]


def test_16_beyond_door_radius_is_ok():
    # 중심 (2250,2900) 400×400 → z 2700…3100. 경첩 (2700,4000) 까지 최소 거리 = 900 (z 3100, x 2450 이면 √(250²+900²)>900)
    assert validate_layout(box_room(), layout(item("box", "decor", 400, 400, 400, 2250, 2900))) == []


# ---------------------------------------------------------------- WINDOW_BLOCK
def test_17_tall_shelf_in_front_of_window():
    # 선반 800×300 높이 1500, 중심 (1500,150) → z 0…300 ⊂ 창 앞 500, 높이 1500 > 창틀 900
    v = validate_layout(box_room(), layout(item("shelf", "decor", 800, 300, 1500, 1500, 150)))
    assert codes(v) == ["WINDOW_BLOCK"] and "1500mm > 창틀 900mm" in v[0]["message"]


def test_18_low_desk_under_window_is_ok():
    # 책상 1200×600 높이 730 (< 900), 중심 (1500,300) → x 900…2100, z 0…600. 앞 700 → z 600…1300 비어 있음
    assert validate_layout(box_room(), layout(item("desk", "desk", 1200, 600, 730, 1500, 300))) == []


def test_19_catalog_rule_forbids_under_window():
    # 높이 500 < 900 이지만 카탈로그 underWindowAllowed = false
    cat = [{"itemId": "cat_x", "clearance": {"front": 0, "back": 0, "left": 0, "right": 0},
            "placementRules": {"againstWall": "required", "underWindowAllowed": False, "stackable": False}}]
    v = validate_layout(box_room(), layout(item("s", "storage", 500, 300, 500, 1500, 150, catalog_id="cat_x")), cat)
    assert codes(v) == ["WINDOW_BLOCK"]


def test_20_window_zone_depth_is_500():
    # 선반 z 500…800 (중심 650, 깊이 300) → 창 앞 500 과 맞닿기만 함 → 통과
    assert validate_layout(box_room(), layout(item("shelf", "decor", 800, 300, 1500, 1500, 650))) == []


# ---------------------------------------------------------------- CLEARANCE_BLOCKED
def test_21_clearance_rotation_directions():
    # 1200×600 책상 중심 (1000,1000): 회전 0 → 앞(+Z) 띠 z 1300…2000, 90 → 앞이 +X: 띠 x 1300…2000
    r0 = Rect(400, 700, 1600, 1300)
    assert clearance_zones(r0, {"front": 700}, 0) == [("front", Rect(400, 1300, 1600, 2000))]
    r90 = Rect(700, 400, 1300, 1600)
    assert clearance_zones(r90, {"front": 700}, 90) == [("front", Rect(1300, 400, 2000, 1600))]
    assert world_side("front", 180) == (0, -1) and world_side("front", 270) == (-1, 0)


def test_22_desk_facing_wall_blocks_chair_space():
    # 책상 회전 180 (앞 = −Z), 중심 (700,300) → z 0…600, 앞 700 띠 z −700…0 = 벽 밖
    # 앞면이 벽이라 사람이 앞에 설 수도 없다 → 동선 위반도 같이 나온다
    v = validate_layout(box_room(), layout(item("desk", "desk", 1200, 600, 730, 700, 300, 180)))
    assert codes(v) == ["CIRCULATION_NARROW", "CLEARANCE_BLOCKED"]
    assert "벽" in [x for x in v if x["code"] == "CLEARANCE_BLOCKED"][0]["message"]


def test_23_wardrobe_in_desk_chair_space():
    # 책상 x 100…1300, z 0…600 → 앞 띠 z 600…1300. 장롱 중심 (700,1000) 800×500 → z 750…1250 : 띠 안
    desk = item("desk", "desk", 1200, 600, 730, 700, 300)
    ward = item("ward", "wardrobe", 800, 500, 1800, 700, 1000, 180)
    v = [x for x in validate_layout(box_room(), layout(desk, ward)) if x["instanceId"] == "desk"]
    assert codes(v) == ["CLEARANCE_BLOCKED"] and "ward" in v[0]["message"]


def test_24_chair_in_desk_space_is_allowed():
    # 의자 500×500 중심 (700,900) → z 650…1150, 책상 앞 띠 안이지만 의자는 허용
    desk = item("desk", "desk", 1200, 600, 730, 700, 300)
    chair = item("chair", "chair", 500, 500, 900, 700, 900)
    assert validate_layout(box_room(), layout(desk, chair)) == []


def test_25_desk_rot90_against_east_wall_vs_rot270():
    # 동쪽 벽(x=3000)에 붙인 책상 600×1200(회전 후), 중심 (2700,1500) → x 2400…3000.
    # 회전 90 → 앞 +X → 띠 x 3000…3700 벽 밖 / 회전 270 → 앞 −X → 띠 x 1700…2400 비어 있음
    assert codes(validate_layout(box_room(), layout(item("d", "desk", 1200, 600, 730, 2700, 1500, 90)))) == ["CIRCULATION_NARROW", "CLEARANCE_BLOCKED"]
    assert validate_layout(box_room(), layout(item("d", "desk", 1200, 600, 730, 2700, 1500, 270))) == []


# ---------------------------------------------------------------- CIRCULATION_NARROW
def _divider(width: int):
    # 방을 가로지르는 칸막이 (z 2000…2500), 서쪽 벽부터 x = width 까지 → 동쪽에 3000 − width 틈
    return item("wall_div", "decor", width, 500, 2000, width // 2, 2250)


def test_26_passage_exactly_600_is_ok():
    # 틈 3000 − 2400 = 600 → 600 몸통 통과. 책상 x 900…2100, z 0…600, 앞 z 600…1300
    desk = item("desk", "desk", 1200, 600, 730, 1500, 300)
    assert validate_layout(box_room(), layout(desk, _divider(2400))) == []


def test_27_passage_550_is_narrow():
    # 틈 3000 − 2450 = 550 < 600 → 문(남쪽)에서 책상(북쪽) 앞까지 못 감
    desk = item("desk", "desk", 1200, 600, 730, 1500, 300)
    v = validate_layout(box_room(), layout(desk, _divider(2450)))
    assert codes(v) == ["CIRCULATION_NARROW"] and v[0]["instanceId"] == "desk"


def test_28_bed_reachable_from_side_when_foot_is_blocked():
    # 침대 회전 0 (머리 −Z, 발 +Z) x 0…1000, z 0…2000. 발쪽에 수납장 x 0…1000, z 2000…2450 (앞 = +Z)
    # 오른쪽(+X) 면 x 1000 쪽은 비어 있어 접근 가능 → 위반 없음
    bed = item("bed", "bed", 1000, 2000, 450, 500, 1000)
    st = item("st", "storage", 1000, 450, 800, 500, 2225)
    assert validate_layout(box_room(), layout(bed, st)) == []


def test_29_door_completely_blocked_flags_everything():
    # 문 안쪽 전체를 덮는 가구 → DOOR_SWING + 책상 접근 불가
    desk = item("desk", "desk", 1200, 600, 730, 1500, 300)
    block = item("block", "decor", 3000, 1000, 1000, 1500, 3500)
    c = codes(validate_layout(box_room(), layout(desk, block)))
    assert "DOOR_SWING" in c and "CIRCULATION_NARROW" in c


# ---------------------------------------------------------------- fixtures / API
@pytest.mark.parametrize("path", TEMPLATE_FILES, ids=lambda p: p.stem)
def test_30_templates_empty_ok_and_door_blocking_detected(path):
    tpl = json.loads(path.read_text(encoding="utf-8"))
    assert validate_layout(tpl, layout()) == []
    door = Room(tpl).doors[0]
    hx, hz = door.hinge_and_free_end()[0]
    nx, nz = door.inward
    # 경첩에서 안쪽으로 300mm 들어간 곳 200×200 상자 → 부채꼴 안
    box = item("b", "decor", 200, 200, 200, int(hx + nx * 300 + (door.center[0] - hx) * 0.3), int(hz + nz * 300 + (door.center[1] - hz) * 0.3))
    assert "DOOR_SWING" in codes(validate_layout(tpl, layout(box)))


def test_31_layout_sample_bed_clear_of_door():
    # #66: 침대를 왼쪽 벽 쪽으로 옮김. 중심 (600,3750) 1100×2000 → x 50…1150, z 2750…4750.
    # 문 부채꼴 x 2000…2900, z 3900…4800 과 안 겹친다 → 샘플이 실제로도 맞는 예시가 된다
    v = validate_layout(load("room.sample.json"), load("layout.sample.json"))
    assert not any(x["code"] == "DOOR_SWING" for x in v), v


def test_32_validate_endpoint():
    client = TestClient(app)
    body = {"room": box_room(), "layout": layout(item("bed", "bed", 1000, 2000, 450, 400, 1000))}
    res = client.post("/v1/layouts:validate", json=body)
    assert res.status_code == 200
    assert [v["code"] for v in res.json()["violations"]] == ["WALL_OVERLAP"]
