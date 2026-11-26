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
curl localhost:4000/catalog/cat_desk_micke_730             # 상품 하나 (품절이어도 200, 없으면 404)
```

- 템플릿·카탈로그는 시작할 때 `packages/schema/fixtures/`에서 읽어 스키마로 검증한다. 틀린 파일이 있으면 서버가 뜨지 않는다. (DB 적재는 #14 후속)
- 에러는 항상 `{ "error": { "code", "message", "details" } }`. 스키마 검증 실패는 400 `VALIDATION_FAILED`, `details.errors[]`에 `{ path, message }`.

구조: `src/app.ts`(createApp — 라우트 조립) · `src/index.ts`(listen) · `src/config.ts` · `src/errors.ts` · `src/schema.ts`(ajv) · `src/routes/*`.
규칙과 담당 기능은 `CLAUDE.md`, 계약은 `docs/openapi.yaml`(요약 `docs/api.md`).
