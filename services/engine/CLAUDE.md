# CLAUDE.md — services/engine (담당 D: AI 배치·마켓 추천 엔진)

루트 `CLAUDE.md`의 규칙을 먼저 따른다.

## 이 서비스의 성격

**무상태(stateless)** FastAPI 서버. DB에 접근하지 않고 요청 본문(`room`, `layout`, `catalog`)만으로 계산한다. 그래서 E의 진행과 무관하게 로컬에서 개발·테스트할 수 있다.

## 담당 기능

| ID | 기능 | 우선순위 | 완료 기준 |
| --- | --- | --- | --- |
| M2-1 | 질문형 맞춤 배치안 (답 → 가중치 → 배치안 3개) | Must | 답이 다르면 결과가 달라짐, 5초 내 3개, 충돌 0 |
| M2-2 | 하드 제약 (문 반경·창문 가림·벽 관통·가구 간섭, 동선 600mm) | Must | 단위 테스트 20케이스 통과 |
| M2-3 | 소프트 점수 6항목 | Must | 항목별 점수 + 사유 문장 반환 |
| M2-4 | AI 설명 (LLM): 배치 이유 + "내 방 유형" | Must | 2~3문장 + 유형 이름 |
| M2-5 | 가중치 직접 조절 → 재추천 | Should | |
| M3-1 | 카탈로그 필터 로직 (데이터 수집은 E) | Must | |
| M3-2 | 부족 가구 탐지 | Must | 업무형인데 책상 없으면 `missing:desk` |
| M3-3 | 데드 스페이스 탐지 (300×300mm 이상) | Must | M3-4와 함께 구현 |
| M3-4 | "들어감" 판정 (여유 폭: 정밀 20mm / 자유 50mm) | Must | 추천 상품 100% 배치 시 충돌 0 |
| M3-8 | 인테리어 소품 추천 (스타일 태그) | Should | |
| M1-6 | 평면도 자동 벽 인식 | Could | |

## 엔드포인트 (`docs/api.md`가 원본)

- `POST /v1/layouts:recommend` `{ room, answers, weights?, budget?, catalog }` → `{ layouts: FurnitureLayout[], partial }`
- `POST /v1/layouts:validate` `{ room, layout, catalog? }` → `{ violations, analysis }` (가구 편집·제안 포스트잇 미리보기에 사용)
  - `catalog`는 `MarketFurnitureItem[]` 선택 필드. 가구별 `clearance`를 `catalogItemId` ↔ `itemId`로 찾아 여기서 읽고, 없으면 카테고리 기본값(`DEFAULT_CLEARANCE`)을 쓴다.
- `POST /v1/fit:search` `{ room, layout, slot, catalog }` → `{ recommendedItems }`

## 알고리즘 (개발 계획서 2-3)

1. 바닥 50mm 그리드, 금지 영역 마스크 (문 회전 부채꼴, 창문 앞 높이 제한, 고정물)
2. 질문 답 → 가중치 (`app/weights.json`)
3. 큰 가구부터 배치 (침대 → 책상 → 수납장 → 기타)
4. 벽에 붙인 위치 × 회전 4방향 후보 → 하드 제약 위반 제거
5. 점수: 모니터 반사 · 채광 · 동선(A*) · 개방감 · 수납장 문 열림(`clearance.front`) · 침대 위치(문 시야, 에어컨 바람)
6. 빔 서치(폭 20) → 침대 위치가 서로 다른 3개

## 규칙

- 기하 함수는 `app/geometry.py`에 **순수 함수**로 두고 pytest로 먼저 테스트한다. 숫자는 mm 정수.
- 5초 타임아웃 시 그때까지의 최선안 + `partial: true`.
- 스폰서 노출(구 M3-7)은 이번 학기 구현하지 않는다. `sponsor` 필드는 읽기만 하고 무시한다.
- LLM 키는 `LLM_API_KEY` 환경변수. 키가 없으면 규칙 기반 템플릿 문장으로 대체한다.

## 실행

```bash
cd services/engine
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
pytest
```
