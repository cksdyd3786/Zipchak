// M2-1 엔진 프록시. 가짜 엔진(express)을 빈 포트에 띄워 진짜 HTTP 로 부른다.
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createEngineClient } from "../src/engine.js";
import { CATALOG_PATH, filterCatalog } from "../src/routes/catalog.js";
import { loadTemplates } from "../src/routes/templates.js";
import { FIXTURES_DIR, readJsonFile } from "../src/paths.js";
import { validate } from "../src/schema.js";
import type { MarketFurnitureItem } from "../src/types.js";
import { startServer, type TestServer } from "./helpers.js";

const layoutSample = readJsonFile(join(FIXTURES_DIR, "layout.sample.json")) as Record<string, unknown>;
const catalog = readJsonFile(CATALOG_PATH) as MarketFurnitureItem[];
const template = loadTemplates()[0];

// services/engine/app/preferences.py question_list() 와 같은 모양
const engineQuestions = {
  deskHours: { label: "하루에 책상에 앉아 있는 시간은?", options: { lt1: "1시간 미만", "1to4": "1~4시간", gt4: "4시간 이상" } },
  guests: { label: "손님이 자주 오나요?", options: { rarely: "거의 안 와요", often: "자주 와요" } },
  sleepSensitivity: { label: "잠귀가 밝은 편인가요?", options: { yes: "네", no: "아니요" } },
  stuff: { label: "짐이 많은 편인가요?", options: { few: "적어요", many: "많아요" } },
  monitors: { label: "모니터를 몇 대 쓰나요?", options: { "0": "없음", "1": "1대", "2": "2대 이상" } },
};

// 가짜 엔진의 동작을 테스트마다 바꾼다
let mode: "ok" | "reject" | "bad-layout" | "slow" | "two-questions" = "ok";
let lastBody: Record<string, unknown> | undefined;

let engine: TestServer;
let api: TestServer;
let slowApi: TestServer;
let deadApi: TestServer;

beforeAll(async () => {
  const fake = express();
  fake.use(express.json({ limit: "5mb" }));
  fake.get("/v1/questions", (_req, res) => {
    if (mode === "two-questions") {
      const { deskHours, guests } = engineQuestions;
      return void res.json({ deskHours, guests });
    }
    res.json(engineQuestions);
  });
  fake.post("/v1/layouts:recommend", async (req, res) => {
    lastBody = req.body;
    if (mode === "slow") await new Promise((r) => setTimeout(r, 300));
    if (mode === "reject") {
      return void res.status(400).json({ detail: { error: { code: "VALIDATION_FAILED", message: "'room'", details: {} } } });
    }
    const layouts = [1, 2, 3, 4].map((n) => ({ ...layoutSample, layoutId: `lay_01HX00000000000000000000${n}0`, title: `배치안 ${n}` }));
    if (mode === "bad-layout") layouts[1] = { ...layouts[1], placements: "망가짐" } as never;
    res.json({ layouts, partial: false });
  });
  engine = await startServer(fake);

  const config = loadConfig({ ENGINE_URL: engine.url });
  api = await startServer(createApp({ config }));
  slowApi = await startServer(createApp({ config, engine: createEngineClient(engine.url, 100) }));
  // 포트 1 은 열려 있지 않다 → 연결 거부
  deadApi = await startServer(createApp({ config: loadConfig({ ENGINE_URL: "http://127.0.0.1:1" }) }));
});

afterAll(async () => {
  await Promise.all([api, slowApi, deadApi, engine].map((s) => s?.close()));
});

beforeEach(() => {
  mode = "ok";
  lastBody = undefined;
});

const recommend = async (body: unknown, server: TestServer = api, roomId: string = template.roomId) => {
  const res = await fetch(`${server.url}/rooms/${roomId}/recommend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe("GET /questions (M2-1)", () => {
  it("엔진 질문을 openapi QuestionList 모양으로 바꿔 준다", async () => {
    const res = await fetch(`${api.url}/questions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(5);
    expect(body.questions[0]).toEqual({
      id: "deskHours",
      text: "하루에 책상에 앉아 있는 시간은?",
      options: [
        { id: "lt1", label: "1시간 미만" },
        { id: "1to4", label: "1~4시간" },
        { id: "gt4", label: "4시간 이상" },
      ],
    });
  });

  it("질문이 3개 미만이면 502 ENGINE_UNAVAILABLE", async () => {
    mode = "two-questions";
    const res = await fetch(`${api.url}/questions`);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("ENGINE_UNAVAILABLE");
  });

  it("엔진이 꺼져 있으면 502 ENGINE_UNAVAILABLE", async () => {
    const res = await fetch(`${deadApi.url}/questions`);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatchObject({ code: "ENGINE_UNAVAILABLE", details: { path: "/v1/questions" } });
  });
});

describe("POST /rooms/:roomId/recommend (M2-1)", () => {
  it("템플릿 방 + 답 → 엔진에 room·answers·available 카탈로그를 넘기고 배치안 최대 3개", async () => {
    const answers = { deskHours: "gt4", guests: "rarely" };
    const { status, body } = await recommend({ answers, budget: 500000 });
    expect(status).toBe(200);
    expect(body).toHaveLength(3);
    for (const layout of body) expect(validate("furniture-layout", layout)).toEqual({ valid: true });

    expect(lastBody?.room).toEqual(template);
    expect(lastBody?.answers).toEqual(answers);
    expect(lastBody?.budget).toBe(500000);
    expect(lastBody).not.toHaveProperty("weights");
    const sent = lastBody?.catalog as MarketFurnitureItem[];
    expect(sent.map((i) => i.itemId)).toEqual(filterCatalog(catalog, {}).map((i) => i.itemId));
  });

  it("weights 를 그대로 넘긴다 (M2-5)", async () => {
    const weights = { daylight: 2, circulation: 0 };
    expect((await recommend({ answers: {}, weights })).status).toBe(200);
    expect(lastBody?.weights).toEqual(weights);
  });

  it("없는 roomId → 404, 엔진은 부르지 않는다", async () => {
    const { status, body } = await recommend({ answers: {} }, api, "room_01HX0000000000000000000000");
    expect(status).toBe(404);
    expect(body.error).toMatchObject({ code: "NOT_FOUND", details: { roomId: "room_01HX0000000000000000000000" } });
    expect(lastBody).toBeUndefined();
  });

  it.each([
    ["answers 없음", {}, "/answers"],
    ["answers 값이 숫자", { answers: { deskHours: 3 } }, "/answers/deskHours"],
    ["모르는 weights 키", { answers: {}, weights: { vibes: 1 } }, "/weights/vibes"],
    ["음수 weights", { answers: {}, weights: { daylight: -1 } }, "/weights/daylight"],
    ["음수 budget", { answers: {}, budget: -1 }, "/budget"],
    ["소수 budget", { answers: {}, budget: 10.5 }, "/budget"],
    ["모르는 필드", { answers: {}, room: {} }, "/room"],
  ])("%s → 400 VALIDATION_FAILED", async (_name, req, path) => {
    const { status, body } = await recommend(req);
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.errors.map((e: { path: string }) => e.path)).toContain(path);
    expect(lastBody).toBeUndefined();
  });

  it("budget: null 은 받는다", async () => {
    expect((await recommend({ answers: {}, budget: null })).status).toBe(200);
    expect(lastBody?.budget).toBeNull();
  });

  it("엔진이 400 으로 거절하면 400 VALIDATION_FAILED, 엔진 메시지 전달", async () => {
    mode = "reject";
    const { status, body } = await recommend({ answers: {} });
    expect(status).toBe(400);
    expect(body.error).toMatchObject({ code: "VALIDATION_FAILED", message: "'room'", details: { engineStatus: 400 } });
  });

  it("엔진 배치안이 스키마에 안 맞으면 502", async () => {
    mode = "bad-layout";
    const { status, body } = await recommend({ answers: {} });
    expect(status).toBe(502);
    expect(body.error.code).toBe("ENGINE_UNAVAILABLE");
  });

  it("엔진이 시간 안에 답하지 않으면 502", async () => {
    mode = "slow";
    const { status, body } = await recommend({ answers: {} }, slowApi);
    expect(status).toBe(502);
    expect(body.error.code).toBe("ENGINE_UNAVAILABLE");
    expect(body.error.message).toMatch(/100ms/);
  });

  it("엔진이 꺼져 있으면 502", async () => {
    const { status, body } = await recommend({ answers: {} }, deadApi);
    expect(status).toBe(502);
    expect(body.error).toMatchObject({ code: "ENGINE_UNAVAILABLE", details: { path: "/v1/layouts:recommend" } });
  });
});
