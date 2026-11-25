"""'들어감' 판정 + 맞춤 상품 추천 (M3-4). POST /v1/fit:search.

슬롯 두 종류:
  - "dead:<id>"        M3-3 데드 스페이스. 슬롯 사각형 안에 회전 4방향으로 넣어 본다
  - "missing:<category>" M3-2 부족 카테고리. 빈 벽면 후보(배치 엔진과 같은 벽 붙이기 후보)에 놓아 본다

각 후보 상품을 실제로 배치안에 넣어 보고, M2-2 검사에서 **새 위반이 0개**일 때만 추천한다.
(기존 배치에 이미 있던 위반은 상품 탓이 아니므로 늘지만 않으면 된다.)

여유 폭: 정밀 모드(lidar) 20mm / 자유 모드 50mm (geometry.margin_for_source).
  - dead 슬롯: 좌우 여유 2×margin, 깊이 여유 margin (geometry.fits 와 같음), 창 아래면 heightLimit 이하
  - fitMarginMm = 슬롯 − 상품 (회전 반영). missing 슬롯은 놓은 자리에서 벽을 따라 남는 폭 / 앞으로 남는 깊이(여유 공간 제외)
정렬: 같은 슬롯 안에서 fitMarginMm.width 가 작은 순(공간을 꼭 맞게 쓰는 상품 먼저) → 깊이 여유 → 가격.
응답 항목에는 웹 3D 미리보기(M3-5)용 `placement {position, rotationDeg}` 를 덧붙인다.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.constraints import Furniture, furniture_from, validate_items
from app.deadspace import detect_dead_spaces
from app.geometry import Rect, clearance_zones, footprint, margin_for_source, world_side
from app.missing import missing_categories
from app.preferences import weights_from_answers
from app.recommend import quick_ok, wall_candidates
from app.room import Room
from app.scoring import SCORE_KEYS, free_depth, score_layout, score_layout_fast

MAX_PER_SLOT = 5
MAX_POSITIONS_SCORED = 12


def _catalog_proto(item: dict[str, Any], iid: str, by_id: dict[str, dict[str, Any]]) -> Furniture:
    entry = {"instanceId": iid, "category": item["category"], "catalogItemId": item["itemId"],
             "dimensions": item["dimensions"], "position": {"x": 0, "z": 0}, "rotationDeg": 0}
    return furniture_from(entry, by_id)


def _new_violations(room: Room, items: list[Furniture], obstacles: list[Furniture], new: Furniture, base_count: int) -> list[dict]:
    v = validate_items(room, items + [new], obstacles)
    if any(x["instanceId"] == new.instance_id for x in v) or len(v) > base_count:
        return v
    return []


# ---------------------------------------------------------------- dead 슬롯
def dead_slot_positions(slot: Rect, f: Furniture, margin: int) -> list[tuple[Furniture, int, int]]:
    """슬롯 안에 여유 폭을 지키며 놓을 수 있는 (가구, 폭 여유, 깊이 여유) 후보. 회전 4방향 × 정면 방향별 위치."""
    sw, sd = slot.max_x - slot.min_x, slot.max_z - slot.min_z
    out = []
    for rot in (0, 90, 180, 270):
        r0 = footprint(0, 0, f.width, f.depth, rot)
        w, d = r0.max_x - r0.min_x, r0.max_z - r0.min_z
        front = world_side("front", rot)
        # 정면이 향하는 축: 그 축 방향 여유는 margin 한 번, 옆 방향은 양쪽 margin
        if front[0] == 0:
            lateral, along = (sw, w), (sd, d)
        else:
            lateral, along = (sd, d), (sw, w)
        if lateral[1] + 2 * margin > lateral[0] or along[1] + margin > along[0]:
            continue
        # 옆은 가운데, 정면 축 방향으로는 슬롯 양 끝 두 곳 (트인 쪽을 보는 자리는 fit_search 가 고른다)
        cx_min = slot.min_x + (sw - w) // 2
        cz_min = slot.min_z + (sd - d) // 2
        if front[0] == 0:
            spots = [(cx_min, slot.min_z), (cx_min, slot.max_z - d)]
        else:
            spots = [(slot.min_x, cz_min), (slot.max_x - w, cz_min)]
        for mx, mz in spots:
            placed = replace(f, x=mx - r0.min_x, z=mz - r0.min_z, rotation=rot)
            out.append((placed, lateral[0] - lateral[1], along[0] - along[1]))
    return out


# ---------------------------------------------------------------- missing 슬롯
def _others(f: Furniture, context: list[Furniture]) -> list[Furniture]:
    return [g for g in context if g.instance_id != f.instance_id]


def wall_run_margin(room: Room, f: Furniture, context: list[Furniture], limit: int = 2000) -> int:
    """벽을 따라 왼쪽·오른쪽으로 비어 있는 폭의 합."""
    others = _others(f, context)
    return sum(free_depth(room, f.rect, world_side(side, f.rotation), others, limit) for side in ("left", "right"))


def front_margin(room: Room, f: Furniture, context: list[Furniture], limit: int = 2000) -> int:
    """정면 여유 공간(clearance.front) 너머로 더 비어 있는 깊이."""
    need = int(f.clearance.get("front", 0))
    return max(0, free_depth(room, f.rect, world_side("front", f.rotation), _others(f, context), need + limit) - need)


# ---------------------------------------------------------------- 메인
def parse_slot(slot: str) -> tuple[str, str]:
    if slot == "decor":
        return "decor", ""
    kind, _, key = (slot or "").partition(":")
    if kind not in ("dead", "missing") or not key:
        raise ValueError(f"slot 형식은 'dead:<id>' · 'missing:<category>' · 'decor' 이다: {slot!r}")
    return kind, key


def fit_search(room_data: dict[str, Any], layout: dict[str, Any], slot: str | None, catalog: list[dict[str, Any]]) -> dict[str, Any]:
    room = Room(room_data)
    by_id = {c["itemId"]: c for c in catalog}
    items = [furniture_from(p, by_id) for p in layout.get("placements", [])]
    placed = {f.instance_id for f in items}
    obstacles = [furniture_from(e, by_id) for e in room.fixed_furniture(placed)]
    base_count = len(validate_items(room, items, obstacles))
    margin = margin_for_source(room.source)
    prefs = layout.get("preferences") or {}
    answers = prefs.get("answers") or {}
    weights = prefs.get("weights") or weights_from_answers(answers)
    available = [c for c in catalog if c.get("status", "available") == "available"]

    if slot:
        slots = [slot]
    else:  # slot 이 없으면 부족 카테고리 + 데드 스페이스 전부
        slots = [f"missing:{c}" for c in missing_categories(room_data, answers, layout)]
        slots += [f"dead:{d['id']}" for d in detect_dead_spaces(room, items, obstacles)]
        slots.append("decor")

    results: list[dict[str, Any]] = []
    for s in slots:
        kind, key = parse_slot(s)
        found: list[tuple[tuple, dict]] = []
        if kind == "decor":
            results += _decor(room, room_data, layout, items, obstacles, available, by_id, weights, margin, base_count)
            continue
        if kind == "dead":
            dead = {d["id"]: d for d in detect_dead_spaces(room, items, obstacles)}.get(key)
            if dead is None:
                continue
            poly = dead["polygon"]
            rect = Rect(min(p["x"] for p in poly), min(p["z"] for p in poly), max(p["x"] for p in poly), max(p["z"] for p in poly))
            cats = set(dead.get("suggestedCategories") or [])
            for c in available:
                if cats and c["category"] not in cats:
                    continue
                if c["dimensions"]["height"] > dead["maxBox"]["heightLimit"]:
                    continue
                proto = _catalog_proto(c, f"inst_fit_{c['itemId']}", by_id)
                ok = [(cand, mw, md) for cand, mw, md in dead_slot_positions(rect, proto, margin)
                      if not _new_violations(room, items, obstacles, cand, base_count)]
                if ok:
                    # 정면이 트인 바닥 쪽을 보는 방향을 고른다 (꺼내 쓰기 쉬운 쪽)
                    ctx = items + obstacles
                    cand, mw, md = max(ok, key=lambda t: free_depth(room, t[0].rect, world_side("front", t[0].rotation), ctx, 3000))
                    found.append(((mw, md, c["price"]["amount"]), _rec(c, s, mw, md, cand)))
        elif key == "chair":
            # 의자는 벽이 아니라 책상 앞 여유 공간(의자 자리) 안에 들어가야 한다
            desk = next((f for f in items if f.category == "desk"), None)
            if desk is None:
                continue
            zone = next((z for side, z in clearance_zones(desk.rect, desk.clearance, desk.rotation) if side == "front"), None)
            if zone is None:
                continue
            for c in [c for c in available if c["category"] == "chair"]:
                proto = _catalog_proto(c, f"inst_fit_{c['itemId']}", by_id)
                fx, fz = world_side("front", desk.rotation)
                rot = desk.rotation  # 책상과 같은 방향 (의자 등받이가 사람 쪽)
                r0 = footprint(0, 0, proto.width, proto.depth, rot)
                w, d = r0.max_x - r0.min_x, r0.max_z - r0.min_z
                zw, zd = zone.max_x - zone.min_x, zone.max_z - zone.min_z
                if w + 2 * margin > zw or d + margin > zd:
                    continue
                # 책상 쪽 가장자리(정면 반대쪽)에 붙이고 옆은 가운데
                min_x = zone.min_x + (zw - w) // 2
                min_z = zone.min_z + (zd - d) // 2
                if fz > 0:
                    min_z = zone.min_z
                elif fz < 0:
                    min_z = zone.max_z - d
                elif fx > 0:
                    min_x = zone.min_x
                else:
                    min_x = zone.max_x - w
                cand = replace(proto, x=min_x - r0.min_x, z=min_z - r0.min_z, rotation=rot)
                if _new_violations(room, items, obstacles, replace(cand, clearance={}), base_count):
                    continue
                found.append(((zw - w, zd - d, c["price"]["amount"]), _rec(c, s, zw - w, zd - d, cand)))
        else:
            for c in [c for c in available if c["category"] == key]:
                proto = _catalog_proto(c, f"inst_fit_{c['itemId']}", by_id)
                context = items + obstacles
                cand = _place_on_wall(room, proto, items, obstacles, weights, base_count)
                if cand is None:
                    continue
                mw, md = wall_run_margin(room, cand, context), front_margin(room, cand, context)
                if mw < 2 * margin or md < margin:
                    # 벽을 따라 남는 폭이 여유 폭보다 작으면 '딱 맞음' 보장이 없으므로 제외
                    continue
                found.append(((mw, md, c["price"]["amount"]), _rec(c, s, mw, md, cand)))
        found.sort(key=lambda t: t[0])
        for rank, (_k, rec) in enumerate(found[:MAX_PER_SLOT], start=1):
            rec["rank"] = rank
            results.append(rec)
    return {"recommendedItems": results}


def _rec(item: dict[str, Any], slot: str, mw: int, md: int, placed: Furniture) -> dict[str, Any]:
    return {
        "catalogItemId": item["itemId"],
        "forSlot": slot,
        "fitMarginMm": {"width": int(mw), "depth": int(md)},
        "rank": 0,
        "placement": {"position": {"x": placed.x, "z": placed.z}, "rotationDeg": placed.rotation},
    }


def _fast_total(room: Room, items: list[Furniture], weights: dict[str, float]) -> float:
    b = score_layout_fast(room, items)
    return sum(weights.get(k, 1.0) * b[k] for k in SCORE_KEYS)


def _place_on_wall(room: Room, proto: Furniture, items: list[Furniture], obstacles: list[Furniture],
                   weights: dict[str, float], base_count: int) -> Furniture | None:
    """빈 벽면 후보 중 새 위반 0 이고 점수가 가장 좋은 자리 (missing 슬롯과 같은 방식)."""
    context = items + obstacles
    cands = [c for c in wall_candidates(room, proto) if quick_ok(room, c, context)]
    cands.sort(key=lambda c: -_fast_total(room, context + [c], weights))
    best, checked = None, 0
    for cand in cands:
        if checked >= MAX_POSITIONS_SCORED:
            break
        if _new_violations(room, items, obstacles, cand, base_count):
            continue
        checked += 1
        sc = score_layout(room, context + [cand], weights)["score"]
        if best is None or sc > best[0]:
            best = (sc, cand)
    return best[1] if best else None


def _decor(room, room_data, layout, items, obstacles, available, by_id, weights, margin, base_count) -> list[dict[str, Any]]:
    from app.decor import DECOR_CATEGORIES, TABLETOP_MAX_HEIGHT_MM, TOP_N, room_style, style_match, tabletop_surface

    votes = room_style(layout, room_data, by_id)
    cands = sorted((c for c in available if c["category"] in DECOR_CATEGORIES),
                   key=lambda c: (-style_match(c, votes), c["price"]["amount"]))
    recs: list[dict[str, Any]] = []
    for c in cands:
        if len(recs) >= TOP_N:
            break
        d = c["dimensions"]
        if d["height"] <= TABLETOP_MAX_HEIGHT_MM:
            surface = tabletop_surface(c, items + obstacles)
            if surface is None:
                continue
            rec = _rec(c, "decor", max(surface.width, surface.depth) - max(d["width"], d["depth"]),
                       min(surface.width, surface.depth) - min(d["width"], d["depth"]), surface)
            rec["placement"]["onTopOf"] = surface.instance_id
        else:
            proto = _catalog_proto(c, f"inst_fit_{c['itemId']}", by_id)
            cand = _place_on_wall(room, proto, items, obstacles, weights, base_count)
            if cand is None:
                continue
            context = items + obstacles
            mw, md = wall_run_margin(room, cand, context), front_margin(room, cand, context)
            if mw < 2 * margin or md < margin:
                continue
            rec = _rec(c, "decor", mw, md, cand)
        rec["styleMatch"] = style_match(c, votes)
        rec["rank"] = len(recs) + 1
        recs.append(rec)
    return recs
