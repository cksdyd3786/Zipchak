"""집착 추천 엔진 진입점 (담당 D). 계약: docs/api.md"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException

from app.constraints import validate_layout
from app.preferences import question_list, weights_from_answers

app = FastAPI(title="Zipchak Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/v1/questions")
def questions() -> dict[str, Any]:
    return question_list()


@app.post("/v1/layouts:recommend")
def recommend(body: dict[str, Any]) -> dict[str, Any]:
    # TODO(M2-1~M2-3): 그리드 → 후보 → 하드 제약 → 가중 점수 → 빔 서치 상위 3개
    weights = body.get("weights") or weights_from_answers(body.get("answers", {}))
    return {"layouts": [], "partial": True, "weights": weights}


@app.post("/v1/layouts:validate")
def validate(body: dict[str, Any]) -> dict[str, Any]:
    """M2-2 하드 제약 위반 목록. 점수 재계산(analysis)은 M2-3에서 채운다."""
    try:
        violations = validate_layout(body["room"], body["layout"], body.get("catalog"))
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_FAILED", "message": str(e), "details": {}}})
    return {"violations": violations, "analysis": None}


@app.post("/v1/fit:search")
def fit_search(body: dict[str, Any]) -> dict[str, Any]:
    # TODO(M3-2~M3-4): 부족 가구·데드 스페이스 슬롯에 들어가는 상품 정렬
    return {"recommendedItems": []}
