// 배치 엔진(D, services/engine) 호출. 계약: docs/api.md "엔진" 절.
// 엔진이 꺼져 있거나 · 시간 안에 답이 없거나 · 5xx·JSON 아님 → 502 ENGINE_UNAVAILABLE
// 엔진이 본문을 거절함(400·422) → 400 VALIDATION_FAILED (엔진 메시지를 그대로 전한다)
import { AppError } from "./errors.js";

/** 엔진 자체 예산은 4.5초(+LLM 설명). 넉넉히 10초 기다린다. */
export const ENGINE_TIMEOUT_MS = 10_000;

export interface EngineClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

export function createEngineClient(baseUrl: string, timeoutMs: number = ENGINE_TIMEOUT_MS): EngineClient {
  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(baseUrl + path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw unavailable(path, isTimeout(e) ? `엔진이 ${timeoutMs}ms 안에 응답하지 않았습니다` : "엔진에 연결할 수 없습니다");
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      if (isTimeout(e)) throw unavailable(path, `엔진이 ${timeoutMs}ms 안에 응답하지 않았습니다`);
      data = undefined;
    }

    if (res.status === 400 || res.status === 422) {
      // FastAPI: HTTPException(detail={"error": {...}}) → { "detail": { "error": {...} } }
      const engineError = pick(pick(data, "detail"), "error") ?? pick(data, "error");
      const message = pick(engineError, "message");
      throw new AppError("VALIDATION_FAILED", 400, typeof message === "string" ? message : "엔진이 요청을 거절했습니다", {
        engineStatus: res.status,
        path,
      });
    }
    if (!res.ok || data === undefined) {
      throw unavailable(path, "엔진 응답이 올바르지 않습니다", { engineStatus: res.status });
    }
    return data;
  }

  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
  };
}

export function unavailable(path: string, message: string, details: Record<string, unknown> = {}): AppError {
  return new AppError("ENGINE_UNAVAILABLE", 502, message, { path, ...details });
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

function pick(obj: unknown, key: string): unknown {
  return typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>)[key] : undefined;
}
