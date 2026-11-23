"""배치안 하나를 검사·채점해 FurnitureLayout.analysis 를 만든다 (validate 엔드포인트)."""
from __future__ import annotations

from typing import Any

from app.constraints import furniture_from, validate_items
from app.deadspace import detect_dead_spaces
from app.preferences import weights_from_answers
from app.room import Room
from app.scoring import score_layout, top_reasons


def layout_weights(layout: dict[str, Any]) -> dict[str, float]:
    prefs = layout.get("preferences") or {}
    return prefs.get("weights") or weights_from_answers(prefs.get("answers") or {})


def analyze_layout(room_data: dict[str, Any], layout: dict[str, Any], catalog: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    room = Room(room_data)
    by_id = {c["itemId"]: c for c in (catalog or [])}
    items = [furniture_from(p, by_id) for p in layout.get("placements", [])]
    placed = {f.instance_id for f in items}
    obstacles = [furniture_from(e, by_id) for e in room.fixed_furniture(placed)]
    violations = validate_items(room, items, obstacles)
    weights = layout_weights(layout)
    result = score_layout(room, items + obstacles, weights)
    analysis = {
        "score": result["score"],
        "scoreBreakdown": result["breakdown"],
        "violations": violations,
        "reasons": top_reasons(result, weights),
        "deadSpaces": detect_dead_spaces(room, items, obstacles),
    }
    return {"violations": violations, "analysis": analysis}
