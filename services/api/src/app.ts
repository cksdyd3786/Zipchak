// 집착 REST API 앱 (담당 E). listen 은 index.ts 가 한다 — 테스트는 createApp() 을 바로 쓴다.
// 계약: docs/openapi.yaml (요약 docs/api.md). 모든 본문은 packages/schema 로 검증한다.
import cors from "cors";
import express, { type Express } from "express";
import { loadConfig, type Config } from "./config.js";
import { errorHandler, notFoundHandler } from "./errors.js";
import { catalogRouter } from "./routes/catalog.js";
import { templatesRouter } from "./routes/templates.js";

// TODO(M0-1)  POST /auth/login
// TODO(M0-2)  POST /rooms, GET /rooms/:roomId, GET/PUT /layouts/:layoutId
// TODO(M2-1)  POST /rooms/:roomId/recommend  → 엔진(D) 프록시 (config.engineUrl)
// TODO(M5-1)  POST /rooms/:roomId/invites
// TODO(M5-2)  POST /layouts/:layoutId/postits, POST .../postits/:postitId/preview
// TODO(M0-3)  POST /events

export interface AppOptions {
  config?: Config;
  /** 404 처리 앞에 라우트를 더 붙인다 (테스트용 임시 라우트) */
  extraRoutes?: (app: Express) => void;
}

export function createApp({ config = loadConfig(), extraRoutes }: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // fixture 는 createApp() 할 때 읽고 검증한다 — 틀리면 서버가 뜨지 않는다.
  app.use(templatesRouter()); // M1-3
  app.use(catalogRouter()); // M3-1 (DB 적재는 #13)

  extraRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
