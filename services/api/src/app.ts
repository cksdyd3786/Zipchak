// 집착 REST API 앱 (담당 E). listen 은 index.ts 가 한다 — 테스트는 createApp() 을 바로 쓴다.
// 계약: docs/openapi.yaml (요약 docs/api.md). 모든 본문은 packages/schema 로 검증한다.
import cors from "cors";
import express, { type Express } from "express";
import { loadConfig, type Config } from "./config.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { createEngineClient, type EngineClient } from "./engine.js";
import { catalogRouter } from "./routes/catalog.js";
import { recommendRouter } from "./routes/recommend.js";
import { roomsRouter } from "./routes/rooms.js";
import { templatesRouter } from "./routes/templates.js";
import { MemoryStore, type Store } from "./store.js";
import type { MarketFurnitureItem } from "./types.js";

// TODO(M0-1)  POST /auth/login
// TODO(M5-1)  POST /rooms/:roomId/invites
// TODO(M5-2)  POST /layouts/:layoutId/postits, POST .../postits/:postitId/preview
// TODO(M0-3)  POST /events

export interface AppOptions {
  config?: Config;
  /** 카탈로그를 바꿔 끼운다 (테스트용). 없으면 fixtures/catalog.json 을 읽어 검증한다. */
  catalog?: MarketFurnitureItem[];
  /** 404 처리 앞에 라우트를 더 붙인다 (테스트용 임시 라우트) */
  extraRoutes?: (app: Express) => void;
  /** 엔진 클라이언트를 바꿔 끼운다 (테스트용). 없으면 config.engineUrl 로 만든다. */
  engine?: EngineClient;
  /** 방·배치안 저장소. 없으면 메모리 저장소 (서버를 다시 켜면 비워진다) */
  store?: Store;
}

export function createApp({ config = loadConfig(), catalog, extraRoutes, engine, store = new MemoryStore() }: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // fixture 는 createApp() 할 때 읽고 검증한다 — 틀리면 서버가 뜨지 않는다.
  app.use(templatesRouter()); // M1-3
  app.use(catalogRouter(catalog)); // M3-1 (DB 적재는 #14 후속)
  app.use(recommendRouter({ engine: engine ?? createEngineClient(config.engineUrl), catalog })); // M2-1 엔진 프록시
  app.use(roomsRouter(store)); // M0-2 방·배치안 저장 (메모리, Postgres 는 후속)

  extraRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
