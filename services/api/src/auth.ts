// 임시 인증 (#12 로그인 전). Authorization: Bearer <토큰> 이 있어야 하고, 토큰 값으로 사용자를 정한다.
// - 토큰이 없으면 401 UNAUTHORIZED (Mock 서버와 같은 동작이라 iOS·웹이 그대로 붙는다)
// - "user_..." 이면 그대로 userId, 짧은 영숫자면 "user_<토큰>", 그 밖(긴 JWT 등)은 해시로 userId 를 만든다
// #12(M0-1)에서 이 파일의 userFromToken 만 JWT 검증으로 바꾼다.
import { createHash } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { AppError } from "./errors.js";

export interface AuthUser {
  userId: string;
  displayName: string;
}

export function userFromToken(token: string): AuthUser {
  if (token.startsWith("user_")) return { userId: token, displayName: token };
  if (/^[A-Za-z0-9_-]{1,40}$/.test(token)) return { userId: `user_${token}`, displayName: token };
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return { userId: `user_${hash}`, displayName: `user_${hash}` };
}

/** Bearer 토큰이 없으면 401. 있으면 res.locals.user 에 넣는다. */
export const requireUser: RequestHandler = (req, res, next) => {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return next(new AppError("UNAUTHORIZED", 401, "로그인이 필요합니다"));
  res.locals.user = userFromToken(match[1]);
  next();
};

export function currentUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) throw new AppError("UNAUTHORIZED", 401, "로그인이 필요합니다");
  return user;
}
