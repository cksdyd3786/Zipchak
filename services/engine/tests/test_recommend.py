"""M2-1 질문형 맞춤 배치안 3개."""
import json
import math
import time

import pytest
from fastapi.testclient import TestClient

from app.constraints import validate_layout
from app.main import app
from app.recommend import recommend
from tests.helpers import CATALOG, HOST, TEMPLATE_FILES, WORKER, load


def _tpl(name):
    return json.loads([p for p in TEMPLATE_FILES if name in p.name][0].read_text(encoding="utf-8"))


def _sig(layout):
    return sorted((p["category"], p["position"]["x"], p["position"]["z"], p["rotationDeg"]) for p in layout["placements"])


# ---- 먼저 쓴 테스트: 답이 바뀌면 결과가 바뀐다 ---------------------------------
WARDROBE = {"instanceId": "inst_ward", "category": "wardrobe", "dimensions": {"width": 800, "depth": 550, "height": 1800},
            "position": {"x": 0, "z": 0}, "rotationDeg": 0, "movable": True}
CABINET = {"instanceId": "inst_cab", "category": "storage", "dimensions": {"width": 800, "depth": 400, "height": 800},
           "position": {"x": 0, "z": 0}, "rotationDeg": 0, "movable": True}


@pytest.mark.parametrize("tpl", ["4py", "5py", "6py"])
def test_answers_change_result(tpl):
    # 같은 방·같은 가구(기존 장롱·수납장 + 카탈로그 침대·책상)인데 업무형과 초대형의 1순위 배치가 달라야 한다.
    # 가구가 침대·책상 2개뿐이면 한 배치가 모든 항목에서 가장 좋아(우세) 어떤 가중치든 같은 답이 맞을 수 있다.
    room = _tpl(tpl)
    room["existingFurniture"] = [WARDROBE, CABINET]
    # 이 테스트는 '답에 따라 달라지는지'를 보므로 시간 예산을 넉넉히 준다 (5초 제한은 아래 테스트에서 따로 검사).
    # CI 러너는 느려서 4.5초 안에 가구 4개를 다 못 놓고 partial 이 될 수 있다.
    worker = recommend(room, WORKER, catalog=CATALOG, time_budget=30)["layouts"][0]
    host = recommend(room, HOST, catalog=CATALOG, time_budget=30)["layouts"][0]
    cats = {"bed", "desk", "wardrobe", "storage"}
    assert {p["category"] for p in worker["placements"]} == {p["category"] for p in host["placements"]} == cats
    assert _sig(worker) != _sig(host)


@pytest.mark.parametrize("path", TEMPLATE_FILES, ids=lambda p: p.stem)
def test_three_layouts_no_collision_within_5s(path):
    room = json.loads(path.read_text(encoding="utf-8"))
    t = time.monotonic()
    res = recommend(room, WORKER, catalog=CATALOG)
    assert time.monotonic() - t < 5.0
    assert len(res["layouts"]) == 3 and res["partial"] is False
    for lay in res["layouts"]:
        assert validate_layout(room, lay, CATALOG) == []  # 충돌 0 (M2-2 검사기로 재확인)
        assert lay["analysis"]["violations"] == []


@pytest.mark.parametrize("path", TEMPLATE_FILES, ids=lambda p: p.stem)
def test_bed_positions_differ(path):
    room = json.loads(path.read_text(encoding="utf-8"))
    beds = [next(p for p in lay["placements"] if p["category"] == "bed") for lay in recommend(room, HOST, catalog=CATALOG)["layouts"]]
    pts = [(b["position"]["x"], b["position"]["z"]) for b in beds]
    assert all(math.dist(a, b) >= 600 for i, a in enumerate(pts) for b in pts[i + 1 :])  # 침대 중심이 서로 600mm 이상 떨어짐


def test_timeout_returns_partial():
    res = recommend(_tpl("6py"), WORKER, catalog=CATALOG, time_budget=0.0)
    assert res["partial"] is True


def test_existing_bed_is_reused_and_desk_added_from_catalog():
    # room.sample: 기존 침대(움직일 수 있음) + 업무형이면 카탈로그 책상 추가
    lay = recommend(load("room.sample.json"), WORKER, catalog=CATALOG)["layouts"][0]
    bed = next(p for p in lay["placements"] if p["category"] == "bed")
    desk = next(p for p in lay["placements"] if p["category"] == "desk")
    assert bed["instanceId"] == "inst_bed_01" and bed["source"] == "existing"
    assert desk["source"] == "catalog" and desk["catalogItemId"] == "cat_desk_t"
    assert lay["analysis"]["totalPrice"] == {"amount": 59900, "currency": "KRW"}


def test_immovable_furniture_stays_locked():
    room = load("room.sample.json")
    room["existingFurniture"][0]["movable"] = False
    for lay in recommend(room, WORKER, catalog=CATALOG)["layouts"]:
        bed = next(p for p in lay["placements"] if p["instanceId"] == "inst_bed_01")
        assert bed["locked"] is True and bed["position"] == {"x": 600, "z": 3700} and bed["rotationDeg"] == 0


def test_budget_excludes_expensive_items():
    # 예산 50,000원이면 59,900원 책상은 못 넣는다
    lay = recommend(load("room.sample.json"), WORKER, budget=50000, catalog=CATALOG)["layouts"][0]
    assert not any(p["category"] == "desk" for p in lay["placements"])


def test_layout_shape_matches_schema_fields():
    lay = recommend(_tpl("5py"), WORKER, catalog=CATALOG)["layouts"][0]
    assert lay["layoutId"].startswith("lay_") and lay["roomId"] == "room_01J0TEMPLATE05PYSTUDIO00"
    assert lay["kind"] == "ai_recommendation" and lay["version"] == 1 and lay["postits"] == []
    assert set(lay["analysis"]["scoreBreakdown"]) == {"monitorGlare", "daylight", "circulation", "openness", "storageAccess", "bedPlacement"}
    assert 0 <= lay["analysis"]["score"] <= 100
    assert all(p["rotationDeg"] in (0, 90, 180, 270) for p in lay["placements"])


def test_recommend_endpoint():
    client = TestClient(app)
    res = client.post("/v1/layouts:recommend", json={"room": _tpl("4py"), "answers": WORKER, "catalog": CATALOG})
    assert res.status_code == 200
    body = res.json()
    assert len(body["layouts"]) == 3 and body["partial"] is False
