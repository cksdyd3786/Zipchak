"""취향 질문 답 → 점수 항목 가중치 (M2-1). FastAPI 없이 테스트할 수 있게 분리한다."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

WEIGHTS: dict[str, Any] = json.loads((Path(__file__).parent / "weights.json").read_text(encoding="utf-8"))


def weights_from_answers(answers: dict[str, str]) -> dict[str, float]:
    result = dict(WEIGHTS["base"])
    for qid, option in answers.items():
        delta = WEIGHTS["questions"].get(qid, {}).get("options", {}).get(option, {}).get("delta", {})
        for key, value in delta.items():
            result[key] = max(0.0, result[key] + value)
    return result


def question_list() -> dict[str, Any]:
    """웹(B)이 질문 화면을 그릴 때 쓰는 질문 목록."""
    return {
        qid: {"label": q["label"], "options": {k: v["label"] for k, v in q["options"].items()}}
        for qid, q in WEIGHTS["questions"].items()
    }
