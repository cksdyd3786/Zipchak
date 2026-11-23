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

test("웹 PR(B 작성) → C", () => {
  assert.deepStrictEqual(pickReviewers(config, ["apps/web/src/scene/Walls.tsx"], "ps514"), ["seyeon1202"]);
});

test("소셜 폴더(C 작성) → B, 웹 규칙의 exclude로 C 자신 대신 B만", () => {
  assert.deepStrictEqual(pickReviewers(config, ["apps/web/src/social/PostitLayer.tsx"], "seyeon1202"), ["ps514"]);
});

test("iOS PR(A 작성) → E", () => {
  assert.deepStrictEqual(pickReviewers(config, ["apps/ios/ZipChakScan/Info.plist"], "jagari"), ["cksdyd3786"]);
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

test("문서만(E 작성) → 규칙상 E뿐이라 비면 fallback의 B", () => {
  assert.deepStrictEqual(pickReviewers(config, ["docs/milestones.md"], "cksdyd3786"), ["ps514"]);
});

test("여러 파트를 건드리면 합치되 최대 3명", () => {
  const r = pickReviewers(config, ["apps/web/src/App.tsx", "services/engine/app/main.py", "packages/schema/x.json"], "jagari");
  assert.ok(r.length <= 3);
  assert.ok(!r.includes("jagari"));
});

test("아이디 대소문자 무시하고 작성자 제외 → 아무도 안 남으면 fallback", () => {
  // 웹 규칙의 리뷰어는 C뿐인데 작성자가 C(대문자로 들어옴)라 빠지고, fallback E·B가 지정된다
  assert.deepStrictEqual(pickReviewers(config, ["apps/web/a.ts"], "SEYEON1202"), ["cksdyd3786", "ps514"]);
});

test("파일이 어느 규칙에도 안 맞으면 fallback", () => {
  assert.deepStrictEqual(pickReviewers(config, ["scripts/x.sh"], "jagari"), ["cksdyd3786", "ps514"]);
});
