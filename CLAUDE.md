# CLAUDE.md — 집착(Zipchak) 공통 규칙

이 파일은 이 저장소에서 일하는 모든 Claude 세션이 먼저 읽는 규칙이다. 각 파트 폴더의 `CLAUDE.md`가 이 파일에 덧붙는다.

## 서비스 한 줄

방 3D 데이터(`RoomData`) → AI 배치안(`FurnitureLayout`) → 치수가 맞는 실제 가구(`MarketFurnitureItem`) 추천 → 친구 방문·포스트잇.

## 절대 규칙

1. **모든 모듈은 세 JSON만 주고받는다:** `RoomData`, `MarketFurnitureItem`, `FurnitureLayout`. 정의는 `packages/schema/*.schema.json`이 유일한 원본이다.
2. **스키마 파일은 수정하지 않는다.** 필드가 필요하면 코드를 고치지 말고 사람에게 "스키마 변경 제안"을 남긴다 (E만 머지).
3. **자기 파트 폴더 밖의 파일은 수정하지 않는다.** 필요한 변경은 PR 설명에 적어 해당 담당자에게 요청한다.
4. **비밀 정보 금지:** API 키·DB 비밀번호는 `.env`에만 둔다. 코드·커밋·프롬프트에 넣지 않는다. `.env.example`만 커밋한다.

## 좌표·단위 규약 (어기면 통합 실패)

| 항목 | 규약 |
| --- | --- |
| 단위 | 모든 길이는 **mm 정수**. Three.js 렌더 시 `/ 1000`, RoomPlan(m) → `Math.round(x * 1000)` |
| 축 | 오른손 좌표계, **Y축 = 위**, 바닥 = XZ 평면 |
| 2D 평면 좌표 | `{ x, z }` (mm). 평면도에서 위쪽이 −Z |
| 원점 | 바닥 다각형 바운딩 박스의 최소 (x, z) = (0, 0) |
| 회전 | `rotationDeg`: Y축 기준 반시계 방향. MVP는 0/90/180/270만 |
| 가구 기준점 | 바닥면 중심. `width`=X, `depth`=Z, `height`=Y (회전 0도 기준) |
| 가구 정면 | 회전 0도일 때 **+Z 방향** |
| ID | `prefix_` + ULID (예: `room_01HX...`, `lay_...`, `pin_...`) |
| 시간 | ISO 8601 UTC 문자열 |

## 입력 모드

- **정밀 모드:** LiDAR 아이폰 Pro + RoomPlan → `source: "lidar"`
- **자유 모드:** 모든 기기(웹) → `source: "manual" | "template" | "floorplan"`. 사용자가 입력한 값이므로 마켓 필터 여유 폭은 50mm (정밀 모드 20mm).

## 일하는 방식

- 요청에는 **기능 ID**(예: M2-2)가 붙는다. 해당 기능의 완료 기준은 `docs/features.md`에 있다. 완료 기준을 테스트로 먼저 쓰고 구현한다.
- 다른 파트의 서버가 아직 없으면 `packages/schema/fixtures/*.json`과 Mock 서버로 개발한다.
- 변경은 작게. 한 PR에는 한 기능 ID만 담는다.
- 코드 주석·커밋 메시지는 한국어 또는 영어 중 팀이 정한 것을 따른다 (기본: 커밋 제목은 `feat(M2-2): 문 회전 반경 충돌 검사`).
- 확신이 없는 설계 결정(스키마, API 모양, 폴더 구조)은 구현 전에 사람에게 묻는다.

## 폴더 지도

```
apps/ios            A  Swift · RoomPlan (+ fixtures/rooms·templates, 카탈로그 데이터는 PR로 제출)
apps/web            B  React · R3F (social/ 하위는 C)
services/realtime   C  Socket.io
services/engine     D  FastAPI · 배치 엔진
services/api        E  Express · Prisma
packages/schema     E  JSON Schema + fixtures
docs                전원
```
