import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import { ExaHttpClient } from "../../../src/core/http.js";
import { CliError } from "../../../src/core/errors.js";

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

describe("ExaHttpClient", () => {
  it("sends the API, content, user-agent, and encoded integration headers", async () => {
    await withServer(
      async (request, response) => {
        const body = await readBody(request);
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            method: request.method,
            url: request.url,
            apiKey: request.headers["x-api-key"],
            contentType: request.headers["content-type"],
            accept: request.headers.accept,
            userAgent: request.headers["user-agent"],
            integration: request.headers["x-exa-integration"],
            body: JSON.parse(body),
            requestTags: ["remove-me"],
          }),
        );
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "secret-key", "café source", 1);
        await expect(
          client.requestJson(
            "search",
            "POST",
            "/search",
            { query: "native" },
            1000,
            true,
          ),
        ).resolves.toEqual({
          method: "POST",
          url: "/search",
          apiKey: "secret-key",
          contentType: "application/json",
          accept: "application/json",
          userAgent: "exa-cli/4.0.0",
          integration: "cli-search:caf%C3%A9%20source",
          body: { query: "native" },
        });
      },
    );
  });

  it("retries idempotent requests twice for retryable upstream statuses", async () => {
    let attempts = 0;
    await withServer(
      (_request, response) => {
        attempts += 1;
        response.setHeader("content-type", "application/json");
        if (attempts < 3) {
          response.statusCode = attempts === 1 ? 500 : 503;
          response.end('{"message":"temporary"}');
          return;
        }
        response.end('{"status":"ok"}');
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          client.requestJson("fetch", "POST", "/contents", { urls: [] }, 1000, true),
        ).resolves.toEqual({ status: "ok" });
      },
    );
    expect(attempts).toBe(3);
  });

  it("does not retry a non-idempotent request", async () => {
    let attempts = 0;
    await withServer(
      (_request, response) => {
        attempts += 1;
        response.statusCode = 503;
        response.setHeader("content-type", "application/json");
        response.end('{"message":"temporary"}');
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          client.requestJson("agent.run", "POST", "/agent/runs", { query: "q" }, 1000, false),
        ).rejects.toMatchObject({
          code: "UPSTREAM_ERROR",
          status: 503,
        });
      },
    );
    expect(attempts).toBe(1);
  });

  it("maps 429 and preserves retry and request metadata", async () => {
    await withServer(
      (_request, response) => {
        response.statusCode = 429;
        response.setHeader("content-type", "application/json");
        response.setHeader("retry-after", "7");
        response.setHeader("x-request-id", "req_header");
        response.end('{"message":"slow down","requestId":"req_body"}');
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        try {
          await client.requestJson("search", "POST", "/search", { query: "q" }, 1000, true);
          throw new Error("Expected request to fail.");
        } catch (error) {
          expect(error).toBeInstanceOf(CliError);
          expect(error).toMatchObject({
            code: "RATE_LIMITED",
            message: "slow down",
            status: 429,
            requestId: "req_body",
            retryAfterSeconds: 7,
          });
        }
      },
    );
  });

  it.each([
    [401, "AUTH_ERROR"],
    [403, "AUTH_ERROR"],
    [404, "UPSTREAM_ERROR"],
    [400, "UPSTREAM_ERROR"],
  ])("maps HTTP %i to %s without retrying", async (status, code) => {
    let attempts = 0;
    await withServer(
      (_request, response) => {
        attempts += 1;
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end('{"error":"denied"}');
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          client.requestJson("agent.get", "GET", "/agent/runs/id", null, 1000, true),
        ).rejects.toMatchObject({ code, status });
      },
    );
    expect(attempts).toBe(1);
  });

  it("rejects a malformed successful response", async () => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end("{not-json");
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          client.requestJson("search", "POST", "/search", { query: "q" }, 1000, false),
        ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
      },
    );
  });

  it("destroys a request when its deadline expires", async () => {
    await withServer(
      (_request, response) => {
        setTimeout(() => {
          response.setHeader("content-type", "application/json");
          response.end('{"late":true}');
        }, 100);
      },
      async (baseUrl) => {
        const client = new ExaHttpClient(baseUrl, "key", "", 1);
        await expect(
          client.requestJson("search", "GET", "/slow", null, 20, false),
        ).rejects.toMatchObject({ code: "TIMEOUT" });
      },
    );
  });
});
