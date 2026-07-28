import { describe, expect, it } from "vitest";

import { parseArgs } from "../../../src/cli/args.js";

describe("parseArgs", () => {
  it("builds the documented default search command from a positional query", () => {
    expect(parseArgs(["search", "native TypeScript CLI"])).toEqual({
      kind: "search",
      command: "search",
      inputPath: "",
      query: "native TypeScript CLI",
      searchType: "auto",
      numResults: 10,
      category: "",
      pretty: false,
      verbose: false,
      timeoutMs: 300_000,
    });
  });

  it("parses every search convenience option and global option", () => {
    expect(
      parseArgs([
        "--pretty",
        "search",
        "release engineering",
        "--type",
        "deep-reasoning",
        "--num-results",
        "42",
        "--category",
        "github",
        "--timeout-ms",
        "9000",
        "--verbose",
      ]),
    ).toEqual({
      kind: "search",
      command: "search",
      inputPath: "",
      query: "release engineering",
      searchType: "deep-reasoning",
      numResults: 42,
      category: "github",
      pretty: true,
      verbose: true,
      timeoutMs: 9000,
    });
  });

  it("parses raw search input without applying convenience arguments", () => {
    expect(parseArgs(["search", "--input", "-"])).toEqual({
      kind: "search",
      command: "search",
      inputPath: "-",
      query: "",
      searchType: "auto",
      numResults: 10,
      category: "",
      pretty: false,
      verbose: false,
      timeoutMs: 300_000,
    });
  });

  it("parses fetch defaults, multiple URLs, and max characters", () => {
    expect(
      parseArgs([
        "fetch",
        "https://example.com/a",
        "https://example.com/b",
        "--max-characters",
        "8123",
      ]),
    ).toEqual({
      kind: "fetch",
      command: "fetch",
      inputPath: "",
      urls: ["https://example.com/a", "https://example.com/b"],
      maxCharacters: 8123,
      pretty: false,
      verbose: false,
      timeoutMs: 60_000,
    });
  });

  it("parses raw fetch input", () => {
    expect(parseArgs(["fetch", "--input", "contents.json", "--pretty"])).toEqual({
      kind: "fetch",
      command: "fetch",
      inputPath: "contents.json",
      urls: [],
      maxCharacters: 3000,
      pretty: true,
      verbose: false,
      timeoutMs: 60_000,
    });
  });

  it("parses Agent run convenience and raw-input modes", () => {
    expect(
      parseArgs([
        "agent",
        "run",
        "investigate static compilers",
        "--effort",
        "xhigh",
        "--previous-run-id",
        "run_123",
      ]),
    ).toEqual({
      kind: "agent.run",
      command: "agent.run",
      inputPath: "",
      query: "investigate static compilers",
      effort: "xhigh",
      previousRunId: "run_123",
      pretty: false,
      verbose: false,
      timeoutMs: 3_900_000,
    });

    expect(parseArgs(["agent", "run", "--input", "-"])).toEqual({
      kind: "agent.run",
      command: "agent.run",
      inputPath: "-",
      query: "",
      effort: "low",
      previousRunId: "",
      pretty: false,
      verbose: false,
      timeoutMs: 3_900_000,
    });
  });

  it("parses Agent get, wait, and cancel", () => {
    expect(parseArgs(["agent", "get", "run_abc"])).toEqual({
      kind: "agent.get",
      command: "agent.get",
      runId: "run_abc",
      pretty: false,
      verbose: false,
      timeoutMs: 30_000,
    });

    expect(
      parseArgs([
        "agent",
        "wait",
        "run_abc",
        "--poll-interval-ms",
        "25",
        "--timeout-ms",
        "1000",
      ]),
    ).toEqual({
      kind: "agent.wait",
      command: "agent.wait",
      runId: "run_abc",
      pollIntervalMs: 25,
      pretty: false,
      verbose: false,
      timeoutMs: 1000,
    });

    expect(parseArgs(["agent", "cancel", "run_abc", "--verbose"])).toEqual({
      kind: "agent.cancel",
      command: "agent.cancel",
      runId: "run_abc",
      pretty: false,
      verbose: true,
      timeoutMs: 30_000,
    });
  });

  it("represents root and command help plus version as JSON meta commands", () => {
    expect(parseArgs(["--help"])).toEqual({
      kind: "help",
      command: "cli",
      topic: "cli",
      pretty: false,
      verbose: false,
      timeoutMs: 30_000,
    });
    expect(parseArgs(["search", "--help", "--pretty"])).toEqual({
      kind: "help",
      command: "cli",
      topic: "search",
      pretty: true,
      verbose: false,
      timeoutMs: 30_000,
    });
    expect(parseArgs(["--version"])).toEqual({
      kind: "version",
      command: "cli",
      pretty: false,
      verbose: false,
      timeoutMs: 30_000,
    });
  });

  it.each([
    [[]],
    [["unknown"]],
    [["search"]],
    [["fetch"]],
    [["agent"]],
    [["agent", "unknown"]],
    [["agent", "get"]],
    [["search", "q", "--unknown"]],
    [["search", "q", "--type"]],
    [["search", "q", "--type", "slow"]],
    [["search", "q", "--num-results", "0"]],
    [["search", "q", "--num-results", "101"]],
    [["search", "q", "--num-results", "1.5"]],
    [["search", "q", "--category", "blog"]],
    [["fetch", "ftp://example.com"]],
    [["fetch", "not-a-url"]],
    [["fetch", "https://example.com", "--max-characters", "0"]],
    [["agent", "run", "q", "--effort", "huge"]],
    [["agent", "get", "../bad"]],
    [["agent", "wait", "run_ok", "--poll-interval-ms", "0"]],
    [["search", "q", "--timeout-ms", "-1"]],
  ])("rejects invalid or incomplete argv without reading past its end: %j", (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });

  it.each([
    ["search", ["search", "q", "--input", "request.json"]],
    ["search", ["search", "--input", "request.json", "--type", "fast"]],
    ["fetch", ["fetch", "https://example.com", "--input", "request.json"]],
    ["fetch", ["fetch", "--input", "request.json", "--max-characters", "1"]],
    ["agent run", ["agent", "run", "q", "--input", "request.json"]],
    ["agent run", ["agent", "run", "--input", "request.json", "--effort", "high"]],
  ])("rejects mixed raw and convenience %s input", (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow(/--input/);
  });

  it("does not observe sparse or inherited argv entries", () => {
    const sparse = new Array<string>(3);
    sparse[0] = "search";
    sparse[2] = "unexpected";

    expect(() => parseArgs(sparse)).toThrow();
  });
});
