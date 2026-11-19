# CLAUDE.md — services/api + packages/schema (담당 E: 백엔드 코어·통합 리더)

루트 `CLAUDE.md`의 규칙을 먼저 따른다.

## 담당 기능

| ID | 기능 | 우선순위 |
| --- | --- | --- |
| M0-1 | 회원가입/로그인 (이메일 또는 카카오 OAuth 중 1개) → JWT | Must |
| M0-2 | 내 방 목록·배치안 저장/불러오기 | Must |
| M0-3 | 퍼널 이벤트 로깅 (`events` 테이블 1개) | Should |
| M1-3 | 원룸 템플릿 3종 데이터 (`GET /templates`) | Must |
| M3-1 | 카탈로그 25종 수집·DB (로직은 D) | Must |
| M3-8 | 인테리어 소품 데이터 (조명·서랍장) | Should |

그 외: `packages/schema` 머지 권한, CI, 배포, Mock 서버.

## 구조

Node 20 + Express + TypeScript, Prisma, PostgreSQL 16(JSONB). `RoomData`·`FurnitureLayout`은 JSONB 컬럼에 통째로 저장하고, 조회에 필요한 필드(ownerId, roomId, version)만 컬럼으로 뺀다.

테이블: `users, rooms, layouts, catalog_items, postits, invites, events`

## 규칙

- 모든 요청·응답 본문은 `packages/schema`로 **ajv 검증**한다. 실패 시 400 + 공통 에러 포맷.
- `PUT /layouts/:id`는 `version` 비교 → 낮으면 409 Conflict.
- 추천 요청은 엔진(D)을 프록시한다. 엔진이 죽으면 템플릿별 기본 배치안으로 폴백.
- 실시간 서버(C)용 `/internal/*`는 `REALTIME_INTERNAL_TOKEN` 헤더로만 허용.
- 에러 포맷: `{ "error": { "code": "ROOM_NOT_CLOSED", "message": "...", "details": {} } }`

## Mock 서버 (1주차 산출물)

`docs/openapi.yaml`을 1주차에 작성하고 Prism으로 띄워 B·C·D가 서버 없이 붙을 수 있게 한다:

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml -p 4000
```
