"""테스트용 방·가구 생성기와 fixture 경로."""
from __future__ import annotations

import copy
import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "schema" / "fixtures"
TEMPLATE_FILES = sorted((FIXTURES / "templates").glob("tpl-*.json"))


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def box_room(w: int = 3000, d: int = 4000, *, door: dict | None = None, window: dict | None = None, fixtures=None, existing=None, source="manual") -> dict:
    """w×d 직사각형 방.

    기본 문: 남쪽 벽(wall_S, start=(w,d) → end=(0,d)) offset 300, 폭 900, 왼쪽 경첩, 안쪽 90°.
      → 개구부 x = w−300 … w−1200. 기본 3000×4000 이면 x 2700…1800, 경첩 (2700, 4000).
    기본 창: 북쪽 벽(wall_N, (0,0)→(w,0)) offset 1000, 폭 1000, 창틀 900 → x 1000…2000.
    """
    door = door if door is not None else {"offset": 300, "width": 900, "swing": {"kind": "hinged", "hingeSide": "left", "opensInward": True, "maxAngleDeg": 90}}
    window = window if window is not None else {"offset": 1000, "width": 1000, "sillHeight": 900}
    openings = []
    if door:
        openings.append({"id": "door_1", "type": "door", "wallId": "wall_S", "offset": door["offset"], "width": door["width"],
                         "height": 2100, "sillHeight": 0, "facing": None, "swing": door.get("swing")})
    if window:
        openings.append({"id": "win_1", "type": "window", "wallId": "wall_N", "offset": window["offset"], "width": window["width"],
                         "height": 1200, "sillHeight": window["sillHeight"], "facing": window.get("facing", "S"), "swing": None})
    return {
        "schemaVersion": "1.0", "roomId": "room_test", "ownerId": "user_test", "name": "test", "source": source,
        "unit": "mm", "ceilingHeight": 2400,
        "floorPolygon": [{"x": 0, "z": 0}, {"x": w, "z": 0}, {"x": w, "z": d}, {"x": 0, "z": d}],
        "walls": [
            {"id": "wall_N", "start": {"x": 0, "z": 0}, "end": {"x": w, "z": 0}, "height": 2400, "thickness": 120},
            {"id": "wall_E", "start": {"x": w, "z": 0}, "end": {"x": w, "z": d}, "height": 2400, "thickness": 120},
            {"id": "wall_S", "start": {"x": w, "z": d}, "end": {"x": 0, "z": d}, "height": 2400, "thickness": 120},
            {"id": "wall_W", "start": {"x": 0, "z": d}, "end": {"x": 0, "z": 0}, "height": 2400, "thickness": 120},
        ],
        "openings": openings,
        "fixtures": fixtures or [],
        "existingFurniture": existing or [],
        "createdAt": "2026-11-23T00:00:00Z", "updatedAt": "2026-11-23T00:00:00Z",
    }


def item(iid: str, category: str, w: int, d: int, h: int, x: int, z: int, rot: int = 0, catalog_id=None) -> dict:
    return {"instanceId": iid, "source": "catalog" if catalog_id else "custom", "catalogItemId": catalog_id, "category": category,
            "dimensions": {"width": w, "depth": d, "height": h}, "position": {"x": x, "z": z}, "rotationDeg": rot, "locked": False}


def layout(*placements) -> dict:
    return {"placements": list(placements)}


def codes(violations) -> list[str]:
    return sorted(v["code"] for v in violations)


def clone(o):
    return copy.deepcopy(o)
