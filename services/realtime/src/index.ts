// 집착 실시간 서버 진입점 (담당 C)
// 계약: docs/api.md 의 "Socket.io 이벤트" 표. 영속 저장은 API(E)의 /internal/* 로만 한다.
import { Server } from "socket.io";

const port = Number(process.env.REALTIME_PORT ?? 4100);
const io = new Server(port, { cors: { origin: "*" } });
const room = io.of("/room");

room.on("connection", (socket) => {
  // TODO(M5-1): token(JWT 또는 inviteToken) 검증 → layoutId 룸 입장
  socket.on(
    "room:join",
    async (
      { layoutId }: { layoutId: string; token: string },
      reply?: (result: { layoutId: string }) => void,
    ) => {
      await socket.join(layoutId);
      if (typeof reply === "function") {
        reply({ layoutId });
      }
    },
  );

  // TODO(M5-4): presence 10Hz 스로틀 후 같은 룸에 브로드캐스트
  // TODO(M5-2): postit:add → API 저장 → postit:added 브로드캐스트
});

console.log(`[realtime] listening on :${port}`);
