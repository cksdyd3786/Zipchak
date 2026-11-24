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
- `scripts/make_proxy_glb.py` — 카탈로그 규격 → proxy 박스 `.glb` 일괄 생성 (Blender 있으면 bpy, 없으면 순수 파이썬)

```bash
python scripts/make_proxy_glb.py --catalog ../../packages/schema/fixtures/catalog.json --out build/proxy_glb
# 또는: blender --background --python scripts/make_proxy_glb.py -- --catalog ... --out build/proxy_glb
```

규칙과 알고리즘은 `CLAUDE.md`.
