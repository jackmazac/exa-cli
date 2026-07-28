import { describe, expect, it } from "vitest";

import { SseParser } from "../../../src/core/sse.js";

describe("SseParser", () => {
  it("parses fields split across arbitrary chunks", () => {
    const parser = new SseParser();

    expect(parser.push("id: evt")).toEqual([]);
    expect(parser.push("_1\nevent: agent_run.cre")).toEqual([]);
    expect(parser.push('ated\ndata: {"id":"agent_')).toEqual([]);
    expect(parser.push('run_1"}\n\n')).toEqual([
      {
        id: "evt_1",
        event: "agent_run.created",
        data: '{"id":"agent_run_1"}',
      },
    ]);
  });

  it("supports CRLF, comments, heartbeats, and repeated data lines", () => {
    const parser = new SseParser();

    expect(
      parser.push(
        ': heartbeat\r\n\r\nevent: agent_run.completed\r\ndata: {"id":"agent_run_1",\r\ndata: "status":"completed"}\r\n\r\n',
      ),
    ).toEqual([
      {
        id: "",
        event: "agent_run.completed",
        data: '{"id":"agent_run_1",\n"status":"completed"}',
      },
    ]);
  });

  it("emits multiple frames and ignores unknown fields", () => {
    const parser = new SseParser();

    expect(
      parser.push(
        "retry: 1000\nevent: one\ndata: 1\n\nevent: two\ndata: 2\n\n",
      ),
    ).toEqual([
      { id: "", event: "one", data: "1" },
      { id: "", event: "two", data: "2" },
    ]);
  });

  it("emits a final unterminated frame on finish", () => {
    const parser = new SseParser();
    expect(parser.push("event: agent_run.failed\ndata: {\"status\":\"failed\"}")).toEqual([]);
    expect(parser.finish()).toEqual([
      {
        id: "",
        event: "agent_run.failed",
        data: '{"status":"failed"}',
      },
    ]);
  });

  it("does not emit comments or frames without data", () => {
    const parser = new SseParser();
    expect(parser.push(": comment\n\nevent: heartbeat\n\n")).toEqual([]);
    expect(parser.finish()).toEqual([]);
  });
});
