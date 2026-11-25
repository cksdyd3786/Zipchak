"""M3-4 '들어감' 판정 + 맞춤 상품 추천. 속성 테스트 먼저: 추천 상품은 100% 새 충돌 0."""
import json

import pytest
from fastapi.testclient import TestClient

from app.constraints import validate_layout
from app.fit import fit_search, parse_slot
from app.geometry import margin_for_source
from app.main import app
from app.recommend import recommend
from tests.helpers import CATALOG_FULL, TEMPLATE_FILES, box_room, clone, item, layout, load

BY_ID = {c["itemId"]: c for c in CATALOG_FULL}
ANSWERS = [{"deskHours": "gt4", "stuff": "normal"}, {"deskHours": "1to4", "stuff": "many", "guests": "weekly"}]
BEDS_ONLY = [c for c in CATALOG_FULL if c["category"] == "bed"]


def _place(lay, rec):
    """추천 결과를 실제로 배치안에 넣는다."""
    c = BY_ID[rec["catalogItemId"]]
    new = clone(lay)
    new["placements"].append({"instanceId": "inst_new", "source": "catalog", "catalogItemId": c["itemId"], "category": c["category"],
                              "dimensions": c["dimensions"], "position": rec["placement"]["position"],
                              "rotationDeg": rec["placement"]["rotationDeg"], "locked": False})
    return new


def _scenarios():
    # 템플릿 3종 × 답 2종 → 침대만 놓인 추천 배치안 (나머지는 fit:search 가 채운다)
    for path in TEMPLATE_FILES:
        room = json.loads(path.read_text(encoding="utf-8"))
        for ans in ANSWERS:
            lay = recommend(room, ans, catalog=BEDS_ONLY)["layouts"][0]
            lay["preferences"]["answers"] = ans
            yield pytest.param(room, lay, id=f"{path.stem}-{ans['deskHours']}")
    # 데드 스페이스가 생기는 방 (침대·장식장 사이 400 틈)
    room = box_room(3200, 4800, door={"offset": 2000, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 90}})
    lay = layout(item("bed", "bed", 1100, 2000, 450, 2600, 3800, 180), item("cab", "decor", 400, 2000, 1800, 1450, 3800))
    lay["placements"][0]["source"] = "existing"
    yield pytest.param(room, lay, id="dead-gap")


@pytest.mark.parametrize("room,lay", list(_scenarios()))
def test_every_recommended_item_fits_without_new_violations(room, lay):
    before = len(validate_layout(room, lay, CATALOG_FULL))
    res = fit_search(room, lay, None, CATALOG_FULL)["recommendedItems"]
    assert res, "추천이 하나도 없으면 속성 검사가 의미 없다"
    for rec in res:
        if "onTopOf" in rec["placement"]:
            continue  # 탁상 소품(M3-8)은 가구 위에 올리므로 바닥 충돌 검사 대상이 아니다
        after = validate_layout(room, _place(lay, rec), CATALOG_FULL)
        assert not [v for v in after if v["instanceId"] == "inst_new"], (rec, after)
        assert len(after) <= before, (rec, after)


# ---------------------------------------------------------------- dead 슬롯
DEAD_ROOM = box_room(3200, 4800, door={"offset": 2000, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 90}})
# 침대는 회전 180 (발쪽 = 북쪽 트인 바닥) 이라 문에서 다가갈 수 있다
DEAD_LAYOUT = layout(item("bed", "bed", 1100, 2000, 450, 2600, 3800, 180), item("cab", "decor", 400, 2000, 1800, 1450, 3800))


def test_dead_slot_recommends_slim_shelf_with_margins():
    # dead_1 = x 1650…2050 (폭 400), z 2800…4800 (깊이 2000). 자유 모드 여유 50.
    # 슬림 선반 250×380 (catalog.sample 과 같은 규격): 정면 ±Z → X 250+2×50 ≤ 400, Z 380+50 ≤ 2000
    #   → fitMarginMm = {400−250, 2000−380} = {150, 1620}  (layout.sample 의 recommendedItems 값과 같음)
    # 367 선반: 정면 ±Z 면 367+100 > 400, 정면 ±X 면 여유 공간 300 이 침대·장식장에 막힘 → 제외
    res = fit_search(DEAD_ROOM, DEAD_LAYOUT, "dead:dead_1", CATALOG_FULL)["recommendedItems"]
    ids = [r["catalogItemId"] for r in res]
    assert "cat_shelf_233" not in ids and "cat_shelf_billy" not in ids
    slim = next(r for r in res if r["catalogItemId"] == "cat_shelf_slim_250")
    assert slim["fitMarginMm"] == {"width": 150, "depth": 1620}
    # 틈 안은 사람이 못 들어가므로 정면이 트인 쪽(북쪽, −Z)을 보고 슬롯 북쪽 끝에 붙는다: z 2800…3180, 회전 180
    assert slim["placement"] == {"position": {"x": 1850, "z": 2990}, "rotationDeg": 180}
    assert [r["rank"] for r in res] == list(range(1, len(res) + 1))


def test_dead_slot_sorted_by_width_margin():
    res = fit_search(DEAD_ROOM, DEAD_LAYOUT, "dead:dead_1", CATALOG_FULL)["recommendedItems"]
    widths = [r["fitMarginMm"]["width"] for r in res]
    assert widths == sorted(widths)


def test_precise_mode_margin_is_20():
    # 폭 400 슬롯에 X 길이 360 상품: 자유(50) 360+100=460 > 400 실패 / 정밀(20) 360+40=400 통과
    cat = CATALOG_FULL + [dict(BY_ID["cat_shelf_233"], itemId="cat_shelf_360", dimensions={"width": 360, "depth": 300, "height": 1000})]
    free = fit_search(DEAD_ROOM, DEAD_LAYOUT, "dead:dead_1", cat)["recommendedItems"]
    lidar_room = dict(DEAD_ROOM, source="lidar")
    precise = fit_search(lidar_room, DEAD_LAYOUT, "dead:dead_1", cat)["recommendedItems"]
    assert margin_for_source("lidar") == 20
    assert "cat_shelf_360" not in [r["catalogItemId"] for r in free]
    assert "cat_shelf_360" in [r["catalogItemId"] for r in precise]


def test_window_height_limit():
    # 창 아래 400×400 틈 (heightLimit 900): 높이 600 상품만, 1006 선반은 제외
    room = box_room(3200, 4800, door={"offset": 2000, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 90}})
    lay = layout(item("a", "decor", 400, 400, 800, 800, 200), item("b", "decor", 400, 400, 800, 1600, 200))
    res = fit_search(room, lay, None, CATALOG_FULL)["recommendedItems"]
    under = [r for r in res if r["forSlot"].startswith("dead:")]
    assert all(BY_ID[r["catalogItemId"]]["dimensions"]["height"] <= 900 for r in under)


# ---------------------------------------------------------------- missing 슬롯
def test_missing_desk_keeps_clearance_front():
    room = load("room.sample.json")
    lay = {"placements": [], "preferences": {"answers": {"deskHours": "gt4"}}}
    res = fit_search(room, lay, "missing:desk", CATALOG_FULL)["recommendedItems"]
    assert res and all(r["forSlot"] == "missing:desk" for r in res)
    for r in res:
        assert r["fitMarginMm"]["width"] >= 100 and r["fitMarginMm"]["depth"] >= 50  # 자유 모드 2×50, 50
        assert validate_layout(room, _place(lay, r), CATALOG_FULL) == []  # 의자 자리 700 포함


def test_missing_chair_goes_in_front_of_desk():
    # 책상 x 900…2100, z 0…600, 앞(의자 자리) z 600…1300 → 650 의자: 1200−650=550, 700−650=50 여유
    lay = layout(item("desk", "desk", 1200, 600, 730, 1500, 300, catalog_id="cat_desk_1200"))
    res = fit_search(box_room(), lay, "missing:chair", CATALOG_FULL)["recommendedItems"]
    a = next(r for r in res if r["catalogItemId"] == "cat_chair_a")
    assert a["fitMarginMm"] == {"width": 550, "depth": 50}
    assert a["placement"]["position"] == {"x": 1500, "z": 925}  # z 600…1250, 책상에 붙임
    assert "cat_chair_b" not in [r["catalogItemId"] for r in res]  # 700 깊이 + 여유 50 > 700


def test_parse_slot_rejects_bad_value():
    assert parse_slot("missing:desk") == ("missing", "desk")
    assert parse_slot("decor") == ("decor", "")
    with pytest.raises(ValueError):
        parse_slot("desk")


def test_unavailable_items_are_skipped():
    cat = [dict(c, status="unavailable") if c["category"] == "desk" else c for c in CATALOG_FULL]
    lay = {"placements": [], "preferences": {"answers": {"deskHours": "gt4"}}}
    assert fit_search(load("room.sample.json"), lay, "missing:desk", cat)["recommendedItems"] == []


def test_fit_search_endpoint():
    client = TestClient(app)
    body = {"room": DEAD_ROOM, "layout": DEAD_LAYOUT, "slot": "dead:dead_1", "catalog": CATALOG_FULL}
    res = client.post("/v1/fit:search", json=body)
    assert res.status_code == 200 and res.json()["recommendedItems"]
    assert client.post("/v1/fit:search", json={**body, "slot": "nope"}).status_code == 400
