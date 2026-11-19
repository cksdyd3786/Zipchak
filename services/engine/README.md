# services/engine — AI 배치·마켓 추천 엔진 (담당 D)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest
```

- `app/geometry.py` — 충돌·들어감 판정 (순수 함수)
- `app/preferences.py` + `app/weights.json` — 취향 질문 → 가중치
- `app/main.py` — 엔드포인트

규칙과 알고리즘은 `CLAUDE.md`.
