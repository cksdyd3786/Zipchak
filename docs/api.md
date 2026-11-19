# API 계약 (1주차 금요일 동결)

본문 스키마는 `packages/schema`가 원본이다. 바꾸려면 이슈에 `api-change` 라벨을 붙이고 E와 해당 파트가 합의한다.

## REST (services/api, 담당 E)

| 메서드 | 경로 | 기능 ID | 요청 → 응답 |
| --- | --- | --- | --- |
| POST | `/auth/login` | M0-1 | 이메일·비번 또는 OAuth code → `{ accessToken }` |
| POST | `/rooms` | M0-2 | `RoomData`(roomId 없이) → `RoomData` |
| GET | `/rooms/:roomId` | M0-2 | → `RoomData` |
| POST | `/rooms/:roomId/scan-asset` | M1-1 | multipart(.usdz) → `{ rawAssetUrl }` |
| GET | `/templates` | M1-3 | → `RoomData[]` (source = template) |
| GET | `/catalog?category=&maxWidth=&maxDepth=` | M3-1 | → `MarketFurnitureItem[]` |
| GET | `/questions` | M2-1 | → 취향 질문 목록 (엔진 프록시) |
| POST | `/rooms/:roomId/recommend` | M2-1 | `{ answers, weights?, budget? }` → `FurnitureLayout[]` (최대 3) |
| POST | `/layouts/:layoutId/validate` | M4-2 | `FurnitureLayout` → `{ violations, analysis }` |
| GET / PUT | `/layouts/:layoutId` | M0-2 | `FurnitureLayout` (PUT은 version 검사, 낮으면 409) |
| POST | `/rooms/:roomId/invites` | M5-1 | `{ permission: "view" \| "postit", expiresIn }` → `{ inviteToken, url, qrPngUrl }` |
| POST | `/layouts/:layoutId/postits` | M5-2 | postit(id 없이) → postit |
| POST | `/layouts/:layoutId/postits/:postitId/preview` | M5-2 | 제안 포스트잇 → `{ previewLayout, violations, analysis }` (저장 안 함) |
| POST | `/events` | M0-3 | `{ type, roomId, itemId?, meta }` |
| POST | `/internal/postits` | M5-2 | 실시간 서버 전용 (`X-Internal-Token`) |

에러 포맷: `{ "error": { "code": "ROOM_NOT_CLOSED", "message": "바닥 윤곽이 닫히지 않았습니다", "details": {} } }`

## 엔진 (services/engine, 담당 D) — API 서버만 호출

| 메서드 | 경로 | 요청 → 응답 |
| --- | --- | --- |
| GET | `/v1/questions` | → 질문 목록 |
| POST | `/v1/layouts:recommend` | `{ room, answers, weights?, budget?, catalog }` → `{ layouts, partial }` |
| POST | `/v1/layouts:validate` | `{ room, layout }` → `{ violations, analysis }` |
| POST | `/v1/fit:search` | `{ room, layout, slot, catalog }` → `{ recommendedItems }` |

## Socket.io (services/realtime, 담당 C) — 네임스페이스 `/room`, 룸 = `layoutId`

| 방향 | 이벤트 | 페이로드 |
| --- | --- | --- |
| C→S | `room:join` | `{ layoutId, token }` (JWT 또는 inviteToken) |
| S→C | `room:state` | `{ layout, visitors[] }` |
| C→S | `presence:update` | `{ position{x,y,z}, yawDeg, viewMode }` (최대 10Hz) |
| S→C | `presence:broadcast` | `{ visitorId, displayName, position, yawDeg }` |
| C→S | `postit:add` | postit (방명록·제안) → API 저장 후 `postit:added` 브로드캐스트 |
| C→S | `postit:resolve` | `{ postitId }` (주인만) → `postit:resolved` 브로드캐스트 |
| S→C | `error` | `{ code: "EXPIRED_INVITE" \| "FORBIDDEN" \| "ROOM_FULL", message }` |
