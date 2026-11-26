// M0-2 방·배치안 저장/불러오기. 메모리 저장소 + 임시 Bearer 인증(#12 전).
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { userFromToken } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { FIXTURES_DIR, readJsonFile } from "../src/paths.js";
import { validate } from "../src/schema.js";
import { MemoryStore } from "../src/store.js";
import { startServer, type TestServer } from "./helpers.js";

type Json = Record<string, unknown>;

const roomSample = readJsonFile(join(FIXTURES_DIR, "room.sample.json")) as Json;
const layoutSample = readJsonFile(join(FIXTURES_DIR, "layout.sample.json")) as Json;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** iOS toCreatePayload() 와 같은 모양: roomId·ownerId·createdAt·updatedAt 을 뺀다 */
const { roomId: _r, ownerId: _o, createdAt: _c, updatedAt: _u, ...roomCreate } = roomSample;
/** openapi LayoutCreate: layoutId·roomId·version·createdAt·updatedAt 을 뺀다 */
const { layoutId: _l, roomId: _lr, version: _v, createdAt: _lc, updatedAt: _lu, ...layoutCreate } = layoutSample;

let server: TestServer;
beforeAll(async () => {
  server = await startServer(createApp({ config: loadConfig({}), store: new MemoryStore() }));
});
afterAll(() => server.close());

const call = async (method: string, path: string, token: string | null, body?: unknown) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(server.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

const createRoom = async (token = "alice", body: unknown = roomCreate) => call("POST", "/rooms", token, body);
const createLayout = async (roomId: string, token = "alice", body: unknown = layoutCreate) =>
  call("POST", `/rooms/${roomId}/layouts`, token, body);

describe("인증 (#12 전 임시)", () => {
  it.each([
    ["POST", "/rooms"],
    ["GET", "/rooms"],
    ["GET", "/rooms/room_x"],
    ["GET", "/rooms/room_x/layouts"],
    ["POST", "/rooms/room_x/layouts"],
    ["GET", "/layouts/lay_x"],
    ["PUT", "/layouts/lay_x"],
  ])("%s %s 토큰 없음 → 401 UNAUTHORIZED", async (method, path) => {
    const { status, body } = await call(method, path, null, method === "GET" ? undefined : {});
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("토큰 값으로 사용자를 정한다", () => {
    expect(userFromToken("alice").userId).toBe("user_alice");
    expect(userFromToken("user_01HX").userId).toBe("user_01HX");
    expect(userFromToken("a.very.long.jwt.token.value.that.is.not.simple").userId).toMatch(/^user_[0-9a-f]{16}$/);
  });
});

describe("POST /rooms", () => {
  it("roomId·ownerId·시간을 서버가 채워 201, RoomData 스키마 통과", async () => {
    const { status, body } = await createRoom("alice");
    expect(status).toBe(201);
    expect(validate("room", body)).toEqual({ valid: true });
    expect(body.roomId).toMatch(/^room_/);
    expect(body.roomId.slice(5)).toMatch(ULID);
    expect(body.ownerId).toBe("user_alice");
    expect(body.createdAt).toBe(body.updatedAt);
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect({ ...body, roomId: 0, ownerId: 0, createdAt: 0, updatedAt: 0 }).toEqual({
      ...roomCreate,
      roomId: 0,
      ownerId: 0,
      createdAt: 0,
      updatedAt: 0,
    });
  });

  it("클라이언트가 roomId·ownerId 를 보내도 서버 값으로 덮어쓴다", async () => {
    const { status, body } = await createRoom("alice", { ...roomCreate, roomId: "room_HACK", ownerId: "user_bob" });
    expect(status).toBe(201);
    expect(body.roomId).not.toBe("room_HACK");
    expect(body.ownerId).toBe("user_alice");
  });

  it("스키마 위반 → 400 VALIDATION_FAILED", async () => {
    const { status, body } = await createRoom("alice", { ...roomCreate, ceilingHeight: 100 });
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.errors.map((e: { path: string }) => e.path)).toContain("/ceilingHeight");
  });

  it("모르는 필드 → 400 (room.schema.json additionalProperties: false)", async () => {
    expect((await createRoom("alice", { ...roomCreate, hello: 1 })).status).toBe(400);
  });

  it.each([
    ["넓이 0 (일직선)", [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 2000, z: 0 }]],
    ["꼬인 윤곽 (나비 모양)", [{ x: 0, z: 0 }, { x: 3200, z: 4800 }, { x: 3200, z: 0 }, { x: 0, z: 4800 }]],
    [
      "한 점에서 만나는 윤곽",
      [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 1000, z: 1000 }, { x: 2000, z: 2000 }, { x: 0, z: 2000 }, { x: 1000, z: 1000 }],
    ],
  ])("%s → 400 ROOM_NOT_CLOSED", async (_name, floorPolygon) => {
    const { status, body } = await createRoom("alice", { ...roomCreate, floorPolygon });
    expect(status).toBe(400);
    expect(body.error.code).toBe("ROOM_NOT_CLOSED");
  });

  it("ㄱ자 방은 받는다", async () => {
    const floorPolygon = [
      { x: 0, z: 0 },
      { x: 3200, z: 0 },
      { x: 3200, z: 2400 },
      { x: 1600, z: 2400 },
      { x: 1600, z: 4800 },
      { x: 0, z: 4800 },
    ];
    expect((await createRoom("alice", { ...roomCreate, floorPolygon })).status).toBe(201);
  });

  it("본문이 객체가 아니면 400", async () => {
    expect((await createRoom("alice", [1, 2])).status).toBe(400);
  });
});

describe("GET /rooms, GET /rooms/:roomId", () => {
  it("내 방만, RoomSummary 모양으로 (최근 수정순)", async () => {
    const mine = (await createRoom("carol")).body;
    await createRoom("dave");
    const { status, body } = await call("GET", "/rooms", "carol");
    expect(status).toBe(200);
    expect(body).toEqual([{ roomId: mine.roomId, name: mine.name, source: mine.source, layoutCount: 0, updatedAt: mine.updatedAt }]);
  });

  it("내 방 → 200, 남의 방·없는 방 → 404", async () => {
    const room = (await createRoom("alice")).body;
    const own = await call("GET", `/rooms/${room.roomId}`, "alice");
    expect(own.status).toBe(200);
    expect(own.body).toEqual(room);

    const other = await call("GET", `/rooms/${room.roomId}`, "mallory");
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe("NOT_FOUND");
    expect((await call("GET", "/rooms/room_nope", "alice")).status).toBe(404);
  });
});

describe("배치안 POST·GET", () => {
  it("POST → 201, layoutId·roomId·version 1·시간을 서버가 채움, FurnitureLayout 스키마 통과", async () => {
    const room = (await createRoom("alice")).body;
    const { status, body } = await createLayout(room.roomId);
    expect(status).toBe(201);
    expect(validate("furniture-layout", body)).toEqual({ valid: true });
    expect(body.layoutId).toMatch(/^lay_/);
    expect(body.layoutId.slice(4)).toMatch(ULID);
    expect(body.layoutId).not.toBe(layoutSample.layoutId);
    expect(body.roomId).toBe(room.roomId);
    expect(body.version).toBe(1);
    expect(body.placements).toEqual(layoutSample.placements);
  });

  it("createdBy·postits·analysis 를 안 보내면 기본값 (주인, [], null)", async () => {
    const room = (await createRoom("alice")).body;
    const minimal = { schemaVersion: "1.0", kind: "user_saved", title: "내 배치", placements: [] };
    const { status, body } = await createLayout(room.roomId, "alice", minimal);
    expect(status).toBe(201);
    expect(body.createdBy).toEqual({ type: "user", id: "user_alice", displayName: "alice" });
    expect(body.postits).toEqual([]);
    expect(body.analysis).toBeNull();
    expect(validate("furniture-layout", body)).toEqual({ valid: true });
  });

  it("남의 방에 저장 → 404, 스키마 위반 → 400", async () => {
    const room = (await createRoom("alice")).body;
    expect((await createLayout(room.roomId, "mallory")).status).toBe(404);
    const bad = await createLayout(room.roomId, "alice", { ...layoutCreate, kind: "random" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("GET /rooms/:roomId/layouts 최신순, 방 목록 layoutCount 반영", async () => {
    const room = (await createRoom("erin")).body;
    const first = (await createLayout(room.roomId, "erin", { ...layoutCreate, title: "첫 번째" })).body;
    await new Promise((r) => setTimeout(r, 5));
    const second = (await createLayout(room.roomId, "erin", { ...layoutCreate, title: "두 번째" })).body;

    const { status, body } = await call("GET", `/rooms/${room.roomId}/layouts`, "erin");
    expect(status).toBe(200);
    expect(body.map((l: { layoutId: string }) => l.layoutId)).toEqual([second.layoutId, first.layoutId]);
    expect((await call("GET", "/rooms", "erin")).body[0].layoutCount).toBe(2);
    expect((await call("GET", `/rooms/${room.roomId}/layouts`, "mallory")).status).toBe(404);
  });

  it("GET /layouts/:layoutId 주인 200, 남·없음 404", async () => {
    const room = (await createRoom("alice")).body;
    const layout = (await createLayout(room.roomId)).body;
    const own = await call("GET", `/layouts/${layout.layoutId}`, "alice");
    expect(own.status).toBe(200);
    expect(own.body).toEqual(layout);
    expect((await call("GET", `/layouts/${layout.layoutId}`, "mallory")).status).toBe(404);
    expect((await call("GET", "/layouts/lay_nope", "alice")).status).toBe(404);
  });
});

describe("PUT /layouts/:layoutId (version 비교)", () => {
  const setup = async () => {
    const room = (await createRoom("alice")).body;
    const layout = (await createLayout(room.roomId)).body;
    return { room, layout };
  };

  it("같은 version → 200, version + 1, createdAt 유지·updatedAt 갱신", async () => {
    const { layout } = await setup();
    await new Promise((r) => setTimeout(r, 5));
    const { status, body } = await call("PUT", `/layouts/${layout.layoutId}`, "alice", { ...layout, title: "고친 배치" });
    expect(status).toBe(200);
    expect(body.version).toBe(2);
    expect(body.title).toBe("고친 배치");
    expect(body.createdAt).toBe(layout.createdAt);
    expect(body.updatedAt > layout.updatedAt).toBe(true);
    expect(validate("furniture-layout", body)).toEqual({ valid: true });
    expect((await call("GET", `/layouts/${layout.layoutId}`, "alice")).body).toEqual(body);
  });

  it("옛 version 으로 저장 → 409 VERSION_CONFLICT, details.serverVersion", async () => {
    const { layout } = await setup();
    expect((await call("PUT", `/layouts/${layout.layoutId}`, "alice", layout)).status).toBe(200);
    const { status, body } = await call("PUT", `/layouts/${layout.layoutId}`, "alice", { ...layout, title: "늦은 저장" });
    expect(status).toBe(409);
    expect(body.error).toMatchObject({ code: "VERSION_CONFLICT", details: { serverVersion: 2 } });
  });

  it("서버보다 높은 version 도 409 (openapi: 다르면 409)", async () => {
    const { layout } = await setup();
    expect((await call("PUT", `/layouts/${layout.layoutId}`, "alice", { ...layout, version: 5 })).status).toBe(409);
  });

  it("남의 배치안 → 403 FORBIDDEN, 없는 배치안 → 404", async () => {
    const { layout } = await setup();
    const { status, body } = await call("PUT", `/layouts/${layout.layoutId}`, "mallory", layout);
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect((await call("PUT", "/layouts/lay_nope", "alice", layout)).status).toBe(404);
  });

  it("layoutId·roomId 를 바꾸려 하면 400, 스키마 위반도 400", async () => {
    const { layout } = await setup();
    const path = `/layouts/${layout.layoutId}`;
    expect((await call("PUT", path, "alice", { ...layout, layoutId: "lay_other" })).status).toBe(400);
    expect((await call("PUT", path, "alice", { ...layout, roomId: "room_other" })).status).toBe(400);
    const bad = await call("PUT", path, "alice", { ...layout, placements: "망가짐" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    // 실패한 요청은 version 을 올리지 않는다
    expect((await call("GET", path, "alice")).body.version).toBe(1);
  });

  it("주인이 PUT 해도 서버의 포스트잇은 그대로 둔다", async () => {
    const { layout } = await setup();
    expect(layout.postits).toHaveLength(2); // layout.sample.json 의 포스트잇 2개
    const { status, body } = await call("PUT", `/layouts/${layout.layoutId}`, "alice", { ...layout, postits: [] });
    expect(status).toBe(200);
    expect(body.postits).toEqual(layout.postits);
  });
});
