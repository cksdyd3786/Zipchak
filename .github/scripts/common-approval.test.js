// 실행: node --test .github/scripts/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { parseCodeowners, ownersFor, approvedBy, evaluate } = require("./common-approval.js");

const CODEOWNERS = fs.readFileSync(path.join(__dirname, "..", "CODEOWNERS"), "utf8");
const E = "cksdyd3786";
const review = (login, state, at = "2026-11-24T00:00:00Z") => ({ user: { login }, state, submitted_at: at });

test("CODEOWNERS: 주석·빈 줄은 건너뛰고 경로와 소유자를 읽는다", () => {
  const rules = parseCodeowners("# c\n\n/docs/   @a @B\n/README.md @c\n");
  assert.deepStrictEqual(rules, [
    { pattern: "/docs/", owners: ["a", "b"] },
    { pattern: "/README.md", owners: ["c"] },
  ]);
});

test("실제 CODEOWNERS: 공통 경로 5개는 모두 E 소유", () => {
  const rules = parseCodeowners(CODEOWNERS);
  for (const f of ["docs/openapi.yaml", "README.md", "CLAUDE.md", "packages/schema/room.schema.json", ".github/workflows/ci.yml"]) {
    assert.deepStrictEqual(ownersFor(rules, [f]), [E], f);
  }
});

test("실제 CODEOWNERS: 코드 경로와 파트 폴더의 README·CLAUDE.md는 소유자 없음", () => {
  const rules = parseCodeowners(CODEOWNERS);
  const files = ["apps/web/src/App.tsx", "services/engine/app/main.py", "apps/web/README.md", "services/engine/CLAUDE.md", "docsx/a.md"];
  assert.deepStrictEqual(ownersFor(rules, files), []);
});

test("리뷰: 사람별 마지막 의견(APPROVED/CHANGES_REQUESTED/DISMISSED)만 본다, COMMENTED는 무시", () => {
  const reviews = [
    review("A", "APPROVED", "2026-11-24T01:00:00Z"),
    review("A", "COMMENTED", "2026-11-24T02:00:00Z"),
    review("b", "APPROVED", "2026-11-24T01:00:00Z"),
    review("b", "CHANGES_REQUESTED", "2026-11-24T02:00:00Z"),
    review("c", "APPROVED", "2026-11-24T01:00:00Z"),
    review("c", "DISMISSED", "2026-11-24T02:00:00Z"),
  ];
  assert.deepStrictEqual([...approvedBy(reviews)], ["a"]);
});

const rules = parseCodeowners(CODEOWNERS);

test("코드 PR → 통과 (승인 불필요)", () => {
  const r = evaluate({ rules, files: ["apps/web/src/App.tsx"], author: "ps514", reviews: [] });
  assert.strictEqual(r.conclusion, "success");
});

test("팀원의 공통 PR, 승인 없음 → 실패", () => {
  const r = evaluate({ rules, files: ["packages/schema/fixtures/catalog.json"], author: "jagari", reviews: [] });
  assert.strictEqual(r.conclusion, "failure");
  assert.match(r.title, /@cksdyd3786/);
});

test("팀원의 공통 PR, 다른 팀원만 승인 → 실패", () => {
  const r = evaluate({ rules, files: ["docs/api.md"], author: "jagari", reviews: [review("ps514", "APPROVED")] });
  assert.strictEqual(r.conclusion, "failure");
});

test("팀원의 공통 PR, E 승인 → 통과", () => {
  const r = evaluate({ rules, files: ["docs/api.md", "apps/web/a.ts"], author: "jagari", reviews: [review("CKSDYD3786", "APPROVED")] });
  assert.strictEqual(r.conclusion, "success");
});

test("E가 승인 후 변경 요청으로 바꾸면 → 실패", () => {
  const reviews = [review(E, "APPROVED", "2026-11-24T01:00:00Z"), review(E, "CHANGES_REQUESTED", "2026-11-24T02:00:00Z")];
  const r = evaluate({ rules, files: ["README.md"], author: "jagari", reviews });
  assert.strictEqual(r.conclusion, "failure");
});

test("E 본인의 공통 PR → 통과 (자기 PR은 승인할 수 없으므로 --admin 머지)", () => {
  const r = evaluate({ rules, files: [".github/CODEOWNERS"], author: "CksdyD3786", reviews: [] });
  assert.strictEqual(r.conclusion, "success");
});
