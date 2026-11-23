"""M3-8 인테리어 소품 추천 (forSlot = decor)."""
from app.decor import room_style, style_match
from app.constraints import validate_layout
from app.fit import fit_search
from tests.helpers import CATALOG_FULL, box_room, clone, item, layout

BY_ID = {c["itemId"]: c for c in CATALOG_FULL}


def _lay(*placements):
    lay = layout(*placements)
    lay["preferences"] = {"answers": {"deskHours": "lt1", "stuff": "few"}}
    return lay


# 흰색 미니멀 가구 2개 + 나무 침대 1개 → minimal 2표, white 2표, wood·warm·natural 1표
WHITE_DESK = item("desk", "desk", 1200, 600, 730, 1500, 300, catalog_id="cat_desk_1200")
WHITE_WARD = item("ward", "wardrobe", 790, 550, 1760, 395, 1500, 90, catalog_id="cat_wardrobe_790")
WOOD_BED = item("bed", "bed", 980, 2090, 920, 2510, 2900, 0, catalog_id="cat_bed_900")


def test_room_style_majority_vote():
    votes = room_style(_lay(WHITE_DESK, WHITE_WARD, WOOD_BED), box_room(), BY_ID)
    assert votes["minimal"] == 2 and votes["white"] == 2 and votes["wood"] == 1
    assert votes.most_common(1)[0][1] == 2


def test_style_match_counts_votes_of_shared_tags():
    votes = room_style(_lay(WHITE_DESK, WHITE_WARD, WOOD_BED), box_room(), BY_ID)
    # 흰 소품 (minimal, white) → 2 + 2 = 4 / 나무 화분 (wood, warm, natural) → 침대 1표씩 → 1 + 1 + 1 = 3
    assert style_match(BY_ID["cat_decor_white"], votes) == 4
    assert style_match(BY_ID["cat_decor_plant"], votes) == 3


def test_three_decor_items_sorted_by_style_match():
    res = fit_search(box_room(), _lay(WHITE_DESK, WHITE_WARD, WOOD_BED), "decor", CATALOG_FULL)["recommendedItems"]
    assert len(res) == 3 and all(r["forSlot"] == "decor" for r in res)
    assert [r["rank"] for r in res] == [1, 2, 3]
    matches = [r["styleMatch"] for r in res]
    assert matches == sorted(matches, reverse=True)
    assert all(BY_ID[r["catalogItemId"]]["category"] in ("lamp", "decor") for r in res)


def test_wood_room_prefers_wood_decor():
    # 나무 침대만 있는 방 → wood·natural 태그 소품이 1순위
    res = fit_search(box_room(), _lay(WOOD_BED), "decor", CATALOG_FULL)["recommendedItems"]
    assert "wood" in BY_ID[res[0]["catalogItemId"]]["styleTags"]


def test_floor_decor_is_placed_without_new_violations():
    lay = _lay(WHITE_DESK, WHITE_WARD, WOOD_BED)
    base = len(validate_layout(box_room(), lay, CATALOG_FULL))
    for r in fit_search(box_room(), lay, "decor", CATALOG_FULL)["recommendedItems"]:
        if "onTopOf" in r["placement"]:
            continue
        new = clone(lay)
        c = BY_ID[r["catalogItemId"]]
        new["placements"].append({"instanceId": "n", "source": "catalog", "catalogItemId": c["itemId"], "category": c["category"],
                                  "dimensions": c["dimensions"], "position": r["placement"]["position"],
                                  "rotationDeg": r["placement"]["rotationDeg"], "locked": False})
        after = validate_layout(box_room(), new, CATALOG_FULL)
        assert not [v for v in after if v["instanceId"] == "n"] and len(after) <= base


def test_tabletop_lamp_needs_a_surface():
    # 탁상 조명(높이 400) 은 책상이 있으면 그 위로, 가구가 침대뿐이면 추천하지 않는다
    cat = [BY_ID["cat_desk_1200"], BY_ID["cat_bed_900"], BY_ID["cat_lamp_desk"]]
    with_desk = fit_search(box_room(), _lay(WHITE_DESK, WOOD_BED), "decor", cat)["recommendedItems"]
    assert [r["catalogItemId"] for r in with_desk] == ["cat_lamp_desk"]
    # 책상 1200×600 위에 150×150 → 남는 폭 1050, 깊이 450
    assert with_desk[0]["placement"]["onTopOf"] == "desk" and with_desk[0]["fitMarginMm"] == {"width": 1050, "depth": 450}
    bed_only = fit_search(box_room(), _lay(WOOD_BED), "decor", cat)["recommendedItems"]
    assert "cat_lamp_desk" not in [r["catalogItemId"] for r in bed_only]


def test_decor_included_when_slot_omitted():
    res = fit_search(box_room(), _lay(WHITE_DESK, WOOD_BED), None, CATALOG_FULL)["recommendedItems"]
    assert any(r["forSlot"] == "decor" for r in res)
