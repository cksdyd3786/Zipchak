// 공통 에러 포맷: { "error": { "code", "message", "details" } } (docs/openapi.yaml components/schemas/Error)
import type { ErrorRequestHandler, RequestHandler } from "express";

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "ROOM_NOT_CLOSED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "EXPIRED_INVITE"
  | "ENGINE_UNAVAILABLE"
  | "INTERNAL";

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details: Record<string, unknown> };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** 어떤 라우트에도 걸리지 않은 요청 → 404 NOT_FOUND */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError("NOT_FOUND", 404, "찾을 수 없습니다", { method: req.method, path: req.path }));
};

/** 맨 마지막에 붙인다. AppError가 아닌 에러는 내용을 숨기고 500 INTERNAL 로 돌려준다. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const appError = toAppError(err);
  if (appError.status >= 500) console.error("[api]", err);
  const body: ErrorBody = {
    error: { code: appError.code, message: appError.message, details: appError.details },
  };
  res.status(appError.status).json(body);
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParserError(err)) {
    const message =
      err.type === "entity.parse.failed"
        ? "본문이 올바른 JSON이 아닙니다"
        : err.type === "entity.too.large"
          ? "본문이 너무 큽니다"
          : err.message;
    return new AppError("VALIDATION_FAILED", err.status, message);
  }
  return new AppError("INTERNAL", 500, "서버 내부 오류가 발생했습니다");
}

/** express.json()(body-parser)이 던지는 4xx 에러 */
function isBodyParserError(err: unknown): err is { type: string; status: number; message: string } {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  return typeof e.type === "string" && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.expose === true;
}
