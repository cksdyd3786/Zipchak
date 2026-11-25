import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { FIXTURES_DIR, readJsonFile } from "../src/paths.js";
import { validate, validateBody } from "../src/schema.js";
import { startServer, type TestServer } from "./helpers.js";

const roomSample = readJsonFile(join(FIXTURES_DIR, "room.sample.json")) as Record<string, unknown>;

let server: TestServer;

beforeAll(async () => {
  const app = createApp({
    config: loadConfig({}),
    extraRoutes: (app) => {
      // 테스트용 임시 라우트
      app.post("/__test/room", validateBody("room"), (_req, res) => {
        res.json({ ok: true });
      });
      app.get("/__test/boom", () => {
        throw new Error("비밀 내부 정보");
      });
    },
  });
  server = await startServer(app);
});

afterAll(() => server.close());

const post = (path: string, body: string) =>
  fetch(server.url + path, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("뼈대", () => {
  it("GET /health → 200 { ok: true }", async () => {
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("없는 경로 → 404 NOT_FOUND 공통 포맷", async () => {
    const res = await fetch(`${server.url}/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String), details: { method: "GET", path: "/nope" } },
    });
  });

  it("예상 못 한 에러 → 500 INTERNAL, 내부 메시지는 숨긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await fetch(`${server.url}/__test/boom`);
    spy.mockRestore();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.details).toEqual({});
    expect(JSON.stringify(body)).not.toContain("비밀");
  });

  it("CORS: CORS_ORIGIN(기본 :5173)만 허용", async () => {
    const ok = await fetch(`${server.url}/health`, { headers: { origin: "http://localhost:5173" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const other = await fetch(`${server.url}/health`, { headers: { origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("본문 검증 (validateBody)", () => {
  it("올바른 RoomData → 통과", async () => {
    const res = await post("/__test/room", JSON.stringify(roomSample));
    expect(res.status).toBe(200);
  });

  it("잘못된 RoomData → 400 VALIDATION_FAILED, details.errors 에 ajv 경로", async () => {
    const bad = structuredClone(roomSample) as Record<string, any>;
    delete bad.walls;
    bad.floorPolygon[0].x = 1.5; // mm 정수 위반
    const res = await post("/__test/room", JSON.stringify(bad));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.schema).toBe("RoomData");
    const paths = body.error.details.errors.map((e: { path: string }) => e.path);
    expect(paths).toContain("/floorPolygon/0/x");
    expect(paths).toContain("/"); // required: walls
  });

  it("JSON 이 아닌 본문 → 400 VALIDATION_FAILED", async () => {
    const res = await post("/__test/room", "{ not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
  });
});

describe("validate()", () => {
  it("세 스키마 모두 fixture 를 통과시킨다", () => {
    expect(validate("room", roomSample)).toEqual({ valid: true });
    expect(validate("furniture-layout", readJsonFile(join(FIXTURES_DIR, "layout.sample.json")))).toEqual({ valid: true });
    const items = readJsonFile(join(FIXTURES_DIR, "catalog.sample.json")) as unknown[];
    for (const item of items) expect(validate("market-furniture-item", item)).toEqual({ valid: true });
  });

  it("틀리면 경로와 메시지를 돌려준다", () => {
    const result = validate("market-furniture-item", { itemId: "x" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("loadConfig", () => {
  it("기본값", () => {
    expect(loadConfig({})).toEqual({
      port: 4000,
      corsOrigins: ["http://localhost:5173"],
      engineUrl: "http://localhost:8000",
    });
  });

  it("환경변수 반영 + 잘못된 값은 시작 시 에러", () => {
    expect(loadConfig({ PORT: "5000", CORS_ORIGIN: "http://a.test, http://b.test", ENGINE_URL: "http://e.test/" })).toEqual({
      port: 5000,
      corsOrigins: ["http://a.test", "http://b.test"],
      engineUrl: "http://e.test",
    });
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ ENGINE_URL: "not a url" })).toThrow(/ENGINE_URL/);
  });
});
