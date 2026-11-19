# CLAUDE.md — apps/web (담당 B: 3D 웹 뷰어·에디터 / social 하위는 C)

루트 `CLAUDE.md`의 규칙을 먼저 따른다.

## 소유 범위

- `apps/web/src/**` → **B**
- `apps/web/src/social/**` → **C** (포스트잇 레이어, 게스트 화면, 소켓 클라이언트). B는 이 폴더를 수정하지 않고, C는 그 밖을 수정하지 않는다.
- 두 사람이 만나는 지점은 `src/scene/RoomScene.tsx`의 props와 `src/hooks/useFurniturePick.ts`뿐이다. 바꿀 때는 서로 PR 리뷰.

## 스택

React 18 + Vite + TypeScript, @react-three/fiber, @react-three/drei, Zustand, TailwindCSS. 타입은 `packages/schema`에서 생성한 것을 쓴다(직접 정의하지 않는다).

## 담당 기능 (B)

| ID | 기능 | 우선순위 |
| --- | --- | --- |
| M1-2 | 자유 모드: 치수 입력 (직사각형 + 문·창문, 창문 방향) | Must |
| M1-3 | 자유 모드: 원룸 템플릿 3종 선택 UI | Must |
| M1-4 | 자유 모드: 꼭짓점 드래그 다각형 편집 | Should |
| M1-5 | 자유 모드: 평면도 이미지 배경 따라 그리기 | Could |
| M2-1 | 취향 질문 화면 (엔진은 D) | Must |
| M2-5 | 가중치 슬라이더 UI (엔진은 D) | Should |
| M3-5 | 추천 상품 3D 배치 + 구매 링크 (`purchase_click` 이벤트) | Must |
| M3-6 | 예산 필터·합계 금액 | Should |
| M4-1 | `RoomData` → 3D 렌더 (30fps: iPhone Safari·Android Chrome·PC) | Must |
| M4-2 | 가구 드래그 이동·90° 회전·충돌 시 빨간색, 옮기면 점수 재계산 | Must |
| M4-3 | 쿼터뷰/탑뷰 전환, 문 회전 반경 부채꼴 | Must |
| M4-5 | 채광 시뮬레이션 (창문 `facing` 있을 때만) | Could |

## 담당 기능 (C, `src/social/`)

M2-6 공유 카드, M4-4 카메라 둘러보기, M5-1 초대·게스트 화면, M5-2 포스트잇(방명록·제안), M5-4 동시 방문 → `services/realtime/CLAUDE.md` 참고.

## 렌더 규칙

- 스키마 값은 mm → Three.js에는 `/ 1000` (m). 변환은 `src/lib/units.ts` 한 곳에서만.
- 가구 기준점은 바닥면 중심, 회전 0도에서 정면 +Z.
- `.glb` 로딩 실패 → 규격 크기의 반투명 박스로 대체.
- 저사양(fps < 20 지속) → 그림자 끄고 DPR 1.
- WebGL 미지원 → 2D 탑뷰(SVG) 폴백.
- 충돌 판정은 박스 단위(AABB, 회전 90° 단위라 충분).

## 개발 순서

서버 없이 시작한다: `packages/schema/fixtures/room.sample.json`과 `layout.sample.json`을 바로 import해서 렌더부터 만든다. API는 E의 Mock 서버(`docs/api.md`)로 붙인다.
