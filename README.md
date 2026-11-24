# 집착 (Zipchak)

> 내 방을 스캔하거나 직접 만들면, AI가 배치를 추천하고 **치수가 맞는 가구만** 골라 준다. 친구는 링크 하나로 놀러 와 포스트잇을 남긴다.

'SW활용 및 개발' 학기 프로젝트 · 5인 팀 · Claude 바이브 코딩으로 개발

## 데모 흐름 (MVP의 정의)

```
방 만들기(정밀 스캔 / 자유 편집) → 취향 질문 → AI 배치안 3개 → 빈칸에 맞는 가구 추천
→ 3D로 놓아보고 구매 링크 → 친구 초대 → 방명록·제안 포스트잇
```

이 흐름이 끊김 없이 동작하면 Must는 끝난 것이다.

## 저장소 구조

| 폴더 | 담당 | 내용 | 스택 |
| --- | --- | --- | --- |
| `apps/ios` | **A** | 정밀 모드: RoomPlan 스캔 → `RoomData` 업로드 (+ 템플릿·카탈로그 데이터 수집) | Swift, SwiftUI, RoomPlan (iOS 17+) |
| `apps/web` | **B** | 3D 뷰어·에디터, 자유 모드, 마켓 패널 | React + Vite + TS, React Three Fiber |
| `apps/web/src/social` | **C** | 포스트잇 레이어, 게스트 화면 | React Three Fiber, socket.io-client |
| `services/realtime` | **C** | 동시 방문·포스트잇 실시간 동기화 | Node 20 + TS, Socket.io |
| `services/engine` | **D** | AI 배치·규격 필터·마켓 추천 엔진 | Python 3.11, FastAPI, Shapely |
| `services/api` | **E** | REST API, 인증, DB, 스토리지 | Node 20 + Express + TS, Prisma, PostgreSQL |
| `packages/schema` | **E** (머지 권한) | 공통 JSON 스키마 + 예시 데이터 | JSON Schema |
| `docs` | 전원 | 기능 명세, API 계약, 규약 | Markdown |

담당자 이름은 [`docs/team.md`](docs/team.md). **자기 폴더만 수정한다.** 다른 파트가 필요하면 `packages/schema/fixtures`의 예시 데이터나 Mock 서버로 개발하고 기다리지 않는다.

## 처음 시작하기

```bash
git clone https://github.com/cksdyd3786/Zipchak.git
cd Zipchak

# 1) 자기 파트 폴더의 README.md와 CLAUDE.md를 먼저 읽는다
# 2) 브랜치를 만든다 (기능 ID 단위)
git switch -c feat/B-M4-1

# 3) Claude에게 일을 시킬 때는 기능 ID + 완료 기준 + 스키마를 함께 준다
#    예) "docs/features.md의 M4-1을 구현해줘. 입력은 packages/schema/room.schema.json"
```

공통 스키마 검증 (Node 20+):

```bash
cd packages/schema && npm install && npm run validate
```

## 협업 규칙 요약

- **한 이슈 = 한 기능 ID = 한 PR.** 브랜치 이름은 `feat/<담당코드>-<기능ID>` (예: `feat/D-M2-2`).
- `main`(배포) ← `dev`(통합) ← `feat/*`. PR은 항상 `dev`로 보낸다. 스택 PR은 쓰지 않고, 다음 브랜치는 앞 PR을 머지한 뒤 `dev`에서 새로 딴다.
- **코드 PR(`apps/*`, `services/*`)은 CI가 통과하면 작성자가 직접 Squash and merge 한다.** 승인은 필요 없고 자동 머지(auto-merge)는 쓰지 않는다. PR은 작게 만들어 그날 머지한다.
- `docs/`·루트 `README.md`·`CLAUDE.md`·`packages/schema/`·`.github/`를 건드린 공통 PR은 CI 통과 + **E(@cksdyd3786) 승인**이 필요하고, 승인 후에는 누구든 머지한다.
- 리뷰는 선택이다. 봐 줬으면 하는 사람에게 작성자가 직접 요청한다 (자동 지정은 공통 경로만). 머지 전 "Claude가 만든 코드를 직접 읽었고 설명할 수 있다" 체크는 꼭 한다.
- **매주 금요일 30분 통합 시연:** 최신 `dev`로 fixture 스캔 → 배치 → 방문 흐름을 돌려 녹화하고, 깨진 곳은 이슈로 남긴다.
- **`dev` CI가 빨간불이면 모두 머지를 멈추고**, 깨뜨린 PR 작성자가 먼저 고친다.
- 스키마 변경은 `schema-change` 이슈로 먼저 합의한다. 필드 추가는 minor, 삭제·이름 변경은 전원 합의. `dev` → `main`은 통합 데모 날 E만 반영한다.
- 통합 데모는 **2주차·4주차·6주차 금요일**.
- 자세한 내용: [`docs/workflow.md`](docs/workflow.md), 좌표·단위 규약: [`docs/conventions.md`](docs/conventions.md)

## 문서

- [`docs/features.md`](docs/features.md) — 기능 ID별 우선순위·담당·완료 기준
- [`docs/api.md`](docs/api.md) — REST·Socket.io 계약
- [`docs/conventions.md`](docs/conventions.md) — 좌표·단위·ID 규약
- [`docs/milestones.md`](docs/milestones.md) — 6주 일정
- [`docs/workflow.md`](docs/workflow.md) — 브랜치·PR·Claude 사용 규칙
- 원본 기획서: 개발 계획서(PRD & Architecture Spec) v1.1
