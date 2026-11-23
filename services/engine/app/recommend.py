"""질문형 맞춤 배치안 생성 (M2-1). services/engine/CLAUDE.md 알고리즘 3~6번.

1. 놓을 가구 정하기: 방의 기존 가구(움직일 수 있는 것) + 없는 필수 카테고리는 카탈로그에서 1개씩
2. 큰 가구부터 (침대 → 책상 → 장롱 → 수납장 → 선반 → 기타)
3. 후보: 바닥 윤곽의 각 축 정렬 벽 × 회전 4방향, 벽에 붙여 100mm 간격으로 밀기
4. 하드 제약(M2-2) 위반 후보 제거
5. 가중 점수(scoring.score_layout, 가중치 = weights_from_answers)로 빔 서치 (폭 20)
6. 끝까지 위반 0 인 상태 중 침대 위치가 서로 다른 3개

5초(기본 4.5초 예산) 안에 못 끝내면 그때까지의 최선안 + partial: true.
"""
from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field, replace
from typing import Any

from app.constraints import (
    ALLOWED_IN_CLEARANCE,
    Furniture,
    check_circulation,
    check_doors,
    check_walls,
    check_windows,
    furniture_from,
    validate_items,
)
from app.geometry import clearance_zones, footprint
from app.ids import new_id, now_iso
from app.preferences import weights_from_answers
from app.room import Room, rect_polygon
from app.scoring import score_layout, top_reasons

BEAM_WIDTH = 20
STEP_MM = 100
TIME_BUDGET_S = 4.5
PRE_KEEP = 6  # 상태마다 싼 점수 상위 몇 개를 정밀 점수로 볼지
EXPLORE_KEEP = 2  # 다양성을 위해 무작위로 더 볼 후보 수
PLACE_ORDER = ["bed", "desk", "wardrobe", "storage", "shelf", "sofa", "table", "chair", "etc", "lamp", "decor"]
BED_BUCKET_MM = 600
MAX_PER_BED_BUCKET = 4
ENGINE_ACTOR = {"type": "engine", "id": "engine@0.1.0", "displayName": "집착 AI"}


# ---------------------------------------------------------------------------
# 1. 놓을 가구
# ---------------------------------------------------------------------------
def required_categories(answers: dict[str, str]) -> list[str]:
    """필수 카테고리 (임시 규칙). M3-2(#27)에서 required.json 규칙표로 바꾼다."""
    cats = ["bed"]
    if answers.get("deskHours", "1to4") != "lt1":
        cats.append("desk")
    return cats


@dataclass
class ToPlace:
    proto: Furniture  # 위치는 무시, 규격·여유 공간만 사용
    source: str  # existing | catalog
    catalog_item_id: str | None
    price: int = 0


def pick_catalog_item(catalog: list[dict[str, Any]], category: str, budget_left: int | None) -> dict[str, Any] | None:
    options = [c for c in catalog if c.get("category") == category and c.get("status", "available") == "available"]
    if budget_left is not None:
        options = [c for c in options if c["price"]["amount"] <= budget_left]
    options.sort(key=lambda c: (c["dimensions"]["width"] * c["dimensions"]["depth"], c["price"]["amount"]))
    return options[0] if options else None


def furniture_to_place(room: Room, answers: dict[str, str], catalog: list[dict[str, Any]], budget: int | None) -> tuple[list[ToPlace], list[Furniture]]:
    by_id = {c["itemId"]: c for c in catalog}
    movable, fixed = [], []
    for e in room.data.get("existingFurniture", []):
        f = furniture_from(e, by_id)
        if e.get("movable", True):
            movable.append(ToPlace(f, "existing", e.get("catalogItemId")))
        else:
            fixed.append(f)
    have = {t.proto.category for t in movable} | {f.category for f in fixed}
    budget_left = budget
    for cat in required_categories(answers):
        if cat in have:
            continue
        item = pick_catalog_item(catalog, cat, budget_left)
        if item is None:
            continue
        if budget_left is not None:
            budget_left -= item["price"]["amount"]
        entry = {"instanceId": new_id("inst"), "category": cat, "catalogItemId": item["itemId"],
                 "dimensions": item["dimensions"], "position": {"x": 0, "z": 0}, "rotationDeg": 0}
        movable.append(ToPlace(furniture_from(entry, by_id), "catalog", item["itemId"], item["price"]["amount"]))
    order = {c: i for i, c in enumerate(PLACE_ORDER)}
    movable.sort(key=lambda t: (order.get(t.proto.category, len(order)), -t.proto.width * t.proto.depth))
    return movable, fixed


# ---------------------------------------------------------------------------
# 3. 후보 위치
# ---------------------------------------------------------------------------
def wall_candidates(room: Room, f: Furniture) -> list[Furniture]:
    pts = list(room.polygon.exterior.coords)[:-1]
    seen: set[tuple[int, int, int]] = set()
    out: list[Furniture] = []
    for k in range(len(pts)):
        (ax, az), (bx, bz) = pts[k], pts[(k + 1) % len(pts)]
        ax, az, bx, bz = int(ax), int(az), int(bx), int(bz)
        if ax != bx and az != bz:
            continue  # 비스듬한 벽은 MVP 에서 제외
        wall = {"start": {"x": ax, "z": az}, "end": {"x": bx, "z": bz}}
        nx, nz = room.wall_inward(wall)
        for rot in (0, 90, 180, 270):
            r0 = footprint(0, 0, f.width, f.depth, rot)
            w, d = r0.max_x - r0.min_x, r0.max_z - r0.min_z
            if az == bz:  # 가로 벽
                lo, hi = min(ax, bx), max(ax, bx) - w
                min_z = az if nz > 0 else az - d
                spans = [(mx, min_z) for mx in _steps(lo, hi)]
            else:  # 세로 벽
                lo, hi = min(az, bz), max(az, bz) - d
                min_x = ax if nx > 0 else ax - w
                spans = [(min_x, mz) for mz in _steps(lo, hi)]
            for min_x, min_z in spans:
                cx, cz = min_x - r0.min_x, min_z - r0.min_z
                key = (cx, cz, rot)
                if key not in seen:
                    seen.add(key)
                    out.append(replace(f, x=cx, z=cz, rotation=rot))
    return out


def _steps(lo: int, hi: int) -> list[int]:
    if hi < lo:
        return []
    vals = list(range(lo, hi + 1, STEP_MM))
    if vals[-1] != hi:
        vals.append(hi)
    return vals


# ---------------------------------------------------------------------------
# 4. 싼 검사 (원 가구 1개 + 이미 놓인 가구)
# ---------------------------------------------------------------------------
def quick_ok(room: Room, f: Furniture, placed: list[Furniture]) -> bool:
    for g in placed:
        if f.rect.intersects(g.rect):
            return False
    if check_walls(room, [f]) or check_doors(room, [f]) or check_windows(room, [f]):
        return False
    # 내 여유 공간이 벽·가구에 막히지 않고, 남의 여유 공간을 내가 막지 않는지
    allowed = ALLOWED_IN_CLEARANCE.get(f.category, set())
    for _side, zone in clearance_zones(f.rect, f.clearance, f.rotation):
        if any(zone.intersects(g.rect) and g.category not in allowed for g in placed):
            return False
        zpoly = rect_polygon(zone)
        if not room.prepared.covers(zpoly):
            return False
        for _fid, fprep, fpoly in room.fixture_prepared:
            if fprep.intersects(zpoly) and fpoly.intersection(zpoly).area > 0:
                return False
    for g in placed:
        if f.category in ALLOWED_IN_CLEARANCE.get(g.category, set()):
            continue
        if any(zone.intersects(f.rect) for _s, zone in clearance_zones(g.rect, g.clearance, g.rotation)):
            return False
    return True


# ---------------------------------------------------------------------------
# 5. 빔 서치
# ---------------------------------------------------------------------------
@dataclass
class State:
    placed: list[Furniture]  # 이번에 놓은 가구 (고정 가구 제외)
    score: int
    breakdown: dict[str, float]
    reasons: dict[str, str] = field(default_factory=dict)


def _bed_key(state: State) -> tuple[int, int, int] | None:
    bed = next((f for f in state.placed if f.category == "bed"), None)
    if bed is None:
        return None
    return (bed.x // BED_BUCKET_MM, bed.z // BED_BUCKET_MM, (bed.rotation // 90) % 2)


def beam_search(room: Room, to_place: list[ToPlace], fixed: list[Furniture], weights: dict[str, float],
                time_budget: float = TIME_BUDGET_S, seed: int = 7) -> tuple[list[State], bool]:
    deadline = time.monotonic() + time_budget
    rng = random.Random(seed)
    base = score_layout(room, fixed, weights)
    beam = [State([], base["score"], base["breakdown"], base["reasons"])]
    partial = False
    for tp in to_place:
        if time.monotonic() > deadline:
            partial = True
            break
        cands_all = wall_candidates(room, tp.proto)
        expanded: list[tuple[float, State, Furniture]] = []
        for st in beam:
            if time.monotonic() > deadline:
                partial = True
                break
            context = fixed + st.placed
            ok = [c for c in cands_all if quick_ok(room, c, context)]
            if not ok:
                continue
            # 싼 점수(가구 위치 관련 항목만)로 정렬 → 상위 + 무작위 몇 개만 정밀 점수
            pre = sorted(ok, key=lambda c: -_position_score(room, context + [c], weights))
            chosen = pre[:PRE_KEEP] + rng.sample(pre[PRE_KEEP:], min(EXPLORE_KEEP, max(0, len(pre) - PRE_KEEP)))
            for c in chosen:
                sc = score_layout(room, context + [c], weights)
                expanded.append((sc["score"], State(st.placed + [c], sc["score"], sc["breakdown"], sc["reasons"]), c))
        if not expanded:
            continue  # 이 가구는 놓을 자리가 없다 → 건너뛴다
        expanded.sort(key=lambda t: -t[0])
        new_beam: list[State] = []
        per_bucket: dict[Any, int] = {}
        for _s, st, _c in expanded:
            if time.monotonic() > deadline:
                partial = True
                break
            key = _bed_key(st)
            if key is not None and per_bucket.get(key, 0) >= MAX_PER_BED_BUCKET:
                continue
            if check_circulation(room, st.placed, fixed):
                continue
            new_beam.append(st)
            if key is not None:
                per_bucket[key] = per_bucket.get(key, 0) + 1
            if len(new_beam) >= BEAM_WIDTH:
                break
        if new_beam:
            beam = new_beam
    return beam, partial


def _position_score(room: Room, items: list[Furniture], weights: dict[str, float]) -> float:
    """openness 를 뺀 빠른 점수 (scoring 의 다른 항목만 가중합)."""
    from app.scoring import SCORE_KEYS, score_layout_fast

    b = score_layout_fast(room, items)
    return sum(weights.get(k, 1.0) * b[k] for k in SCORE_KEYS if k != "openness")


# ---------------------------------------------------------------------------
# 6. 서로 다른 3개 고르기 + FurnitureLayout 만들기
# ---------------------------------------------------------------------------
def pick_diverse(states: list[State], room: Room, fixed: list[Furniture], n: int = 3) -> list[State]:
    valid = [s for s in sorted(states, key=lambda s: -s.score) if not validate_items(room, s.placed, fixed)]
    picked: list[State] = []
    for s in valid:
        bed = next((f for f in s.placed if f.category == "bed"), None)
        if bed is not None and any(
            math.dist((bed.x, bed.z), (b.x, b.z)) < BED_BUCKET_MM
            for p in picked for b in p.placed if b.category == "bed"
        ):
            continue
        if any(_signature(s) == _signature(p) for p in picked):
            continue
        picked.append(s)
        if len(picked) == n:
            return picked
    for s in valid:  # 침대 위치가 다른 안이 부족하면 나머지로 채운다
        if len(picked) == n:
            break
        if all(_signature(s) != _signature(p) for p in picked):
            picked.append(s)
    return picked


def _signature(s: State) -> tuple:
    return tuple(sorted((f.instance_id, f.x, f.z, f.rotation) for f in s.placed))


TITLE_BY_KEY = {
    "monitorGlare": "눈이 편한 업무형",
    "daylight": "햇살 가득 창가형",
    "circulation": "동선 넉넉형",
    "openness": "탁 트인 초대형",
    "storageAccess": "수납 알뜰형",
    "bedPlacement": "아늑한 숙면형",
}


def to_layout(room: Room, state: State, to_place: list[ToPlace], fixed: list[Furniture], answers: dict[str, str],
              weights: dict[str, float], budget: int | None, partial: bool, rank: int) -> dict[str, Any]:
    meta = {tp.proto.instance_id: tp for tp in to_place}
    placements = []
    for f in fixed:
        placements.append(_placement(f, "existing", None, locked=True))
    for f in state.placed:
        tp = meta[f.instance_id]
        placements.append(_placement(f, tp.source, tp.catalog_item_id, locked=False))
    top = max(state.breakdown, key=lambda k: weights.get(k, 1.0) * state.breakdown[k])
    now = now_iso()
    price = sum(meta[f.instance_id].price for f in state.placed)
    return {
        "schemaVersion": "1.0",
        "layoutId": new_id("lay"),
        "roomId": room.data.get("roomId", "room_unknown"),
        "version": 1,
        "kind": "ai_recommendation",
        "parentLayoutId": None,
        "createdBy": ENGINE_ACTOR,
        "preferences": {"answers": answers, "weights": weights, "budget": budget},
        "roomType": None,
        "title": f"{TITLE_BY_KEY[top]} {rank}",
        "placements": placements,
        "analysis": {
            "score": state.score,
            "scoreBreakdown": state.breakdown,
            "violations": [],
            "reasons": top_reasons({"breakdown": state.breakdown, "reasons": state.reasons}, weights) if state.reasons else [],
            "totalPrice": {"amount": price, "currency": "KRW"},
            "partial": partial,
        },
        "postits": [],
        "createdAt": now,
        "updatedAt": now,
    }


def _placement(f: Furniture, source: str, catalog_item_id: str | None, locked: bool) -> dict[str, Any]:
    return {
        "instanceId": f.instance_id,
        "source": source,
        "catalogItemId": catalog_item_id,
        "category": f.category,
        "dimensions": {"width": f.width, "depth": f.depth, "height": f.height},
        "position": {"x": f.x, "z": f.z},
        "rotationDeg": f.rotation,
        "locked": locked,
    }


def recommend(room_data: dict[str, Any], answers: dict[str, str] | None = None, weights: dict[str, float] | None = None,
              budget: int | None = None, catalog: list[dict[str, Any]] | None = None,
              time_budget: float = TIME_BUDGET_S) -> dict[str, Any]:
    answers = answers or {}
    weights = weights or weights_from_answers(answers)
    room = Room(room_data)
    to_place, fixed = furniture_to_place(room, answers, catalog or [], budget)
    beam, partial = beam_search(room, to_place, fixed, weights, time_budget=time_budget)
    picked = pick_diverse(beam, room, fixed)
    if len(picked) < 3:
        partial = partial or len(picked) < 3
    layouts = [to_layout(room, s, to_place, fixed, answers, weights, budget, partial, i + 1) for i, s in enumerate(picked)]
    return {"layouts": layouts, "partial": partial}
