import type { JsonObject, JsonValue, StoredModelRun } from "./types.ts";

const sensitiveKeyPattern = /(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|bearer|cookie)/i;
const sensitiveValuePatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi
];
const redacted = "[REDACTED]";

export function redactModelRun(modelRun: StoredModelRun): StoredModelRun {
  return redactJson(modelRun) as StoredModelRun;
}

export function redactModelRuns(modelRuns: StoredModelRun[]) {
  return modelRuns.map(redactModelRun);
}

function redactJson(value: unknown): JsonValue {
  if (value === null) return null;

  if (typeof value === "string") {
    return sensitiveValuePatterns.reduce(
      (current, pattern) => current.replace(pattern, redacted),
      value
    );
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }

  if (typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sensitiveKeyPattern.test(key) ? redacted : redactJson(item);
    }
    return output;
  }

  return null;
}
