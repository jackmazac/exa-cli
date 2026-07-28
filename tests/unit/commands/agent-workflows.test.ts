import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import {
  cancelAgent,
  getAgent,
  runAgent,
  waitAgent,
} from "../../../src/commands/agent.js";
import { ExaHttpClient } from "../../../src/core/http.js";

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  test: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP test server.");
  }
  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  request.setEncoding("utf8");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

describe("Agent workflows", () => {
  it("streams Agent creation without a stream body field and returns terminal data", async () => {
    const progress: string[] = [];
    await withServer(
      async (request, response) => {
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/agent/runs");
        expect(request.headers.accept).toBe("text/event-stream");
        expect(JSON.parse(await readBody(request))).toEqual({
          query: "q",
          effort: "low",
        });
        response.setHeader("content-type", "text/event-stream");
        response.write("event: agent_run.cre");
        response.write('ated\ndata: {"id":"agent_run_1","status":"queued"}\n\n');
        response.write(
          'event: agent_run.completed\ndata: {"id":"agent_run_1","status":"completed","output":{"answer":42},"requestTags":["remove"]}\n\n',
        );
        response.end();
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          runAgent(client, { query: "q", effort: "low" }, 1000, (message) => {
            progress.push(message);
          }),
        ).resolves.toEqual({
          id: "agent_run_1",
          status: "completed",
          output: { answer: 42 },
        });
      },
    );
    expect(progress).toEqual([
      "agent_run.created agent_run_1",
      "agent_run.completed agent_run_1",
    ]);
  });

  it("returns a resumable running result when the stream ends after creation", async () => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "text/event-stream");
        response.end(
          'event: agent_run.created\ndata: {"id":"agent_run_resume","status":"queued"}\n\n',
        );
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(runAgent(client, { query: "q" }, 1000)).resolves.toEqual({
          id: "agent_run_resume",
          status: "running",
        });
      },
    );
  });

  it("fails closed when the stream ends before a run ID", async () => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "text/event-stream");
        response.end(": no created event\n\n");
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(runAgent(client, { query: "q" }, 1000)).rejects.toMatchObject({
          code: "UPSTREAM_STATE_UNKNOWN",
          message: expect.stringMatching(/do not blindly retry/i),
        });
      },
    );
  });

  it.each([
    ["agent_run.failed", "UPSTREAM_ERROR", "Agent rejected the schema"],
    ["agent_run.cancelled", "CANCELLED", "Agent run was cancelled."],
  ])("maps terminal %s to %s", async (event, code, message) => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "text/event-stream");
        response.end(
          `event: agent_run.created\ndata: {"id":"agent_run_1"}\n\nevent: ${event}\ndata: {"id":"agent_run_1","status":"${event.split(".")[1]}","message":"${message}"}\n\n`,
        );
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(runAgent(client, { query: "q" }, 1000)).rejects.toMatchObject({
          code,
          message,
        });
      },
    );
  });

  it("rejects invalid event JSON", async () => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "text/event-stream");
        response.end("event: agent_run.created\ndata: {bad\n\n");
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(runAgent(client, { query: "q" }, 1000)).rejects.toMatchObject({
          code: "INVALID_RESPONSE",
        });
      },
    );
  });

  it("gets, polls, and cancels a retained Agent run through the exact endpoints", async () => {
    const requests: Array<{ method: string; url: string; body: string }> = [];
    let getCount = 0;
    await withServer(
      async (request, response) => {
        const body = await readBody(request);
        requests.push({
          method: request.method ?? "",
          url: request.url ?? "",
          body,
        });
        response.setHeader("content-type", "application/json");
        if (request.url === "/agent/runs/agent_run_1/cancel") {
          response.end('{"id":"agent_run_1","status":"cancelled"}');
          return;
        }
        getCount += 1;
        if (getCount < 3) {
          response.end('{"id":"agent_run_1","status":"running"}');
        } else {
          response.end(
            '{"id":"agent_run_1","status":"completed","output":{"answer":"done"}}',
          );
        }
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(getAgent(client, "agent_run_1", 1000)).resolves.toEqual({
          id: "agent_run_1",
          status: "running",
        });
        await expect(waitAgent(client, "agent_run_1", 1000, 1)).resolves.toEqual({
          id: "agent_run_1",
          status: "completed",
          output: { answer: "done" },
        });
        await expect(cancelAgent(client, "agent_run_1", 1000)).resolves.toEqual({
          id: "agent_run_1",
          status: "cancelled",
        });
      },
    );

    expect(requests).toEqual([
      { method: "GET", url: "/agent/runs/agent_run_1", body: "" },
      { method: "GET", url: "/agent/runs/agent_run_1", body: "" },
      { method: "GET", url: "/agent/runs/agent_run_1", body: "" },
      { method: "POST", url: "/agent/runs/agent_run_1/cancel", body: "" },
    ]);
  });

  it.each([
    ["failed", "UPSTREAM_ERROR"],
    ["cancelled", "CANCELLED"],
  ])("maps a retained terminal %s state to %s", async (status, code) => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            id: "agent_run_1",
            status,
            message: `run ${status}`,
          }),
        );
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(waitAgent(client, "agent_run_1", 1000, 1)).rejects.toMatchObject({
          code,
          message: `run ${status}`,
        });
      },
    );
  });
});
