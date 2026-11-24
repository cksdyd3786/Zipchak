// PR의 바뀐 파일·작성자로 리뷰어를 고른다 (순수 함수, node --test 로 테스트).
// 규칙은 .github/reviewers.json

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const matchAny = (file, globs = []) => globs.some((g) => globToRegExp(g).test(file));

/**
 * @param {{team: Record<string,string>, rules: {paths:string[], exclude?:string[], reviewers:string[]}[], fallback?: string[], maxReviewers?: number}} config
 * @param {string[]} files  PR에서 바뀐 파일 경로
 * @param {string} author   PR 작성자 GitHub 아이디
 * @returns {string[]} 리뷰어 GitHub 아이디 (중복·작성자 제외, 규칙 순서대로)
 */
function pickReviewers(config, files, author) {
  const toLogin = (code) => config.team[code] ?? code;
  const picked = [];
  const add = (login) => {
    if (login && login.toLowerCase() !== author.toLowerCase() && !picked.includes(login)) picked.push(login);
  };
  for (const rule of config.rules) {
    const hit = files.some((f) => matchAny(f, rule.paths) && !matchAny(f, rule.exclude));
    if (hit) rule.reviewers.map(toLogin).forEach(add);
  }
  if (picked.length === 0) (config.fallback ?? []).map(toLogin).forEach(add);
  return picked.slice(0, config.maxReviewers ?? 3);
}

module.exports = { pickReviewers, globToRegExp };
