// M0-2 방·배치안 저장/불러오기 (docs/openapi.yaml rooms·layouts)
//   POST /rooms · GET /rooms · GET /rooms/:roomId
//   GET·POST /rooms/:roomId/layouts · GET·PUT /layouts/:layoutId
//
// - 모든 경로는 Bearer 토큰이 필요하다 (auth.ts, #12 전 임시 인증). 초대 토큰(X-Invite-Token)은 M5-1 에서 붙인다.
// - 남의 방·배치안은 조회 시 404 (있는지도 알리지 않는다). PUT 만 openapi 대로 403.
// - roomId·ownerId·layoutId·version·시간은 서버가 채우고, 채운 결과 전체를 packages/schema 로 검증한 뒤 저장한다.
import { Router, type RequestHandler } from "express";
import { currentUser, requireUser } from "../auth.js";
import { AppError } from "../errors.js";
import { newId, nowIso } from "../ids.js";
import { validate } from "../schema.js";
import type { Store } from "../store.js";
import type { FurnitureLayout, RoomData } from "../types.js";

/** 클라이언트가 보내도 서버 값으로 덮어쓰는 필드 */
const ROOM_SERVER_FIELDS = ["roomId", "ownerId", "createdAt", "updatedAt"] as const;
const LAYOUT_SERVER_FIELDS = ["layoutId", "roomId", "version", "createdAt", "updatedAt"] as const;

export function roomsRouter(store: Store): Router {
  const router = Router();
  router.post(
    "/rooms",
    requireUser,
    handle(async (req, res) => {
      const user = currentUser(res);
      const body = objectBody(req.body);
      const now = nowIso();
      const room = {
        ...omit(body, ROOM_SERVER_FIELDS),
        roomId: newId("room"),
        ownerId: user.userId,
        createdAt: now,
        updatedAt: now,
      };
      checkSchema("room", room);
      checkClosed((room as RoomData).floorPolygon);
      res.status(201).json(await store.createRoom(room as RoomData));
    }),
  );

  router.get(
    "/rooms",
    requireUser,
    handle(async (_req, res) => {
      const user = currentUser(res);
      const rooms = await store.listRoomsByOwner(user.userId);
      const summaries = await Promise.all(
        rooms.map(async (r) => ({
          roomId: r.roomId,
          name: r.name,
          source: r.source,
          layoutCount: (await store.listLayoutsByRoom(r.roomId)).length,
          updatedAt: r.updatedAt,
        })),
      );
      res.json(summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }),
  );

  router.get(
    "/rooms/:roomId",
    requireUser,
    handle(async (req, res) => {
      res.json(await ownRoom(store, req.params.roomId, currentUser(res).userId));
    }),
  );

  router.get(
    "/rooms/:roomId/layouts",
    requireUser,
    handle(async (req, res) => {
      const room = await ownRoom(store, req.params.roomId, currentUser(res).userId);
      const layouts = await store.listLayoutsByRoom(room.roomId);
      res.json(layouts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt)));
    }),
  );

  router.post(
    "/rooms/:roomId/layouts",
    requireUser,
    handle(async (req, res) => {
      const user = currentUser(res);
      const room = await ownRoom(store, req.params.roomId, user.userId);
      const body = objectBody(req.body);
      const now = nowIso();
      const layout = {
        createdBy: { type: "user", id: user.userId, displayName: user.displayName },
        parentLayoutId: null,
        analysis: null,
        postits: [],
        ...omit(body, LAYOUT_SERVER_FIELDS),
        layoutId: newId("lay"),
        roomId: room.roomId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      checkSchema("furniture-layout", layout);
      res.status(201).json(await store.createLayout(layout as unknown as FurnitureLayout));
    }),
  );

  router.get(
    "/layouts/:layoutId",
    requireUser,
    handle(async (req, res) => {
      const layout = await store.getLayout(req.params.layoutId);
      if (!layout) throw layoutNotFound(req.params.layoutId);
      await ownRoom(store, layout.roomId, currentUser(res).userId, () => layoutNotFound(req.params.layoutId));
      res.json(layout);
    }),
  );

  router.put(
    "/layouts/:layoutId",
    requireUser,
    handle(async (req, res) => {
      const { layoutId } = req.params;
      const current = await store.getLayout(layoutId);
      if (!current) throw layoutNotFound(layoutId);
      const room = await store.getRoom(current.roomId);
      if (!room || room.ownerId !== currentUser(res).userId) {
        throw new AppError("FORBIDDEN", 403, "배치안 주인만 수정할 수 있습니다", { layoutId });
      }

      checkSchema("furniture-layout", req.body);
      const body = req.body as FurnitureLayout;
      const mismatch = [
        body.layoutId !== layoutId && { path: "/layoutId", message: `경로의 layoutId(${layoutId})와 달라요` },
        body.roomId !== current.roomId && { path: "/roomId", message: `배치안의 roomId(${current.roomId})와 달라요` },
      ].filter(Boolean);
      if (mismatch.length) throw new AppError("VALIDATION_FAILED", 400, "배치안을 바꿀 수 없는 필드가 있습니다", { errors: mismatch });

      if (body.version !== current.version) throw conflict(current.version);
      const next: FurnitureLayout = {
        ...body,
        version: current.version + 1,
        // 포스트잇은 POST /layouts/:id/postits(M5-2)로만 바뀐다 — 주인이 옛 화면에서 저장해도 손님 포스트잇이 지워지지 않게
        postits: current.postits,
        createdAt: current.createdAt,
        updatedAt: nowIso(),
      };
      const result = await store.updateLayout(next, current.version);
      if ("conflict" in result) throw conflict(result.conflict);
      res.json(result.layout);
    }),
  );

  return router;
}

/**
 * 바닥 윤곽이 넓이가 있는 단순 다각형인지 (엔진 room.py: shapely is_valid && area > 0 과 같은 판정).
 * 넓이 0(일직선)이거나 변끼리 꼬이면 400 ROOM_NOT_CLOSED.
 */
export function checkClosed(polygon: { x: number; z: number }[]): void {
  const fail = (reason: string) => new AppError("ROOM_NOT_CLOSED", 400, "바닥 윤곽이 닫히지 않았습니다", { reason });
  const n = polygon.length;
  let twiceArea = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    twiceArea += a.x * b.z - b.x * a.z;
  }
  if (twiceArea === 0) throw fail("넓이가 0");

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsTouch(polygon[i], polygon[(i + 1) % n], polygon[j], polygon[(j + 1) % n])) {
        throw fail(`변 ${i}와 변 ${j}가 만남`);
      }
    }
  }
}

type P = { x: number; z: number };

function segmentsTouch(p1: P, p2: P, q1: P, q2: P): boolean {
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const onSegment = (o: P, a: P, b: P) =>
    Math.min(o.x, a.x) <= b.x && b.x <= Math.max(o.x, a.x) && Math.min(o.z, a.z) <= b.z && b.z <= Math.max(o.z, a.z);
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && onSegment(q1, q2, p1)) ||
    (d2 === 0 && onSegment(q1, q2, p2)) ||
    (d3 === 0 && onSegment(p1, p2, q1)) ||
    (d4 === 0 && onSegment(p1, p2, q2))
  );
}

async function ownRoom(store: Store, roomId: string, userId: string, notFound?: () => AppError): Promise<RoomData> {
  const room = await store.getRoom(roomId);
  if (!room || room.ownerId !== userId) throw notFound ? notFound() : new AppError("NOT_FOUND", 404, "방을 찾을 수 없습니다", { roomId });
  return room;
}

function layoutNotFound(layoutId: string): AppError {
  return new AppError("NOT_FOUND", 404, "배치안을 찾을 수 없습니다", { layoutId });
}

function conflict(serverVersion: number): AppError {
  return new AppError("VERSION_CONFLICT", 409, "다른 곳에서 먼저 저장했습니다", { serverVersion });
}

function checkSchema(name: "room" | "furniture-layout", data: unknown): void {
  const result = validate(name, data);
  if (!result.valid) {
    const title = name === "room" ? "RoomData" : "FurnitureLayout";
    throw new AppError("VALIDATION_FAILED", 400, `본문이 ${title} 스키마에 맞지 않습니다`, { schema: title, errors: result.errors });
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError("VALIDATION_FAILED", 400, "본문은 JSON 객체여야 합니다", { errors: [{ path: "/", message: "객체여야 합니다" }] });
  }
  return body as Record<string, unknown>;
}

function omit(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

/** Express 4 는 async 핸들러의 reject 를 잡지 않는다 → next(err) 로 넘긴다. */
function handle(fn: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
