// packages/schema 의 세 스키마로 본문을 검증한다. 스키마는 모듈을 처음 불러올 때 한 번만 컴파일한다.
import { join } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";
import { SCHEMA_DIR, readJsonFile } from "./paths.js";

// ajv-formats는 CJS 패키지라 NodeNext에서는 default import가 module.exports(.default 를 가진 함수)로 온다.
const addFormats = addFormatsModule.default;

export const SCHEMA_NAMES = ["room", "market-furniture-item", "furniture-layout"] as const;
export type SchemaName = (typeof SCHEMA_NAMES)[number];

const TITLES: Record<SchemaName, string> = {
  room: "RoomData",
  "market-furniture-item": "MarketFurnitureItem",
  "furniture-layout": "FurnitureLayout",
};

export interface SchemaIssue {
  /** JSON Pointer (ajv instancePath). 최상위는 "/" */
  path: string;
  message: string;
}

export type ValidationResult = { valid: true } | { valid: false; errors: SchemaIssue[] };

type JsonObject = Record<string, unknown>;

const schemas = Object.fromEntries(
  SCHEMA_NAMES.map((name) => [name, readJsonFile(join(SCHEMA_DIR, `${name}.schema.json`)) as JsonObject]),
) as Record<SchemaName, JsonObject>;

// packages/schema/validate.mjs 와 같은 옵션이다 (CI의 fixture 검증과 판정을 맞춘다).
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validators = Object.fromEntries(
  SCHEMA_NAMES.map((name) => [name, ajv.compile(schemas[name])]),
) as Record<SchemaName, ValidateFunction>;

/** room.schema.json $defs.category — openapi의 Category 와 같은 원본 */
export const CATEGORIES: readonly string[] = (() => {
  const defs = schemas.room.$defs as Record<string, { enum?: unknown }> | undefined;
  const values = defs?.category?.enum;
  if (!Array.isArray(values) || !values.every((v) => typeof v === "string")) {
    throw new Error("room.schema.json 에서 $defs.category.enum 을 찾을 수 없습니다");
  }
  return Object.freeze([...values]);
})();

export function validate(name: SchemaName, data: unknown): ValidationResult {
  const fn = validators[name];
  return fn(data) ? { valid: true } : { valid: false, errors: toIssues(fn.errors) };
}

/** 요청 본문(req.body)을 검증한다. 실패하면 400 VALIDATION_FAILED, details.errors 에 경로별 메시지. */
export function validateBody(name: SchemaName): RequestHandler {
  return (req, _res, next) => {
    const result = validate(name, req.body);
    if (result.valid) return next();
    next(
      new AppError("VALIDATION_FAILED", 400, `본문이 ${TITLES[name]} 스키마에 맞지 않습니다`, {
        schema: TITLES[name],
        errors: result.errors,
      }),
    );
  };
}

/** 로그·시작 에러용 한 줄씩 */
export function formatIssues(issues: SchemaIssue[]): string {
  return issues.map((i) => `  ${i.path} ${i.message}`).join("\n");
}

function toIssues(errors: ErrorObject[] | null | undefined): SchemaIssue[] {
  return (errors ?? []).map((e) => ({ path: e.instancePath || "/", message: e.message ?? e.keyword }));
}
