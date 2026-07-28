import type { FetchCommand, JsonObject } from "../core/contracts.js";

export function buildFetchRequest(
  command: FetchCommand | null,
  rawInput?: JsonObject,
): JsonObject {
  if (rawInput !== undefined) {
    return rawInput;
  }
  if (command === null) {
    return {};
  }

  return {
    urls: command.urls,
    text: { maxCharacters: command.maxCharacters },
  };
}
