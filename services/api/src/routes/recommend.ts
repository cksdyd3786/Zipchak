// M2-1 엔진 프록시 — GET /questions, POST /rooms/:roomId/recommend (docs/openapi.yaml)
//
// 지금 범위 (#13 방·배치안 저장 전):
// - 방은 템플릿(fixtures/templates)에서 roomId 로 찾는다. 저장된 방(POST /rooms)은 #13 이후 findRoom 을 바꿔 끼운다.
// - 추천 결과는 아직 저장하지 않고 돌려주기만 한다 (저장은 #13).
// - 엔진이 죽으면 502 ENGINE_UNAVAILABLE. "템플릿별 기본 배치안" 폴백은 기본 배치안 데이터가 생기면 붙인다.
import { Router, type RequestHandler } from "express";
import { unavailable, type EngineClient } from "../engine.js";
import { AppError } from "../errors.js";
import { formatIssues, validate } from "../schema.js";
import type { MarketFurnitureItem, RoomData } from "../types.js";
import { filterCatalog, loadCatalog } from "./catalog.js";
import { loadTemplates } from "./templates.js";

/** openapi components/schemas/Weights 의 키 (소프트 점수 6항목) */
export const WEIGHT_KEYS = ["circulation", "daylight", "monitorGlare", "openness", "storageAccess", "bedPlacement"] as const;

export interface QuestionList {
  questions: { id: string; text: string; options: { id: string; label: string }[] }[];
}

export interface RecommendBody {
  answers: Record<string, string>;
  weights?: Record<string, number>;
  budget?: number | null;
}

export type FindRoom = (roomId: string) => RoomData | undefined;

export interface RecommendRouterOptions {
  engine: EngineClient;
  findRoom?: FindRoom;
  catalog?: MarketFurnitureItem[];
}

export function recommendRouter({ engine, findRoom, catalog = loadCatalog() }: RecommendRouterOptions): Router {
  const lookup = findRoom ?? templateLookup(loadTemplates());
  const available = filterCatalog(catalog, {});
  const router = Router();

  router.get(
    "/questions",
    asyncHandler(async (_req, res) => {
      res.json(toQuestionList(await engine.get("/v1/questions")));
    }),
  );

  router.post(
    "/rooms/:roomId/recommend",
    asyncHandler(async (req, res) => {
      const body = parseRecommendBody(req.body);
      const room = lookup(req.params.roomId);
      if (!room) throw new AppError("NOT_FOUND", 404, "방을 찾을 수 없습니다", { roomId: req.params.roomId });

      const result = await engine.post("/v1/layouts:recommend", { room, ...body, catalog: available });
      res.json(checkLayouts(result));
    }),
  );
  return router;
}

export function templateLookup(templates: RoomData[]): FindRoom {
  const byId = new Map(templates.map((t) => [t.roomId, t]));
  return (roomId) => byId.get(roomId);
}

/**
 * 엔진 GET /v1/questions → openapi QuestionList.
 * 엔진은 { [qid]: { label, options: { [optionId]: label } } } 모양으로 준다.
 * 엔진이 이미 { questions: [...] } 로 주면 그대로 검사만 한다.
 */
export function toQuestionList(data: unknown): QuestionList {
  const path = "/v1/questions";
  const bad = (why: string) => unavailable(path, `엔진 질문 목록이 올바르지 않습니다: ${why}`);
  if (!isObject(data)) throw bad("객체가 아님");

  let questions: QuestionList["questions"];
  if (Array.isArray(data.questions)) {
    questions = data.questions as QuestionList["questions"];
  } else {
    questions = Object.entries(data).map(([id, q]) => {
      if (!isObject(q) || typeof q.label !== "string" || !isObject(q.options)) throw bad(`${id} 형식`);
      const options = Object.entries(q.options).map(([optionId, label]) => {
        if (typeof label !== "string") throw bad(`${id}.${optionId} 라벨`);
        return { id: optionId, label };
      });
      return { id, text: q.label, options };
    });
  }

  if (questions.length < 3 || questions.length > 5) throw bad(`질문 ${questions.length}개 (3~5개여야 함)`);
  for (const q of questions) {
    const ok =
      isObject(q) &&
      typeof q.id === "string" &&
      typeof q.text === "string" &&
      Array.isArray(q.options) &&
      q.options.length > 0 &&
      q.options.every((o) => isObject(o) && typeof o.id === "string" && typeof o.label === "string");
    if (!ok) throw bad(`${isObject(q) ? String(q.id) : "?"} 형식`);
  }
  return { questions };
}

/** openapi recommendLayouts requestBody. 틀린 곳을 모아 400 VALIDATION_FAILED. */
export function parseRecommendBody(body: unknown): RecommendBody {
  const errors: { path: string; message: string }[] = [];
  if (!isObject(body)) {
    throw new AppError("VALIDATION_FAILED", 400, "추천 요청 본문이 잘못되었습니다", {
      in: "body",
      errors: [{ path: "/", message: "객체여야 합니다" }],
    });
  }

  for (const key of Object.keys(body)) {
    if (!["answers", "weights", "budget"].includes(key)) errors.push({ path: `/${key}`, message: "모르는 필드입니다" });
  }

  const parsed: RecommendBody = { answers: {} };
  if (!isObject(body.answers)) {
    errors.push({ path: "/answers", message: "질문 id → 선택지 id 객체여야 합니다" });
  } else {
    for (const [qid, option] of Object.entries(body.answers)) {
      if (typeof option !== "string") errors.push({ path: `/answers/${qid}`, message: "문자열이어야 합니다" });
    }
    parsed.answers = body.answers as Record<string, string>;
  }

  if (body.weights !== undefined) {
    if (!isObject(body.weights)) {
      errors.push({ path: "/weights", message: "객체여야 합니다" });
    } else {
      for (const [key, value] of Object.entries(body.weights)) {
        if (!(WEIGHT_KEYS as readonly string[]).includes(key)) {
          errors.push({ path: `/weights/${key}`, message: `다음 중 하나여야 합니다: ${WEIGHT_KEYS.join(", ")}` });
        } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          errors.push({ path: `/weights/${key}`, message: "0 이상의 숫자여야 합니다" });
        }
      }
      parsed.weights = body.weights as Record<string, number>;
    }
  }

  if (body.budget !== undefined) {
    if (body.budget === null || (Number.isSafeInteger(body.budget) && (body.budget as number) >= 0)) {
      parsed.budget = body.budget as number | null;
    } else {
      errors.push({ path: "/budget", message: "0 이상의 정수 또는 null 이어야 합니다" });
    }
  }

  if (errors.length) throw new AppError("VALIDATION_FAILED", 400, "추천 요청 본문이 잘못되었습니다", { in: "body", errors });
  return parsed;
}

/** 엔진 { layouts, partial } → FurnitureLayout[] (최대 3개). 스키마에 안 맞으면 502. */
export function checkLayouts(result: unknown): unknown[] {
  const path = "/v1/layouts:recommend";
  const layouts = isObject(result) ? result.layouts : undefined;
  if (!Array.isArray(layouts)) throw unavailable(path, "엔진 응답에 layouts 배열이 없습니다");

  const picked = layouts.slice(0, 3);
  const problems = picked.flatMap((layout, i) => {
    const r = validate("furniture-layout", layout);
    return r.valid ? [] : [`[${i}]\n${formatIssues(r.errors)}`];
  });
  if (problems.length) {
    console.error(`[api] 엔진 배치안이 FurnitureLayout 스키마에 맞지 않습니다:\n${problems.join("\n")}`);
    throw unavailable(path, "엔진 배치안이 FurnitureLayout 스키마에 맞지 않습니다", { invalid: problems.length });
  }
  return picked;
}

/** Express 4 는 async 핸들러의 reject 를 잡지 않는다 → next(err) 로 넘긴다. */
function asyncHandler(fn: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
