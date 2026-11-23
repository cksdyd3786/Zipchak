# 협업·바이브 코딩 규칙

## 브랜치

```
main  ← 배포 (6주차 금요일 이후 동결)
 └ dev  ← 통합 (PR은 여기로)
    └ feat/<담당코드>-<기능ID>   예: feat/D-M2-2, feat/B-M4-1
    └ fix/<담당코드>-<짧은설명>   예: fix/C-socket-reconnect
```

- `main`, `dev`는 직접 push 금지 (저장소 설정 → Rules → Rulesets).
- PR은 항상 `dev`로 보낸다. 머지 조건은 아래 "머지 규칙"을 따른다.

## 머지 규칙

| PR 종류 | 머지 조건 | 누가 머지 |
| --- | --- | --- |
| **코드 PR** (`apps/*`, `services/*`, 각 파트 폴더의 `CLAUDE.md`·`README.md`) | **CI 통과만** (승인 필요 없음) | **작성자가 직접** Squash and merge |
| **공통 PR** (`/docs/`, `/README.md`, `/CLAUDE.md`, `/packages/schema/`, `/.github/` 중 하나라도 건드림) | CI 통과 + **@cksdyd3786 승인** | 승인 후 누구든. E 본인 PR은 E가 `--admin`으로 머지 |
| **`dev` → `main`** | 통합 데모 날(2·4·6주차 금요일) | E만 |

```bash
git fetch origin && git switch -c feat/D-M2-3 origin/dev   # 항상 dev에서 새로 딴다
gh pr create --base dev --fill
# CI 초록 확인 후 (코드 PR)
gh pr merge --squash
```

- **자동 머지(auto-merge)는 쓰지 않는다** (저장소 설정에서 꺼 둠). CI가 초록이 되면 작성자가 직접 누른다.
- **PR은 작게, 그날 머지한다.** 하루 안에 끝나지 않으면 기능을 더 잘게 나눈다.
- **스택 PR은 쓰지 않는다.** base는 항상 `dev`다. 앞 기능이 필요하면 그 PR을 먼저 머지하고, 다음 브랜치를 최신 `dev`에서 새로 딴다.
- 머지 전에 PR 템플릿의 **"Claude가 만든 코드를 직접 읽었고 설명할 수 있다"** 체크박스를 확인한다. 승인은 없어도 이 체크는 생략하지 않는다 (발표 질의응답 대비).
- **`dev` CI가 빨간불이면 모두 머지를 멈춘다.** 깨뜨린 PR의 작성자가 먼저 고치고(되돌리기 PR도 가능), 초록불이 된 뒤 머지를 재개한다.
- 공통 경로 목록은 [`.github/CODEOWNERS`](../.github/CODEOWNERS)에 있다. 코드와 공통 파일을 한 PR에 섞으면 PR 전체가 승인 대기가 되므로 나눠 올린다.
- **스키마 변경**(`packages/schema/*.schema.json`)은 PR 전에 `schema-change` 이슈를 먼저 열어 합의한다.
- `dev`로 가는 PR은 **스쿼시만** 허용한다. 머지 후 브랜치는 자동 삭제된다. (`dev` → `main`만 merge commit을 써서 두 브랜치 이력이 갈라지지 않게 한다.)
- CI가 실패하면 머지 버튼이 켜지지 않는다. 고쳐서 같은 브랜치에 push하면 CI가 다시 돈다.

## 리뷰 (선택)

- 리뷰는 **선택**이다. 봐 줬으면 하는 사람이 있으면 작성자가 PR에서 직접 리뷰를 요청한다. 맞물린 파트(웹 ↔ 소셜, 엔진 → 웹)를 바꿨거나 B·C가 함께 쓰는 파일(`apps/web/src/scene/RoomScene.tsx`, `src/hooks/`)을 건드렸다면 상대 파트에 요청하기를 권한다.
- **자동 리뷰어 지정은 공통 경로에만 한다** (`.github/reviewers.json`). 스키마·API 계약·공통 문서를 바꾸면 E가 지정되고, 스키마·API 계약은 그걸 쓰는 파트도 함께 지정된다. 코드 경로에는 아무도 자동 지정되지 않는다. 규칙을 바꾸면 `node --test .github/scripts/pick-reviewers.test.js`를 돌린다.
- 리뷰를 요청받았다면 보는 것은 3가지다.
  1. **완료 기준**(`docs/features.md`)을 만족하는가
  2. **내 파트와 맞물리는 부분**(props·API·스키마)이 바뀌었는가
  3. **작성자가 코드를 설명할 수 있는가** (Claude가 쓴 코드도 마찬가지)
- 코드 PR은 리뷰를 기다리지 않고 머지해도 된다. 머지 후에 나온 지적은 다음 PR이나 이슈로 반영한다.

## 금요일 통합 시연 (매주 30분)

매주 금요일, 다 같이 최신 `dev`를 받아 전체 흐름을 한 번 돌려 본다. 승인 리뷰를 줄인 대신 여기서 통합 문제를 잡는다.

1. 모두 `git fetch origin && git switch dev && git pull`
2. fixture(`packages/schema/fixtures/`)로 **스캔(RoomData 로드) → 배치(엔진 `/v1/layouts:recommend`·`:validate`) → 방문(친구 방 입장·포스트잇)** 흐름을 차례로 돌린다.
3. 화면을 **녹화**해 둔다 (발표 자료·회귀 비교용).
4. 깨진 곳은 그 자리에서 **이슈**로 남긴다 (`bug` + 해당 `part:*` 라벨, 재현 단계와 녹화 시각).
5. 2·4·6주차 금요일은 시연이 끝난 뒤 E가 `dev` → `main`을 반영한다.

## 이슈

- 기능 ID 하나 = 이슈 하나. `scripts/create-issues.sh`로 전체 기능 이슈를 한 번에 만든다.
- 라벨: `part:A`~`part:E`, `Must`/`Should`/`Could`, `schema-change`, `api-change`, `bug`.
- 이슈에 자기 이름을 Assignee로 걸고 시작한다.

## 커밋

`feat(M2-2): 문 회전 반경 충돌 검사` · `fix(M5-2): 가구 삭제 시 포스트잇 바닥 전환` · `docs: api.md 이벤트 추가`

## Claude로 작업할 때

1. **세션 시작:** "루트 CLAUDE.md와 `<내 폴더>/CLAUDE.md`를 읽고 시작해줘."
2. **요청은 기능 ID + 완료 기준 + 입력 스키마**로 준다.
   > M3-4를 구현해줘. 완료 기준은 docs/features.md에 있어. 입력은 packages/schema/room.schema.json과 market-furniture-item.schema.json이야. 테스트부터 써줘.
3. **기하·좌표 로직은 테스트 먼저.** Claude가 쓴 테스트의 숫자(mm)는 사람이 직접 검산한다.
4. **한 PR = 한 기능 ID.** Claude가 만든 코드도 작성자가 읽고 설명할 수 있어야 머지한다 (발표 질의응답 대비).
5. **Mock 우선.** 다른 파트 서버가 필요하면 fixture와 Mock 서버로 개발한다.
6. **비밀 정보 금지.** API 키·DB 비밀번호는 `.env`에만 두고 프롬프트에 붙여 넣지 않는다.
7. 스키마나 API 모양을 바꿔야 할 것 같으면 코드를 바꾸지 말고 이슈를 연다.

## 데일리

평일 10분 비동기 스탠드업 (어제 / 오늘 / 막힘). 막힘이 하루 넘게 가면 E가 범위를 줄인다.
