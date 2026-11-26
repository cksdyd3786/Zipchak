# services/api — REST API (담당 E)

```bash
npm install
cp .env.example .env   # 선택. 없으면 기본값 (PORT 4000, CORS_ORIGIN http://localhost:5173, ENGINE_URL http://localhost:8000)
npm run dev            # 실제 서버 (:4000)
npm test               # vitest
npm run build          # tsc → dist/ (npm start 로 실행)
npm run mock           # docs/openapi.yaml 기반 Mock 서버 (:4000) — 아직 구현 안 된 경로용
```

```bash
curl localhost:4000/health
curl localhost:4000/templates                              # M1-3 원룸 템플릿 3종
curl "localhost:4000/catalog?category=desk&maxWidth=1200"  # M3-1 카탈로그 (category·maxWidth·maxDepth·maxPrice)
curl localhost:4000/questions                               # M2-1 취향 질문 (엔진 프록시, 엔진이 :8000 에 떠 있어야 함)
curl -X POST localhost:4000/rooms/room_01J0TEMPLATE04PYSTUDIO00/recommend \
  -H "content-type: application/json" -d '{"answers":{"deskHours":"gt4"}}'   # M2-1 배치안 3개 (지금은 템플릿 방만)
```

- 템플릿·카탈로그는 시작할 때 `packages/schema/fixtures/`에서 읽어 스키마로 검증한다. 틀린 파일이 있으면 서버가 뜨지 않는다. (DB 적재는 #13)
- 엔진 프록시(`/questions`, `/rooms/:roomId/recommend`)는 `ENGINE_URL`의 엔진을 부른다. 엔진이 꺼져 있거나 10초 안에 답이 없으면 502 `ENGINE_UNAVAILABLE`. 방은 아직 템플릿에서만 찾고(#13 이후 저장된 방), 결과는 저장하지 않는다.
- 에러는 항상 `{ "error": { "code", "message", "details" } }`. 스키마 검증 실패는 400 `VALIDATION_FAILED`, `details.errors[]`에 `{ path, message }`.

구조: `src/app.ts`(createApp — 라우트 조립) · `src/index.ts`(listen) · `src/config.ts` · `src/errors.ts` · `src/schema.ts`(ajv) · `src/routes/*`.
규칙과 담당 기능은 `CLAUDE.md`, 계약은 `docs/openapi.yaml`(요약 `docs/api.md`).
