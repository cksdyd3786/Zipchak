# CLAUDE.md — apps/ios (담당 A: 정밀 모드 스캔 앱)

루트 `CLAUDE.md`의 규칙을 먼저 따른다.

## 이 폴더가 하는 일

RoomPlan으로 방을 스캔해 `CapturedRoom`을 `RoomData`(packages/schema/room.schema.json)로 변환하고 API에 업로드한다. 앱은 작게 유지한다: 화면은 시작 → 스캔 → 미리보기 → 업로드 완료(웹 링크) 4개뿐이다.

## 담당 기능

| ID | 기능 | 완료 기준 |
| --- | --- | --- |
| M1-1 | RoomPlan 스캔 → `RoomData` 변환·업로드 | 실측 대비 벽 길이 오차 ±3cm 이내 (팀원 방 3곳 검증) |
| M1-3 | 원룸 템플릿 3종 `RoomData` 작성 (4·5·6평) | `packages/schema/fixtures/templates/`에 제출, 스키마 통과 |
| M3-1 | 카탈로그 25종 수집 (규격·가격·URL·verifiedAt) | 시트 → `catalog*.json` 변환, 스키마 통과, 필드 누락 0 |

## 변환 규칙 (가장 중요)

- RoomPlan은 **m 단위 float** → `Int((value * 1000).rounded())` 로 mm 정수.
- RoomPlan 좌표의 바닥 다각형 바운딩 박스 최소 (x, z)를 (0, 0)으로 **평행이동**한다.
- `CapturedRoom.walls` → `walls[]` (start/end는 벽 중심선의 양 끝 2D 좌표, `thickness`는 기본 120).
- `doors`/`windows`/`openings` → `openings[]`. `wallId`는 가장 가까운 벽, `offset`은 벽 `start`에서 개구부 시작 모서리까지 거리.
- 문 열림 방향은 RoomPlan이 주지 않는다 → `swing: { kind: "hinged", hingeSide: "left", opensInward: true, maxAngleDeg: 90 }` 기본값. 웹에서 사용자가 고친다.
- 창문 `facing`은 알 수 없으면 `null`.
- `objects` → `existingFurniture[]`. RoomPlan 카테고리를 스키마 카테고리로 매핑:
  `bed→bed, table→table, chair→chair, sofa→sofa, storage→storage, (나머지)→etc`.
  `confidence`는 RoomPlan 값을 `"high" | "medium" | "low"` 로.
- `source: "lidar"`, `sourceMeta.device`에 기기 모델명.

## 예외 처리

- `RoomCaptureSession.isSupported == false` → "웹에서 자유 모드로 만들기" 안내 + 웹 링크.
- RoomPlan instructions 이벤트(조명 부족, 너무 빠름 등)를 한국어 문구로 화면 상단에 표시.
- 업로드 실패 → JSON을 기기에 임시 저장, 재시도 버튼.

## 다른 파트에 주는 것

- 1~2주차: 팀원 방 스캔 결과 `RoomData` JSON 3~5개를 `packages/schema/fixtures/rooms/`에 PR로 제출 (E가 머지). 이 데이터로 B·C·D가 개발한다.

## 테스트

- 변환 함수(`RoomDataConverter`)는 순수 함수로 분리하고 XCTest로 단위 테스트한다. RoomPlan은 시뮬레이터에서 동작하지 않으므로 스캔은 실기기로만 확인한다.
