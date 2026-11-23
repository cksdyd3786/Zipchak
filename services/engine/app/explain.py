"""AI 설명 (M2-4): 배치 이유 2~3문장 + '내 방 유형' {name, summary}.

- LLM 호출은 `Explainer` 인터페이스 뒤에 둔다. 테스트는 가짜 구현을 쓴다.
- 키는 환경변수 `LLM_API_KEY` 만 읽는다. 키가 없거나, 실패하거나, 시간(기본 1초) 안에 답이 없으면
  점수 상위 항목으로 만드는 **규칙 기반 문장**으로 대체한다 → 응답은 항상 1초 안에 채워진다.
- 선택 환경변수: `LLM_PROVIDER` (anthropic | openai, 기본 anthropic), `LLM_MODEL`, `LLM_TIMEOUT_S` (기본 1.0)
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Protocol

from app.scoring import SCORE_KEYS

DEFAULT_MODELS = {"anthropic": "claude-haiku-5-5", "openai": "gpt-4o-mini"}
ENDPOINTS = {"anthropic": "https://api.anthropic.com/v1/messages", "openai": "https://api.openai.com/v1/chat/completions"}

# 가중치 × 점수가 가장 큰 항목 → 방 유형 (규칙 기반)
ROOM_TYPES: dict[str, tuple[str, str]] = {
    "monitorGlare": ("창가 집중러", "책상은 빛을 옆에 두고, 화면에 창이 비치지 않게 앉는 방"),
    "daylight": ("햇살 수집가", "낮 동안 가장 밝은 자리를 책상에 내어 준 방"),
    "circulation": ("동선 미니멀리스트", "문에서 어디든 돌아가지 않고 닿는, 군더더기 없는 방"),
    "openness": ("손님맞이 호스트", "가구를 벽으로 모아 가운데를 넓게 비워 둔, 친구 부르기 좋은 방"),
    "storageAccess": ("정리 정돈러", "수납장 앞을 넉넉히 비워 꺼내고 넣기 편한 방"),
    "bedPlacement": ("숙면 지킴이", "침대를 문 시선과 바람에서 숨긴, 잠이 우선인 방"),
}

SYSTEM_PROMPT = (
    "너는 원룸 가구 배치 앱 '집착'의 설명 담당이다. 입력은 엔진이 계산한 배치안 요약(JSON)이다. "
    "입력에 있는 사실만 써라. 숫자를 지어내지 마라. 친근한 해요체 한국어로 답한다. "
    '반드시 JSON 하나만 출력한다: {"reasons": ["문장", "문장"(, "문장")], "roomType": {"name": "8자 이내 별명", "summary": "한 문장"}}. '
    "reasons 는 2~3개, 각 60자 이내. roomType.name 예: 창가 집중러, 숙면 지킴이."
)


class Explainer(Protocol):
    def explain(self, summary: dict[str, Any]) -> dict[str, Any]:
        """요약 → {"reasons": [...], "roomType": {"name", "summary"}}. 실패하면 예외."""


# ---------------------------------------------------------------- 요약
def summarize(layout: dict[str, Any], reasons_by_key: dict[str, str] | None = None) -> dict[str, Any]:
    """LLM 에 넘길 요약 (좌표·점수·위반·사유). 개인정보·ID 없이."""
    a = layout.get("analysis") or {}
    prefs = layout.get("preferences") or {}
    return {
        "answers": prefs.get("answers") or {},
        "weights": prefs.get("weights") or {},
        "score": a.get("score"),
        "scoreBreakdown": a.get("scoreBreakdown") or {},
        "violations": [v.get("code") for v in a.get("violations") or []],
        "engineNotes": reasons_by_key or {},
        "placements": [
            {"category": p["category"], "x": p["position"]["x"], "z": p["position"]["z"], "rotationDeg": p["rotationDeg"],
             "size": [p["dimensions"]["width"], p["dimensions"]["depth"]]}
            for p in layout.get("placements", [])
        ],
    }


# ---------------------------------------------------------------- 규칙 기반
def ranked_keys(summary: dict[str, Any]) -> list[str]:
    b, w = summary.get("scoreBreakdown") or {}, summary.get("weights") or {}
    return sorted((k for k in SCORE_KEYS if k in b), key=lambda k: -max(0.0, w.get(k, 1.0)) * b[k])


class RuleExplainer:
    """점수 상위 항목의 엔진 사유 문장으로 2~3문장 + 방 유형."""

    def explain(self, summary: dict[str, Any]) -> dict[str, Any]:
        keys = ranked_keys(summary)
        notes = summary.get("engineNotes") or {}
        reasons = [notes[k] for k in keys if k in notes][:3]
        if summary.get("violations"):
            reasons = (["몇 가지 배치 규칙에 걸려요. 빨간 가구를 옮겨 보세요"] + reasons)[:3]
        while len(reasons) < 2:
            reasons.append("가구를 벽 쪽으로 모아 지나다니기 편하게 두었어요")
        top = keys[0] if keys else "circulation"
        name, room_summary = ROOM_TYPES[top]
        return {"reasons": reasons, "roomType": {"name": name, "summary": room_summary}}


# ---------------------------------------------------------------- LLM
class LLMExplainer:
    def __init__(self, api_key: str, provider: str = "anthropic", model: str | None = None, timeout_s: float = 1.0):
        self.api_key = api_key
        self.provider = provider if provider in ENDPOINTS else "anthropic"
        self.model = model or DEFAULT_MODELS[self.provider]
        self.timeout_s = timeout_s

    def _request(self, user_text: str) -> str:
        if self.provider == "anthropic":
            body = {"model": self.model, "max_tokens": 400, "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_text}]}
            headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        else:
            body = {"model": self.model, "max_tokens": 400, "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_text}]}
            headers = {"Authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        req = urllib.request.Request(ENDPOINTS[self.provider], data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout_s) as res:  # noqa: S310 - 고정된 https 주소
            data = json.loads(res.read().decode("utf-8"))
        if self.provider == "anthropic":
            return "".join(part.get("text", "") for part in data.get("content", []))
        return data["choices"][0]["message"]["content"]

    def explain(self, summary: dict[str, Any]) -> dict[str, Any]:
        text = self._request(json.dumps(summary, ensure_ascii=False))
        return parse_llm_json(text)


def parse_llm_json(text: str) -> dict[str, Any]:
    """LLM 출력에서 JSON 을 꺼내 형식을 검사한다. 어긋나면 ValueError."""
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("JSON 없음")
    data = json.loads(text[start : end + 1])
    reasons = [str(r).strip() for r in data.get("reasons", []) if str(r).strip()]
    rt = data.get("roomType") or {}
    if not 2 <= len(reasons) <= 3 or not rt.get("name") or not rt.get("summary"):
        raise ValueError("형식 불일치")
    return {"reasons": reasons, "roomType": {"name": str(rt["name"])[:20], "summary": str(rt["summary"])}}


def explainer_from_env() -> Explainer | None:
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not key:
        return None
    return LLMExplainer(key, os.environ.get("LLM_PROVIDER", "anthropic"), os.environ.get("LLM_MODEL") or None,
                        float(os.environ.get("LLM_TIMEOUT_S", "1.0")))


# ---------------------------------------------------------------- 채우기
_POOL = ThreadPoolExecutor(max_workers=4)


def explain_layouts(layouts: list[dict[str, Any]], notes: list[dict[str, str]], llm: Explainer | None = None,
                    timeout_s: float = 1.0) -> list[str]:
    """배치안마다 analysis.reasons·roomType 을 채운다 (제자리 수정). 어떤 설명을 썼는지 'llm'|'rule' 목록을 돌려준다."""
    rule = RuleExplainer()
    summaries = [summarize(lay, n) for lay, n in zip(layouts, notes)]
    futures = [_POOL.submit(llm.explain, s) for s in summaries] if llm else []
    deadline = time.monotonic() + timeout_s  # 3개를 합쳐서 timeout_s 안에 끝낸다
    used = []
    for i, (lay, s) in enumerate(zip(layouts, summaries)):
        result, kind = None, "rule"
        if futures:
            try:
                result, kind = futures[i].result(timeout=max(0.0, deadline - time.monotonic())), "llm"
            except (FutureTimeout, Exception):  # noqa: BLE001 - 어떤 실패든 규칙 기반으로 대체
                result = None
        if result is None:
            result, kind = rule.explain(s), "rule"
        lay.setdefault("analysis", {})["reasons"] = result["reasons"]
        lay["roomType"] = result["roomType"]
        used.append(kind)
    return used
