# apps/web — 3D 웹 뷰어·에디터 (담당 B, social/는 C)

## 시작하기 (B가 1주차에 생성)

```bash
cd apps/web
npm create vite@latest . -- --template react-ts
npm install three @react-three/fiber @react-three/drei zustand socket.io-client
npm install -D tailwindcss @types/three
npm run dev
```

## 권장 폴더 구조

```
src/
  lib/units.ts            mm ↔ m 변환 (유일한 변환 지점)
  lib/api.ts              REST 클라이언트 (VITE_API_URL)
  scene/RoomScene.tsx     <RoomScene room layout />  ← B·C 공용 진입점
  scene/Walls.tsx, Openings.tsx, Furniture.tsx, DoorSwing.tsx
  editor/                 자유 모드 편집기 (치수 입력·템플릿·꼭짓점)
  recommend/              취향 질문 → 배치안 카드 3개 → 적용
  market/                 마켓 패널, 들어감 배지, 구매 링크
  hooks/useFurniturePick.ts
  store/                  Zustand
  social/                 ← C 소유 (PostitLayer, GuestPage, socket.ts)
```

## Claude 프롬프트 예시

> apps/web/CLAUDE.md를 따라 M4-1을 구현해줘. packages/schema/fixtures/room.sample.json을 읽어서 벽·문·창문·바닥을 R3F로 렌더하고, 단위 변환은 src/lib/units.ts에서만 해줘.
