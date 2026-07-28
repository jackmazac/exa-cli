import { describe, expect, it } from "vitest";

import { buildAgentRunRequest } from "../../../src/commands/agent.js";
import { buildFetchRequest } from "../../../src/commands/fetch.js";
import { buildSearchRequest } from "../../../src/commands/search.js";
import { parseInputDocument } from "../../../src/cli/input.js";
import { sanitizeJson } from "../../../src/core/json.js";

describe("command request construction", () => {
  it("builds the documented convenience search request", () => {
    expect(
      buildSearchRequest({
        kind: "search",
        command: "search",
        inputPath: "",
        query: "static TypeScript compiler",
        searchType: "deep",
        numResults: 7,
        category: "github",
        pretty: false,
        verbose: false,
        timeoutMs: 300_000,
      }),
    ).toEqual({
      query: "static TypeScript compiler",
      type: "deep",
      numResults: 7,
      category: "github",
      contents: { highlights: true },
    });
  });

  it("builds the documented convenience fetch request", () => {
    expect(
      buildFetchRequest({
        kind: "fetch",
        command: "fetch",
        inputPath: "",
        urls: ["https://example.com/a", "https://example.com/b"],
        maxCharacters: 3000,
        pretty: false,
        verbose: false,
        timeoutMs: 60_000,
      }),
    ).toEqual({
      urls: ["https://example.com/a", "https://example.com/b"],
      text: { maxCharacters: 3000 },
    });
  });

  it("builds the documented convenience Agent request without a stream field", () => {
    expect(
      buildAgentRunRequest({
        kind: "agent.run",
        command: "agent.run",
        inputPath: "",
        query: "research native compiler support",
        effort: "low",
        previousRunId: "agent_run_previous",
        pretty: false,
        verbose: false,
        timeoutMs: 3_900_000,
      }),
    ).toEqual({
      query: "research native compiler support",
      effort: "low",
      previousRunId: "agent_run_previous",
    });
  });
});

describe("raw JSON input", () => {
  it("forwards unknown API request fields without normalization", () => {
    const raw = parseInputDocument(
      '{"query":"q","futureField":{"enabled":true},"numResults":13}',
      "search",
    );

    expect(raw).toEqual({
      query: "q",
      futureField: { enabled: true },
      numResults: 13,
    });
    expect(buildSearchRequest(null, raw)).toBe(raw);
  });

  it.each(["null", "[]", '"query"', "4", "true"])(
    "rejects a non-object input document: %s",
    (document) => {
      expect(() => parseInputDocument(document, "fetch")).toThrow(/JSON object/);
    },
  );

  it("rejects malformed JSON", () => {
    expect(() => parseInputDocument('{"query":', "search")).toThrow(/valid JSON/);
  });

  it("rejects a caller-owned Agent stream field", () => {
    expect(() =>
      parseInputDocument('{"query":"q","stream":false}', "agent.run"),
    ).toThrow(/stream/);
  });
});

describe("response sanitization", () => {
  it("removes requestTags recursively while preserving arrays and future fields", () => {
    expect(
      sanitizeJson({
        requestId: "req_1",
        requestTags: ["root-secret"],
        future: {
          keep: true,
          requestTags: { secret: "nested" },
          rows: [
            { id: 1, requestTags: ["row-secret"] },
            null,
            "literal",
          ],
        },
      }),
    ).toEqual({
      requestId: "req_1",
      future: {
        keep: true,
        rows: [{ id: 1 }, null, "literal"],
      },
    });
  });
});
