"""M2-3 소프트 점수 6항목. 항목마다 좋은 예·나쁜 예. 숫자 mm, 근거는 주석.

기본 방 box_room(): 3000×4000, 북쪽 창 x 1000…2000 (안쪽 법선 +Z, 방위 S), 남쪽 문 x 1800…2700 (중심 2250,4000).
"""
import pytest
from fastapi.testclient import TestClient

from app.constraints import furniture_from
from app.main import app
from app.room import Room
from app.scoring import (
    bed_head,
    bed_placement,
    circulation,
    daylight,
    largest_free_square,
    monitor_glare,
    openness,
    score_layout,
    storage_access,
    top_reasons,
    total_score,
)
from app.constraints import build_grid
from tests.helpers import box_room, item, layout

import numpy as np


def F(*placements):
    return [furniture_from(p) for p in placements]


def desk(x, z, rot):
    return item("desk", "desk", 1200, 600, 730, x, z, rot)


# ---------------------------------------------------------------- monitorGlare
def test_glare_perpendicular_is_best():
    # 회전 90 → 정면 +X, 창 법선 +Z → 내적 0 → 1.0
    s, why = monitor_glare(Room(box_room()), F(desk(300, 900, 90)))
    assert s == 1.0 and "직각" in why


def test_glare_window_behind_is_bad():
    # 회전 180 → 정면 −Z (앉은 사람이 책상 북쪽, 창을 등짐), 내적 −1 → raw 0.2
    # 책상 중심 (1500,1500) ~ 창 선분 거리 1500 → 영향 1 − 1500/4000 = 0.625 → 1 − 0.8×0.625 = 0.5
    s, why = monitor_glare(Room(box_room()), F(desk(1500, 1500, 180)))
    assert s == 0.5 and "등지고" in why


def test_glare_facing_window_is_backlit():
    # 회전 0 → 정면 +Z = 창 법선 → 내적 +1 → raw 0.6, 거리 300 → 영향 0.925 → 1 − 0.4×0.925 = 0.63
    s, why = monitor_glare(Room(box_room()), F(desk(1500, 300, 0)))
    assert s == 0.63 and "역광" in why


# ---------------------------------------------------------------- daylight
def test_daylight_desk_at_window():
    # 책상 중심 (1500,300) ~ 창 중심 (1500,0) = 300 → (1 − 300/3000) × S 1.0 = 0.9
    assert daylight(Room(box_room()), F(desk(1500, 300, 0)))[0] == 0.9


def test_daylight_far_desk_is_dark():
    # 책상 중심 (1500,3400) → 창 중심까지 3400 ≥ 3000 → 0
    s, why = daylight(Room(box_room()), F(desk(1500, 3400, 0)))
    assert s == 0.0 and "어두워요" in why


def test_daylight_north_window_factor():
    # 같은 위치, 창 방위 N → 0.9 × 0.7 = 0.63
    room = box_room(window={"offset": 1000, "width": 1000, "sillHeight": 900, "facing": "N"})
    assert daylight(Room(room), F(desk(1500, 300, 0)))[0] == 0.63


# ---------------------------------------------------------------- circulation
def _circ(*placements, room=None):
    r = Room(room or box_room())
    items = F(*placements)
    return circulation(r, items, build_grid(r, items))


def test_circulation_direct_path_is_high():
    # 문(남쪽 가운데 x 2250) 바로 앞 북쪽으로 곧장 가면 되는 책상: 책상 x 1650…2850, z 0…600, 앞 z 600 쪽
    s, why = _circ(desk(2250, 300, 0))
    assert s >= 0.9 and "바로" in why


def test_circulation_detour_is_lower():
    # 칸막이 x 600…3000, z 2000…2500 → 서쪽 x 0…600 틈으로만 지나감.
    # 문(x≈2250)에서 서쪽 끝까지 갔다가 다시 동쪽 책상(x 1650…2850)으로 → 직선보다 훨씬 김
    # 가장 가까운 접근 자리(몸통 중심 x≈1350)까지: 경로 ≈ 서쪽 1950 + 북쪽 2750 + 동쪽 1050 = 5750,
    # 맨해튼 직선 ≈ 900 + 2750 = 3650 → 약 0.65~0.7 (칸 단위 반올림 차이)
    divider = item("div", "decor", 2400, 500, 2000, 1800, 2250)
    direct, _ = _circ(desk(2250, 300, 0))
    s, why = _circ(desk(2250, 300, 0), divider)
    assert s < 0.75 and s < direct - 0.2 and "돌아가야" in why


def test_circulation_unreachable_is_zero():
    # 칸막이 x 550…3000 → 틈 550 < 600 → 책상까지 못 감 → 책상 몫 0, 칸막이(decor)는 접근 대상 아님
    divider = item("div", "decor", 2450, 500, 2000, 1775, 2250)
    s, why = _circ(desk(2250, 300, 0), divider)
    assert s == 0.0 and "길이 없어요" in why


# ---------------------------------------------------------------- openness
def test_openness_empty_room_is_full():
    # 빈 방: 걸을 수 있는 바닥 100%, 가장 큰 빈 정사각형 3000 = 짧은 변 → 0.5 + 0.5 = 1.0
    r = Room(box_room())
    assert openness(r, build_grid(r, []))[0] == 1.0


def test_openness_corner_beats_center():
    # 같은 1000×1000 가구: 구석 (0…1000) vs 한가운데 (1000…2000, 1500…2500)
    # 가운데 두면 가장 큰 빈 정사각형이 1500 → (1500/3000)² = 0.25, 구석이면 2000 → 0.44
    r = Room(box_room())
    corner = F(item("b", "decor", 1000, 1000, 500, 500, 500))
    center = F(item("b", "decor", 1000, 1000, 500, 1500, 2000))
    s_corner, _ = openness(r, build_grid(r, corner))
    s_center, why = openness(r, build_grid(r, center))
    assert s_corner > s_center and "m" in why


def test_largest_free_square():
    m = np.zeros((6, 8), dtype=bool)
    m[:, 3] = True  # 가운데 세로로 막힘 → 오른쪽 6×4 에서 4
    assert largest_free_square(m) == 4


# ---------------------------------------------------------------- storageAccess
def test_storage_front_free_is_full():
    # 장롱 x 0…800, z 1500…2050 (앞 +Z), 앞 900 (= 600 + 300) 비어 있음 → 1.0
    ward = item("w", "wardrobe", 800, 550, 1800, 400, 1775)
    s, why = storage_access(Room(box_room()), F(ward))
    assert s == 1.0 and "넉넉" in why


def test_storage_front_tight():
    # 장롱 앞 z 2050 에서 600 떨어진 z 2650 에 상자 → 빈 깊이 600 / 필요 900 = 0.667
    ward = item("w", "wardrobe", 800, 550, 1800, 400, 1775)
    box = item("b", "decor", 800, 300, 500, 400, 2800)
    s, why = storage_access(Room(box_room()), F(ward, box))
    assert s == 0.667 and "빠듯" in why


def test_storage_none_is_one():
    assert storage_access(Room(box_room()), F(desk(1500, 300, 0)))[0] == 1.0


# ---------------------------------------------------------------- bedPlacement
# 창을 x 2000…2800 으로 옮겨 서쪽 침대 머리맡이 창에서 1m 이상 떨어지게 한다
BED_ROOM = box_room(window={"offset": 2000, "width": 800, "sillHeight": 900})
BED = item("bed", "bed", 1000, 2000, 450, 500, 1000)  # x 0…1000, z 0…2000, 머리맡 (500,100)
WARD_SCREEN = item("w", "wardrobe", 800, 550, 1800, 1400, 2275)  # x 1000…1800, z 2000…2550 (높이 1800)


def test_bed_head_point():
    # 회전 0: 뒤쪽 = −Z, 중심 (500,1000) 에서 1000−100 = 900 → (500,100)
    assert bed_head(furniture_from(BED)) == (500.0, 100.0)


def test_bed_visible_from_door_is_penalized():
    # 문 안쪽 300 지점 (2250,3700) → 머리맡 (500,100) 시야를 가리는 키 큰 가구 없음 → −0.35
    # 문까지 거리 √(1750²+3900²)=4275 ≥ 대각선 5000×0.8 → 0.7 + 0.3 = 1.0 → 0.65
    s, why = bed_placement(Room(BED_ROOM), F(BED))
    assert s == 0.65 and "문에서" in why


def test_wardrobe_hides_bed_from_door():
    # 시야선은 z=2275 에서 x = 500 + 1750×(2175/3600) ≈ 1557 → 장롱 x 1000…1800 이 가림 → 감점 없음
    s, why = bed_placement(Room(BED_ROOM), F(BED, WARD_SCREEN))
    assert s == 1.0 and "안쪽" in why


def test_aircon_wind_over_bed_is_penalized():
    # 에어컨 (3000, z=1000) 바람 −X → z=1000 선이 침대(z 0…2000)를 지남 → −0.35
    aircon = {"id": "ac", "type": "aircon", "position": {"x": 3000, "y": 2100, "z": 1000}, "direction": {"x": -1, "z": 0}}
    room = box_room(window={"offset": 2000, "width": 800, "sillHeight": 900}, fixtures=[aircon])
    s, why = bed_placement(Room(room), F(BED, WARD_SCREEN))
    assert s == 0.65 and "에어컨" in why


def test_bed_next_to_door_is_penalized():
    # 침대 회전 90, x 1000…3000, z 3000…4000 → 문 중심 (2250,4000) 이 침대 바로 아래 → 1.2m 안 −0.15 (+ 문 시야 −0.35)
    bed = item("bed", "bed", 1000, 2000, 450, 2000, 3500, 90)
    s, _ = bed_placement(Room(BED_ROOM), F(bed))
    assert s <= 0.5


# ---------------------------------------------------------------- 합계·API
def test_total_score_is_weighted_average():
    b = {"monitorGlare": 1.0, "daylight": 0.0, "circulation": 1.0, "openness": 1.0, "storageAccess": 1.0, "bedPlacement": 1.0}
    assert total_score(b, {k: 1.0 for k in b}) == 83  # 5/6
    assert total_score(b, {**{k: 1.0 for k in b}, "daylight": 5.0}) == 50  # 5/10


def test_score_layout_returns_all_keys_and_reasons():
    res = score_layout(Room(box_room()), F(desk(300, 900, 90), BED), {})
    assert set(res["breakdown"]) == set(res["reasons"]) and len(res["breakdown"]) == 6
    assert all(0.0 <= v <= 1.0 for v in res["breakdown"].values())
    assert len(top_reasons(res, {"monitorGlare": 3.0})) == 3 and top_reasons(res, {"monitorGlare": 3.0})[0] == res["reasons"]["monitorGlare"]


def test_validate_endpoint_returns_analysis():
    client = TestClient(app)
    body = {"room": box_room(), "layout": {**layout(desk(300, 900, 90)), "preferences": {"answers": {"deskHours": "gt4"}}}}
    a = client.post("/v1/layouts:validate", json=body).json()["analysis"]
    assert 0 <= a["score"] <= 100 and a["scoreBreakdown"]["monitorGlare"] == 1.0
    assert len(a["reasons"]) == 3 and a["violations"] == [] and isinstance(a["deadSpaces"], list)
