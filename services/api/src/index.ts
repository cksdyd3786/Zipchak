// 집착 REST API 진입점 (담당 E)
// 계약: docs/api.md. 모든 본문은 packages/schema 로 검증한다.
import express from "express";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// TODO(M0-1)  POST /auth/login
// TODO(M0-2)  POST /rooms, GET /rooms/:roomId, GET/PUT /layouts/:layoutId
// TODO(M1-3)  GET /templates
// TODO(M3-1)  GET /catalog?category=&maxWidth=&maxDepth=
// TODO(M2-1)  POST /rooms/:roomId/recommend  → 엔진(D) 프록시
// TODO(M5-1)  POST /rooms/:roomId/invites
// TODO(M5-2)  POST /layouts/:layoutId/postits, POST .../postits/:postitId/preview
// TODO(M0-3)  POST /events

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`[api] listening on :${port}`));
