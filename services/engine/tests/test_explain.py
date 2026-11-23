"""M2-4 AI 설명. LLM 은 가짜 구현으로 테스트한다 (실제 네트워크 호출 없음)."""
import io
import json
import time

import pytest

from app import explain as ex
from app.explain import LLMExplainer, RuleExplainer, explain_layouts, explainer_from_env, parse_llm_json, summarize
from app.recommend import recommend
from tests.helpers import CATALOG, HOST, WORKER, load

GOOD = {"reasons": ["책상을 창과 직각으로 두었어요", "침대는 문에서 안 보이는 안쪽이에요"], "roomType": {"name": "창가 집중러", "summary": "빛은 옆에, 침대는 안쪽에"}}


class FakeLLM:
    def __init__(self, result=None, delay=0.0, error=None):
        self.result, self.delay, self.error, self.calls = result, delay, error, []

    def explain(self, summary):
        self.calls.append(summary)
        time.sleep(self.delay)
        if self.error:
            raise self.error
        return self.result


def _layout(breakdown, weights=None, violations=()):
    return {"placements": [], "preferences": {"answers": {}, "weights": weights or {}},
            "analysis": {"score": 80, "scoreBreakdown": breakdown, "violations": [{"code": c} for c in violations], "reasons": []}}


B = {"monitorGlare": 1.0, "daylight": 0.9, "circulation": 0.8, "openness": 0.5, "storageAccess": 1.0, "bedPlacement": 0.4}
NOTES = {k: f"{k} 사유" for k in B}


# ---------------------------------------------------------------- 규칙 기반
def test_rule_based_two_to_three_sentences_and_type():
    out = RuleExplainer().explain(summarize(_layout(B), NOTES))
    assert 2 <= len(out["reasons"]) <= 3
    assert out["roomType"]["name"] == "창가 집중러"  # monitorGlare 1.0 × 가중치 1 이 최대 (storageAccess 와 동점이면 앞 항목)


def test_rule_based_type_follows_weights():
    out = RuleExplainer().explain(summarize(_layout(B, {"bedPlacement": 5.0}), NOTES))
    assert out["roomType"]["name"] == "숙면 지킴이" and out["reasons"][0] == "bedPlacement 사유"


def test_rule_based_mentions_violations_first():
    out = RuleExplainer().explain(summarize(_layout(B, violations=["DOOR_SWING"]), NOTES))
    assert "규칙" in out["reasons"][0]


# ---------------------------------------------------------------- LLM 출력 검사
def test_parse_llm_json_accepts_wrapped_json():
    assert parse_llm_json("설명입니다\n" + json.dumps(GOOD, ensure_ascii=False) + "\n끝") == GOOD


@pytest.mark.parametrize("bad", ["no json", json.dumps({"reasons": ["하나"], "roomType": {"name": "a", "summary": "b"}}),
                                 json.dumps({"reasons": ["a", "b"], "roomType": {}})])
def test_parse_llm_json_rejects_bad_shape(bad):
    with pytest.raises((ValueError, json.JSONDecodeError)):
        parse_llm_json(bad)


# ---------------------------------------------------------------- 채우기 (가짜 LLM)
def test_llm_result_is_used():
    lays = [_layout(B)]
    assert explain_layouts(lays, [NOTES], FakeLLM(GOOD)) == ["llm"]
    assert lays[0]["analysis"]["reasons"] == GOOD["reasons"] and lays[0]["roomType"] == GOOD["roomType"]


def test_llm_error_falls_back_to_rules():
    lays = [_layout(B)]
    assert explain_layouts(lays, [NOTES], FakeLLM(error=RuntimeError("500"))) == ["rule"]
    assert lays[0]["roomType"]["name"] == "창가 집중러"


def test_slow_llm_falls_back_within_one_second():
    lays = [_layout(B), _layout(B), _layout(B)]
    t = time.monotonic()
    used = explain_layouts(lays, [NOTES] * 3, FakeLLM(GOOD, delay=3.0), timeout_s=0.3)
    assert time.monotonic() - t < 1.0 and used == ["rule"] * 3


def test_summary_has_no_ids():
    s = summarize(load("layout.sample.json"))
    text = json.dumps(s, ensure_ascii=False)
    assert "inst_" not in text and "lay_" not in text and "pin_" not in text and "지수" not in text  # 포스트잇 작성자 이름도 안 넘김


# ---------------------------------------------------------------- 환경변수·HTTP 형식
def test_no_key_means_no_llm(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    assert explainer_from_env() is None


def test_key_from_env(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    e = explainer_from_env()
    assert isinstance(e, LLMExplainer) and e.provider == "openai" and e.api_key == "test-key"


@pytest.mark.parametrize("provider,payload", [
    ("anthropic", {"content": [{"type": "text", "text": json.dumps(GOOD, ensure_ascii=False)}]}),
    ("openai", {"choices": [{"message": {"content": json.dumps(GOOD, ensure_ascii=False)}}]}),
])
def test_llm_http_shapes(monkeypatch, provider, payload):
    seen = {}

    def fake_urlopen(req, timeout):
        seen["url"], seen["headers"], seen["body"] = req.full_url, dict(req.header_items()), json.loads(req.data)
        return io.BytesIO(json.dumps(payload).encode("utf-8"))

    monkeypatch.setattr(ex.urllib.request, "urlopen", fake_urlopen)
    out = LLMExplainer("k", provider).explain({"score": 1})
    assert out == GOOD and seen["url"] == ex.ENDPOINTS[provider]
    assert "k" in json.dumps(seen["headers"])  # 키는 헤더로만, 본문에는 없음


# ---------------------------------------------------------------- 엔진 연결
def test_recommend_fills_reasons_and_room_type_without_key(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    for lay in recommend(load("room.sample.json"), WORKER, catalog=CATALOG)["layouts"]:
        assert 2 <= len(lay["analysis"]["reasons"]) <= 3
        assert lay["roomType"]["name"] and lay["roomType"]["summary"]


def test_recommend_uses_llm_and_stays_under_5s():
    fake = FakeLLM(GOOD, delay=0.2)
    t = time.monotonic()
    lays = recommend(load("room.sample.json"), HOST, catalog=CATALOG, explainer=fake)["layouts"]
    assert time.monotonic() - t < 5.0
    assert all(lay["roomType"] == GOOD["roomType"] for lay in lays) and len(fake.calls) == 3
