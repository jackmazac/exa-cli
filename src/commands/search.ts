import type { JsonObject, SearchCommand } from "../core/contracts.js";

export function buildSearchRequest(
  command: SearchCommand | null,
  rawInput?: JsonObject,
): JsonObject {
  if (rawInput !== undefined) {
    return rawInput;
  }
  if (command === null) {
    return {};
  }

  const request: JsonObject = {
    query: command.query,
    type: command.searchType,
    numResults: command.numResults,
    contents: { highlights: true },
  };
  if (command.category.length > 0) {
    request.category = command.category;
  }
  return request;
}
