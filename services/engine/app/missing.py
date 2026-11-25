"""부족 가구 탐지 (M3-2). 라이프스타일상 필요한데 방에 없는 가구 카테고리.

필요 카테고리 = required.json 의 always + 질문 답별 목록 (답이 없으면 defaults)
가진 것     = 방의 기존 가구 + 배치안에서 source 가 existing·custom 인 가구 (catalog = 아직 안 산 추천 상품)
            + 대신할 수 있는 가구·붙박이 고정물 (satisfiedBy)
missingCategories = 필요 − 가진 것  (required.json 의 order 순서)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RULES: dict[str, Any] = json.loads((Path(__file__).parent / "required.json").read_text(encoding="utf-8"))


def required_categories(answers: dict[str, str]) -> list[str]:
    merged = {**RULES.get("defaults", {}), **(answers or {})}
    need: list[str] = list(RULES["always"])
    for qid, options in RULES["byAnswer"].items():
        for cat in options.get(merged.get(qid, ""), []):
            if cat not in need:
                need.append(cat)
    order = {c: i for i, c in enumerate(RULES["order"])}
    return sorted(need, key=lambda c: order.get(c, len(order)))


def owned_categories(room: dict[str, Any], layout: dict[str, Any] | None = None) -> set[str]:
    owned = {f["category"] for f in room.get("existingFurniture", [])}
    for p in (layout or {}).get("placements", []):
        if p.get("source") in ("existing", "custom"):
            owned.add(p["category"])
    return owned


def is_satisfied(category: str, owned: set[str], fixture_types: set[str]) -> bool:
    if category in owned:
        return True
    alt = RULES.get("satisfiedBy", {}).get(category, {})
    return bool(owned & set(alt.get("categories", []))) or bool(fixture_types & set(alt.get("fixtures", [])))


def missing_categories(room: dict[str, Any], answers: dict[str, str], layout: dict[str, Any] | None = None) -> list[str]:
    owned = owned_categories(room, layout)
    fixtures = {f.get("type") for f in room.get("fixtures", [])}
    return [c for c in required_categories(answers) if not is_satisfied(c, owned, fixtures)]
