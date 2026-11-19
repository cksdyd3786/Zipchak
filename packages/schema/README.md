# packages/schema — 공통 데이터 규격 v1.0

모든 모듈이 주고받는 세 가지 JSON의 **유일한 원본**이다. 코드에 같은 구조를 손으로 다시 정의하지 말고, 여기서 생성한다.

| 스키마 | 만드는 쪽 | 읽는 쪽 |
| --- | --- | --- |
| `room.schema.json` (`RoomData`) | iOS(A), 웹 자유 모드(B) | 전원 |
| `market-furniture-item.schema.json` (`MarketFurnitureItem`) | 카탈로그 수집(E) | 엔진(D), 웹(B) |
| `furniture-layout.schema.json` (`FurnitureLayout`) | 엔진(D), 웹(B), 포스트잇(C) | 전원 |

## 예시 데이터

`fixtures/`의 파일로 다른 파트의 서버 없이 개발한다. A가 실측한 방은 `fixtures/rooms/`에 추가한다.

## 검증

```bash
npm install
npm run validate
```

## 타입 생성

```bash
# TypeScript (B, C, E)
npx json-schema-to-typescript room.schema.json > ../../apps/web/src/types/room.d.ts
# Python (D)
datamodel-codegen --input room.schema.json --input-file-type jsonschema --output ../../services/engine/app/models/room.py
```

## 변경 규칙

- **E만 머지한다.** 변경이 필요하면 이슈에 `schema-change` 라벨을 붙여 제안한다.
- 필드 추가 = minor (1.1), 삭제·이름 변경 = 전원 합의 후 major.
- 바꾸면 `fixtures/`도 같이 고치고 `npm run validate`가 통과해야 한다.
