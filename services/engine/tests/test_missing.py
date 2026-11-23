"""M3-2 부족 가구 탐지. 규칙표(required.json) 테스트 먼저."""
from fastapi.testclient import TestClient

from app.main import app
from app.missing import RULES, missing_categories, required_categories
from app.recommend import recommend
from tests.helpers import CATALOG, box_room, cat_item, item, layout, load
from app.preferences import WEIGHTS


# ---------------------------------------------------------------- 규칙표
def test_rule_table_uses_same_question_ids_as_weights():
    # required.json 의 질문·선택지 id 가 weights.json 과 같아야 웹 질문 화면 답을 그대로 쓸 수 있다
    for qid, options in RULES["byAnswer"].items():
        assert qid in WEIGHTS["questions"], qid
        assert set(options) == set(WEIGHTS["questions"][qid]["options"]), qid


def test_required_always_has_bed_and_defaults():
    # 답이 없으면 defaults: deskHours=1to4 → desk, stuff=normal → storage
    assert required_categories({}) == ["bed", "desk", "storage"]


def test_required_worker_heavy():
    # 4시간 이상 → desk + chair, 물건 많음 → storage + wardrobe, 매주 초대 → table (order 순)
    got = required_categories({"deskHours": "gt4", "stuff": "many", "guests": "weekly"})
    assert got == ["bed", "desk", "chair", "wardrobe", "storage", "table"]


def test_required_minimal():
    assert required_categories({"deskHours": "lt1", "stuff": "few", "monitors": "0"}) == ["bed"]


def test_monitors_imply_desk_even_if_short_desk_hours():
    assert "desk" in required_categories({"deskHours": "lt1", "monitors": "2plus", "stuff": "few"})


# ---------------------------------------------------------------- 보유 가구와 비교
def test_worker_without_desk_is_missing_desk():
    # 완료 기준 예: 책상 시간 4시간 이상인데 책상 없음 → missing:desk
    room = load("room.sample.json")  # 기존 가구 = 침대뿐
    assert missing_categories(room, {"deskHours": "gt4", "stuff": "few"}) == ["desk", "chair"]


def test_existing_desk_satisfies():
    room = box_room(existing=[{"instanceId": "d", "category": "desk", "dimensions": {"width": 1200, "depth": 600, "height": 730},
                               "position": {"x": 600, "z": 300}, "rotationDeg": 0, "movable": True}])
    assert "desk" not in missing_categories(room, {"deskHours": "gt4", "stuff": "few"})


def test_catalog_placement_is_not_owned():
    # 배치안에 카탈로그 책상이 있어도 아직 산 게 아니므로 missing 에 남는다 (layout.sample 의 missingCategories ["desk"] 와 같음)
    room, lay = load("room.sample.json"), load("layout.sample.json")
    assert "desk" in missing_categories(room, lay["preferences"]["answers"], lay)


def test_custom_placement_counts_as_owned():
    lay = layout(item("d", "desk", 1200, 600, 730, 600, 300))  # source = custom (사용자가 직접 추가)
    assert "desk" not in missing_categories(box_room(), {"deskHours": "gt4", "stuff": "few"}, lay)


def test_builtin_closet_satisfies_wardrobe_and_storage():
    # 5평 템플릿은 붙박이장(closet_builtin) 이 있어 물건이 많아도 wardrobe·storage 는 부족하지 않다
    tpl = load("templates/tpl-5py-studio.json")
    got = missing_categories(tpl, {"deskHours": "lt1", "stuff": "many"})
    assert got == ["bed"]


def test_wardrobe_satisfies_storage():
    room = box_room(existing=[{"instanceId": "w", "category": "wardrobe", "dimensions": {"width": 800, "depth": 550, "height": 1800},
                               "position": {"x": 400, "z": 2000}, "rotationDeg": 90, "movable": True}])
    assert missing_categories(room, {"deskHours": "lt1", "stuff": "normal"}) == ["bed"]


# ---------------------------------------------------------------- 엔진 연결
def test_recommend_fills_missing_and_adds_catalog_items():
    cat = CATALOG + [cat_item("cat_st", "storage", 800, 400, 800, 30000, clearance={"front": 450})]
    lay = recommend(load("room.sample.json"), {"deskHours": "gt4", "stuff": "normal"}, catalog=cat)["layouts"][0]
    assert lay["analysis"]["missingCategories"] == ["desk", "chair", "storage"]
    placed = {p["category"] for p in lay["placements"]}
    assert {"bed", "desk", "storage"} <= placed and "chair" not in placed  # 의자는 책상 앞 여유 공간에 들어가므로 따로 안 놓음


def test_validate_returns_missing():
    client = TestClient(app)
    body = {"room": load("room.sample.json"), "layout": {**layout(), "preferences": {"answers": {"deskHours": "gt4", "stuff": "few"}}}}
    assert client.post("/v1/layouts:validate", json=body).json()["analysis"]["missingCategories"] == ["desk", "chair"]  # 침대는 room.sample 에 이미 있음
