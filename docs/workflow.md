# 협업·바이브 코딩 규칙

## 브랜치

```
main  ← 배포 (6주차 금요일 이후 동결)
 └ dev  ← 통합 (PR은 여기로)
    └ feat/<담당코드>-<기능ID>   예: feat/D-M2-2, feat/B-M4-1
    └ fix/<담당코드>-<짧은설명>   예: fix/C-socket-reconnect
```

- `main`, `dev`는 직접 push 금지 (저장소 설정 → Branches → Branch protection).
- PR은 **다른 파트 1명** 리뷰 후 머지. `packages/schema`를 건드린 PR은 E가 리뷰·머지.

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
