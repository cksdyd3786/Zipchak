// 실행: node --test .github/scripts/
const test = require("node:test");
const assert = require("node:assert");
const config = require("../reviewers.json");
const { pickReviewers, globToRegExp } = require("./pick-reviewers.js");

test("glob: ** 는 하위 폴더 전체, * 는 한 단계", () => {
  assert.ok(globToRegExp("apps/web/**").test("apps/web/src/a.ts"));
  assert.ok(globToRegExp("docs/**").test("docs/api.md"));
  assert.ok(!globToRegExp("docs/*").test("docs/a/b.md"));
  assert.ok(globToRegExp("README.md").test("README.md"));
  assert.ok(!globToRegExp("README.md").test("apps/web/README.md"));
});

test("코드 PR은 아무도 자동 지정하지 않는다 (리뷰는 작성자가 직접 요청)", () => {
  const cases = [
    [["apps/web/src/scene/Walls.tsx"], "ps514"],
    [["apps/web/src/social/PostitLayer.tsx", "services/realtime/src/index.ts"], "seyeon1202"],
    [["apps/ios/ZipChakScan/Info.plist"], "jagari"],
    [["services/engine/app/main.py"], "sharkless-web"],
    [["services/api/src/index.ts"], "cksdyd3786"],
  ];
  for (const [files, author] of cases) assert.deepStrictEqual(pickReviewers(config, files, author), [], files.join(","));
});

test("파트 폴더의 CLAUDE.md·README.md는 코드 PR 취급 → 지정 없음", () => {
  assert.deepStrictEqual(pickReviewers(config, ["apps/web/README.md", "services/engine/CLAUDE.md"], "jagari"), []);
});

test("API 계약(E 작성) → 작성자 E는 빠지고 B, C", () => {
  assert.deepStrictEqual(pickReviewers(config, ["docs/openapi.yaml", "docs/api.md"], "cksdyd3786"), ["ps514", "seyeon1202"]);
});

test("스키마 변경(A 작성) → B, D, E", () => {
  assert.deepStrictEqual(
    pickReviewers(config, ["packages/schema/fixtures/rooms/minji.json"], "jagari"),
    ["ps514", "sharkless-web", "cksdyd3786"],
  );
});

test("문서만(A 작성) → E", () => {
  assert.deepStrictEqual(pickReviewers(config, ["docs/milestones.md"], "jagari"), ["cksdyd3786"]);
});

test("문서만(E 작성) → E는 빠지고 fallback이 비어 있어 아무도 없음", () => {
  assert.deepStrictEqual(pickReviewers(config, ["docs/milestones.md"], "cksdyd3786"), []);
});

test("코드 + 공통을 섞으면 공통 규칙만 적용", () => {
  assert.deepStrictEqual(pickReviewers(config, ["apps/web/src/App.tsx", ".github/workflows/ci.yml"], "ps514"), ["cksdyd3786"]);
});

test("여러 공통 규칙이 겹치면 합치되 최대 3명", () => {
  const r = pickReviewers(config, ["packages/schema/x.json", "docs/api.md"], "jagari");
  assert.deepStrictEqual(r, ["ps514", "sharkless-web", "cksdyd3786"]);
});

test("아이디 대소문자 무시하고 작성자 제외", () => {
  assert.deepStrictEqual(pickReviewers(config, ["README.md"], "CKSDYD3786"), []);
});

test("파일이 어느 규칙에도 안 맞으면 fallback(빈 목록) → 아무도 없음", () => {
  assert.deepStrictEqual(config.fallback, []);
  assert.deepStrictEqual(pickReviewers(config, ["scripts/x.sh"], "jagari"), []);
});

test("fallback이 없는 설정도 빈 목록으로 처리", () => {
  const { fallback, ...noFallback } = config;
  assert.deepStrictEqual(pickReviewers(noFallback, ["scripts/x.sh"], "jagari"), []);
});
