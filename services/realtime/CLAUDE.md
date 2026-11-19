# CLAUDE.md — services/realtime + apps/web/src/social (담당 C: 소셜·실시간)

루트 `CLAUDE.md`의 규칙을 먼저 따른다.

## 담당 기능

| ID | 기능 | 우선순위 | 완료 기준 |
| --- | --- | --- | --- |
| M5-1 | 초대 링크·QR (초대받은 사람만, 비로그인 게스트) | Must | 링크 열고 5초 내 방 로드 |
| M5-2 | 3D 포스트잇: 방명록 + 제안 포스트잇 | Must | 새로고침 후에도 위치 유지, 제안 포스트잇을 주인이 누르면 AI 검사 결과 표시 |
| M5-4 | 실시간 동시 방문 (아바타 위치·포스트잇 즉시 반영) | Must | 동시 5명, 지연 300ms 이하 |
| M2-6 | "내 방 유형" 공유 카드 | Should | 카드에서 초대 링크로 이동 |
| M4-4 | 카메라 둘러보기 (캐릭터 없이 카메라 이동) | Could | 드래그·패드 이동 |

## 핵심 원칙

- **게스트는 배치를 바꾸지 못한다.** 제안은 `postits[].type = "proposal"` 포스트잇으로만 남긴다 (AI 배치 신뢰 유지, 훈수 과다 방지).
- 제안 포스트잇을 **방 주인**이 누르면 `POST /layouts/:layoutId/postits/:postitId/preview` → 미리보기 배치 + `violations`·점수 표시 → [적용] 시 새 `version`으로 저장.
- **실시간 서버는 DB에 직접 쓰지 않는다.** 저장은 API(E)의 `/internal/*`로 하고 성공 후 브로드캐스트. 실시간 서버가 죽어도 REST만으로 기능이 동작해야 한다.

## 포스트잇 배치 (Raycast)

- 화면 탭 → Three.js Raycaster → 맞은 표면의 `point`(mm로 변환)와 `normal` 저장.
- 가구에 붙으면 `anchor.targetType = "furniture"`, `furnitureInstanceId` 기록, `point`는 그 가구 기준 로컬 좌표 → 가구가 움직이면 따라간다. 가구가 삭제되면 바닥 좌표로 전환.

## Socket.io 계약

`docs/api.md`의 이벤트 표가 원본이다. 네임스페이스 `/room`, 룸 = `layoutId`. `presence:update`는 최대 10Hz로 스로틀.

## 예외 처리

- 만료·회수 링크 → "초대가 만료됐어요" + 가입 CTA
- 소켓 끊김 → 자동 재연결 5회 후 REST로 최신 상태 재동기화
- 룸당 10명 초과 → 읽기 전용 입장
- 부적절한 포스트잇 → 주인 삭제 + 간단한 금칙어 필터
