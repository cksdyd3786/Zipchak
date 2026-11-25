"""인테리어 소품 추천 (M3-8). forSlot = "decor".

1. 방 스타일: 배치안·기존 가구 중 카탈로그 상품의 styleTags 를 모아 다수결 (태그별 표 수)
2. 후보: category 가 lamp·decor 인 상품. 점수 = 겹치는 태그들의 표 수 합 → 많이 겹치는 순, 같으면 싼 순
3. 자리 확인
   - 바닥 소품 (높이 > 700): M3-4 와 같이 빈 벽면 후보에 실제로 놓아 보고 새 위반 0 일 때만 (fits·validate)
   - 탁상 소품 (높이 ≤ 700): 책상·테이블·수납장·선반 위에 올라갈 폭·깊이가 되는지만 본다
4. 상위 3개
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from app.constraints import Furniture

DECOR_CATEGORIES = ("lamp", "decor")
TABLETOP_MAX_HEIGHT_MM = 700
SURFACE_CATEGORIES = ("desk", "table", "storage", "shelf")
TOP_N = 3


def room_style(layout: dict[str, Any], room: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> Counter:
    votes: Counter = Counter()
    seen: set[str] = set()
    for entry in list(layout.get("placements", [])) + list(room.get("existingFurniture", [])):
        if entry.get("instanceId") in seen:
            continue
        seen.add(entry.get("instanceId"))
        item = by_id.get(entry.get("catalogItemId") or "")
        if item and item.get("category") not in DECOR_CATEGORIES:
            votes.update(item.get("styleTags", []))
    return votes


def style_match(item: dict[str, Any], votes: Counter) -> int:
    return sum(votes[t] for t in set(item.get("styleTags", [])))


def tabletop_surface(item: dict[str, Any], items: list[Furniture]) -> Furniture | None:
    """소품이 올라갈 수 있는 가장 넓은 가구 윗면."""
    d = item["dimensions"]
    ok = [f for f in items if f.category in SURFACE_CATEGORIES and f.height <= 1300
          and min(d["width"], d["depth"]) <= min(f.width, f.depth) and max(d["width"], d["depth"]) <= max(f.width, f.depth)]
    return max(ok, key=lambda f: f.width * f.depth, default=None)
