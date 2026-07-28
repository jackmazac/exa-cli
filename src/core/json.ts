import type { JsonObject, JsonValue } from "./contracts.js";

export function sanitizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const sanitized: JsonValue[] = [];
    let index = 0;
    while (index < value.length) {
      sanitized.push(sanitizeJson(value[index]));
      index += 1;
    }
    return sanitized;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const source = value as JsonObject;
  const result: JsonObject = {};
  const keys = Object.keys(source);
  let index = 0;
  while (index < keys.length) {
    const key = keys[index];
    if (key !== "requestTags") {
      result[key] = sanitizeJson(source[key]);
    }
    index += 1;
  }
  return result;
}
