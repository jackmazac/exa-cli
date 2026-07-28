import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { CLI_VERSION } from "../../src/version.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(
  args: string[],
  environment: Record<string, string>,
  stdin = "",
): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...args],
    {
      cwd: repositoryRoot,
      env: { ...process.env, NODE_NO_WARNINGS: "1", ...environment },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(stdin);
  const [exitCode] = (await once(child, "close")) as [number];
  return { stdout, stderr, exitCode };
}

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

describe("exa CLI process contract", () => {
  it("executes a convenience search and emits exactly one compact JSON envelope", async () => {
    await withServer(
      async (request, response) => {
        expect(JSON.parse(await readBody(request))).toEqual({
          query: "native cli",
          type: "auto",
          numResults: 10,
          contents: { highlights: true },
        });
        response.setHeader("content-type", "application/json");
        response.end(
          '{"requestId":"req_1","results":[{"url":"https://example.com","requestTags":["secret"]}]}',
        );
      },
      async (baseUrl) => {
        const result = await runCli(["search", "native cli"], {
          EXA_API_KEY: "test-key",
          EXA_API_BASE_URL: baseUrl,
        });
        expect(result).toEqual({
          stdout:
            '{"version":1,"ok":true,"command":"search","data":{"requestId":"req_1","results":[{"url":"https://example.com"}]}}\n',
          stderr: "",
          exitCode: 0,
        });
      },
    );
  });

  it("reads a forward-compatible fetch request from stdin and pretty-prints only stdout", async () => {
    await withServer(
      async (request, response) => {
        expect(await readBody(request)).toBe(
          '{"urls":["https://example.com"],"futureMode":"structured"}',
        );
        response.setHeader("content-type", "application/json");
        response.end('{"results":[]}');
      },
      async (baseUrl) => {
        const result = await runCli(
          ["fetch", "--input", "-", "--pretty"],
          {
            EXA_API_KEY: "test-key",
            EXA_API_BASE_URL: baseUrl,
          },
          '{"urls":["https://example.com"],"futureMode":"structured"}',
        );
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toBe(
          '{\n  "version": 1,\n  "ok": true,\n  "command": "fetch",\n  "data": {\n    "results": []\n  }\n}\n',
        );
      },
    );
  });

  it("reads a forward-compatible search request from a JSON file", async () => {
    const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "exa-cli-input-"));
    const inputPath = resolve(temporaryDirectory, "request.json");
    await writeFile(
      inputPath,
      '{"query":"file request","futureSearchMode":"preview"}',
      "utf8",
    );
    try {
      await withServer(
        async (request, response) => {
          expect(await readBody(request)).toBe(
            '{"query":"file request","futureSearchMode":"preview"}',
          );
          response.setHeader("content-type", "application/json");
          response.end('{"results":[]}');
        },
        async (baseUrl) => {
          const result = await runCli(["search", "--input", inputPath], {
            EXA_API_KEY: "test-key",
            EXA_API_BASE_URL: baseUrl,
          });
          expect(result).toEqual({
            stdout:
              '{"version":1,"ok":true,"command":"search","data":{"results":[]}}\n',
            stderr: "",
            exitCode: 0,
          });
        },
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("returns JSON help and version without requiring credentials", async () => {
    const help = await runCli(["--help"], { EXA_API_KEY: "" });
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    expect(JSON.parse(help.stdout)).toMatchObject({
      version: 1,
      ok: true,
      command: "cli",
      data: { usage: "exa <command> [options]" },
    });

    const version = await runCli(["--version"], { EXA_API_KEY: "" });
    expect(version).toEqual({
      stdout: `{"version":1,"ok":true,"command":"cli","data":"${CLI_VERSION}"}\n`,
      stderr: "",
      exitCode: 0,
    });
  });

  it.each([
    [
      ["search"],
      { EXA_API_KEY: "key" },
      2,
      "USAGE_ERROR",
    ],
    [
      ["search", "q"],
      { EXA_API_KEY: "" },
      3,
      "AUTH_ERROR",
    ],
    [
      ["search", "q"],
      {
        EXA_API_KEY: "key",
        EXA_API_BASE_URL: "http://api.example.com",
      },
      2,
      "INVALID_INPUT",
    ],
  ])(
    "maps local failures to a single error envelope",
    async (args, environment, exitCode, code) => {
      const result = await runCli(args as string[], environment as Record<string, string>);
      expect(result.exitCode).toBe(exitCode);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        version: 1,
        ok: false,
        error: { code },
      });
      expect(result.stdout.endsWith("\n")).toBe(true);
      expect(result.stdout.trim().split("\n").length).toBe(1);
    },
  );

  it.each([
    [429, 4, "RATE_LIMITED"],
    [500, 5, "UPSTREAM_ERROR"],
  ])("maps upstream HTTP %i to exit %i", async (status, exitCode, code) => {
    await withServer(
      (_request, response) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end('{"message":"fixture failure"}');
      },
      async (baseUrl) => {
        const result = await runCli(["search", "q"], {
          EXA_API_KEY: "secret-never-print",
          EXA_API_BASE_URL: baseUrl,
        });
        expect(result.exitCode).toBe(exitCode);
        expect(result.stderr).not.toContain("secret-never-print");
        expect(result.stdout).not.toContain("secret-never-print");
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: false,
          command: "search",
          error: { code, status, message: "fixture failure" },
        });
      },
    );
  });

  it("keeps diagnostics on stderr only when verbose is set", async () => {
    await withServer(
      (_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end('{"results":[]}');
      },
      async (baseUrl) => {
        const result = await runCli(["search", "q", "--verbose"], {
          EXA_API_KEY: "secret-never-print",
          EXA_API_BASE_URL: baseUrl,
          EXA_SOURCE: "integration test",
        });
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, command: "search" });
        expect(result.stderr).toMatch(/request search POST \/search/);
        expect(result.stderr).not.toContain("secret-never-print");
      },
    );
  });

  it("cancels a known upstream Agent run once on SIGINT and exits 130", async () => {
    let progressResolve: () => void = () => {};
    const progressReceived = new Promise<void>((resolveProgress) => {
      progressResolve = resolveProgress;
    });
    let cancellationCount = 0;

    await withServer(
      async (request, response) => {
        await readBody(request);
        if (request.url === "/agent/runs/agent_run_signal/cancel") {
          cancellationCount += 1;
          response.setHeader("content-type", "application/json");
          response.end('{"id":"agent_run_signal","status":"cancelled"}');
          return;
        }
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'event: agent_run.created\ndata: {"id":"agent_run_signal","status":"running"}\n\n',
        );
      },
      async (baseUrl) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "src/cli.ts", "agent", "run", "q", "--verbose"],
          {
            cwd: repositoryRoot,
            env: {
              ...process.env,
              NODE_NO_WARNINGS: "1",
              EXA_API_KEY: "test-key",
              EXA_API_BASE_URL: baseUrl,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
          if (stderr.includes("agent_run.created agent_run_signal")) {
            progressResolve();
          }
        });
        await progressReceived;
        child.kill("SIGINT");
        const [exitCode] = (await once(child, "close")) as [number];

        expect(exitCode).toBe(130);
        expect(stderr).toContain("agent_run.created agent_run_signal");
        expect(stderr).not.toContain("test-key");
        expect(JSON.parse(stdout)).toMatchObject({
          ok: false,
          command: "agent.run",
          error: {
            code: "CANCELLED",
            message: expect.stringContaining("cancelled upstream"),
          },
        });
      },
    );
    expect(cancellationCount).toBe(1);
  });

  it("interrupts Agent wait locally without cancelling the upstream run", async () => {
    let getResolve: () => void = () => {};
    const getStarted = new Promise<void>((resolveGet) => {
      getResolve = resolveGet;
    });
    let cancellationCount = 0;

    await withServer(
      (request, response) => {
        if (request.url?.endsWith("/cancel")) {
          cancellationCount += 1;
          response.end("{}");
          return;
        }
        getResolve();
      },
      async (baseUrl) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "src/cli.ts", "agent", "wait", "agent_run_signal"],
          {
            cwd: repositoryRoot,
            env: {
              ...process.env,
              NODE_NO_WARNINGS: "1",
              EXA_API_KEY: "test-key",
              EXA_API_BASE_URL: baseUrl,
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        await getStarted;
        child.kill("SIGINT");
        const [exitCode] = (await once(child, "close")) as [number];

        expect(exitCode).toBe(130);
        expect(JSON.parse(stdout)).toMatchObject({
          ok: false,
          command: "agent.wait",
          error: { code: "CANCELLED" },
        });
      },
    );
    expect(cancellationCount).toBe(0);
  });
});
