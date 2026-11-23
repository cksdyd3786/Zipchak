"""집착 추천 엔진 진입점 (담당 D). 계약: docs/api.md"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException

from app.analysis import analyze_layout
from app.preferences import question_list
from app.recommend import recommend as recommend_layouts

app = FastAPI(title="Zipchak Engine", version="0.1.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/v1/questions")
def questions() -> dict[str, Any]:
    return question_list()


@app.post("/v1/layouts:recommend")
def recommend(body: dict[str, Any]) -> dict[str, Any]:
    """M2-1: 그리드 → 후보 → 하드 제약 → 가중 점수 → 빔 서치 → 침대 위치가 다른 3개."""
    try:
        return recommend_layouts(
            body["room"], body.get("answers") or {}, body.get("weights"), body.get("budget"), body.get("catalog") or []
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_FAILED", "message": str(e), "details": {}}})


@app.post("/v1/layouts:validate")
def validate(body: dict[str, Any]) -> dict[str, Any]:
    """M2-2 하드 제약 위반 + M2-3 점수 재계산 + M3-3 데드 스페이스 (가구 편집·제안 포스트잇 미리보기)."""
    try:
        return analyze_layout(body["room"], body["layout"], body.get("catalog"))
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail={"error": {"code": "VALIDATION_FAILED", "message": str(e), "details": {}}})


@app.post("/v1/fit:search")
def fit_search(body: dict[str, Any]) -> dict[str, Any]:
    # TODO(M3-2~M3-4): 부족 가구·데드 스페이스 슬롯에 들어가는 상품 정렬
    return {"recommendedItems": []}
