// 공통 경로(CODEOWNERS에 적힌 경로)를 건드린 PR에 코드 오너 승인이 있는지 판정한다.
// 순수 함수만 둔다. 워크플로: .github/workflows/common-approval.yml, 테스트: common-approval.test.js
//
// 왜 필요한가: dev Ruleset의 필요 승인 수를 0으로 낮추면 GitHub가 "Require review from Code Owners"를
// 강제하지 않는다. 그래서 공통 경로의 E 승인을 이 검사(필수 status check)로 대신 강제한다.

/** CODEOWNERS 텍스트 → [{ pattern, owners }] (owners는 @ 없이 소문자) */
function parseCodeowners(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({ pattern, owners: owners.map((o) => o.replace(/^@/, "").toLowerCase()) });
  }
  return rules;
}

/**
 * 이 저장소 CODEOWNERS가 쓰는 형태만 지원한다: 루트 기준 "/dir/"(폴더 전체)와 "/file"(파일 하나).
 * 다른 형태(*, ** 등)를 CODEOWNERS에 추가하면 여기도 고친다.
 */
function matches(pattern, file) {
  const p = pattern.replace(/^\//, "");
  return p.endsWith("/") ? file.startsWith(p) : file === p;
}

/** 바뀐 파일들의 소유자 합집합. CODEOWNERS처럼 파일마다 마지막으로 맞는 규칙이 이긴다. */
function ownersFor(rules, files) {
  const owners = new Set();
  for (const f of files) {
    let hit = null;
    for (const r of rules) if (matches(r.pattern, f)) hit = r;
    if (hit) hit.owners.forEach((o) => owners.add(o));
  }
  return [...owners];
}

/** 리뷰 목록 → 마지막 의견이 APPROVED인 사람(소문자) 집합. COMMENTED·PENDING은 의견을 바꾸지 않는다. */
function approvedBy(reviews) {
  const last = new Map();
  const sorted = [...reviews].sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  for (const r of sorted) {
    if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) continue;
    last.set(r.user.login.toLowerCase(), r.state);
  }
  return new Set([...last].filter(([, s]) => s === "APPROVED").map(([u]) => u));
}

/**
 * @returns {{conclusion: "success"|"failure", title: string, summary: string}}
 */
function evaluate({ rules, files, author, reviews }) {
  const owners = ownersFor(rules, files);
  if (owners.length === 0) {
    return { conclusion: "success", title: "공통 경로 없음 — 승인 불필요", summary: "코드 PR은 CI만 통과하면 작성자가 직접 머지한다." };
  }
  const others = owners.filter((o) => o !== author.toLowerCase());
  const mention = owners.map((o) => `@${o}`).join(", ");
  if (others.length === 0) {
    return { conclusion: "success", title: "작성자가 코드 오너 — --admin 머지", summary: `공통 경로 소유자(${mention})가 작성자 본인이다.` };
  }
  const approved = approvedBy(reviews);
  const ok = others.filter((o) => approved.has(o));
  if (ok.length > 0) {
    return { conclusion: "success", title: `공통 경로 승인됨 (@${ok.join(", @")})`, summary: "승인 후에는 누구든 머지할 수 있다." };
  }
  const commonFiles = files.filter((f) => rules.some((r) => matches(r.pattern, f)));
  return {
    conclusion: "failure",
    title: `공통 경로 변경 — ${others.map((o) => `@${o}`).join(", ")} 승인 필요`,
    summary: `공통 경로(docs/, 루트 README.md·CLAUDE.md, packages/schema/, .github/)를 건드린 PR은 코드 오너 승인이 필요하다 (docs/workflow.md).\n\n해당 파일:\n${commonFiles.map((f) => `- \`${f}\``).join("\n")}`,
  };
}

module.exports = { parseCodeowners, matches, ownersFor, approvedBy, evaluate };
