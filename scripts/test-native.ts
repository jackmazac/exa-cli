import { spawn, spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { CLI_VERSION } from "../src/version.js";

interface Execution {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface Fixture {
  name: string;
  args: string[];
  stdin: string;
  authenticated: boolean;
}

async function execute(
  executable: string,
  prefix: string[],
  args: string[],
  environment: Record<string, string>,
  stdin: string,
  cwd: string,
): Promise<Execution> {
  const child = spawn(executable, [...prefix, ...args], {
    cwd,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...environment,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
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
  const [code] = (await once(child, "close")) as [number];
  return { stdout, stderr, exitCode: code };
}

async function readBody(request: IncomingMessage): Promise<string> {
  request.setEncoding("utf8");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

async function fakeExa(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readBody(request);
  if (request.url === "/search") {
    const parsed = JSON.parse(body) as { query?: string };
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        requestId: "req_fixture",
        query: parsed.query ?? "",
        results: [{ url: "https://example.com", requestTags: ["remove"] }],
      }),
    );
    return;
  }
  if (request.url === "/contents") {
    response.setHeader("content-type", "application/json");
    response.end(`{"echo":${body},"results":[]}`);
    return;
  }
  if (request.url === "/agent/runs" && request.method === "POST") {
    response.setHeader("content-type", "text/event-stream");
    response.write(
      'event: agent_run.created\ndata: {"id":"agent_run_fixture","status":"running"}\n\n',
    );
    response.end(
      'event: agent_run.completed\ndata: {"id":"agent_run_fixture","status":"completed","output":{"answer":"fixture"}}\n\n',
    );
    return;
  }
  if (request.url === "/agent/runs/agent_run_fixture/cancel") {
    response.setHeader("content-type", "application/json");
    response.end('{"id":"agent_run_fixture","status":"cancelled"}');
    return;
  }
  if (request.url === "/agent/runs/agent_run_fixture") {
    response.setHeader("content-type", "application/json");
    response.end(
      '{"id":"agent_run_fixture","status":"completed","output":{"answer":"fixture"}}',
    );
    return;
  }
  response.statusCode = 404;
  response.setHeader("content-type", "application/json");
  response.end('{"message":"not found"}');
}

function assertEqualFixture(name: string, node: Execution, native: Execution): void {
  if (node.stdout !== native.stdout || node.exitCode !== native.exitCode) {
    throw new Error(
      `${name} differs between TypeScript and native.\nNode: ${JSON.stringify(node)}\nNative: ${JSON.stringify(native)}`,
    );
  }
  if (node.stderr !== "" || native.stderr !== "") {
    throw new Error(
      `${name} unexpectedly wrote stderr.\nNode: ${node.stderr}\nNative: ${native.stderr}`,
    );
  }
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const nativeExecutable = resolve("dist/exa");
  await access(nativeExecutable, constants.X_OK);

  const server = createServer((request, response) => {
    void fakeExa(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP fixture server.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const fixtures: Fixture[] = [
    { name: "version", args: ["--version"], stdin: "", authenticated: false },
    { name: "help", args: ["--help"], stdin: "", authenticated: false },
    { name: "usage", args: ["search"], stdin: "", authenticated: false },
    {
      name: "missing-auth",
      args: ["search", "q"],
      stdin: "",
      authenticated: false,
    },
    {
      name: "search",
      args: ["search", "native fixture"],
      stdin: "",
      authenticated: true,
    },
    {
      name: "pretty-fetch-stdin",
      args: ["fetch", "--input", "-", "--pretty"],
      stdin: '{"urls":["https://example.com"],"futureField":true}',
      authenticated: true,
    },
    {
      name: "agent-run",
      args: ["agent", "run", "fixture"],
      stdin: "",
      authenticated: true,
    },
    {
      name: "agent-get",
      args: ["agent", "get", "agent_run_fixture"],
      stdin: "",
      authenticated: true,
    },
    {
      name: "agent-cancel",
      args: ["agent", "cancel", "agent_run_fixture"],
      stdin: "",
      authenticated: true,
    },
  ];

  try {
    let index = 0;
    while (index < fixtures.length) {
      const fixture = fixtures[index];
      const environment = {
        EXA_API_KEY: fixture.authenticated ? "fixture-key" : "",
        EXA_API_BASE_URL: baseUrl,
        EXA_SOURCE: "native differential",
      };
      const node = await execute(
        process.execPath,
        ["--import", "tsx", "src/cli.ts"],
        fixture.args,
        environment,
        fixture.stdin,
        repositoryRoot,
      );
      const native = await execute(
        nativeExecutable,
        [],
        fixture.args,
        environment,
        fixture.stdin,
        repositoryRoot,
      );
      assertEqualFixture(fixture.name, node, native);
      process.stdout.write(`differential ${fixture.name}: ok\n`);
      index += 1;
    }
  } finally {
    server.close();
    await once(server, "close");
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "exa-native-test-"));
  try {
    const isolated = await execute(
      nativeExecutable,
      [],
      ["--version"],
      {
        EXA_API_KEY: "",
        PATH: "/usr/bin:/bin",
        NODE_PATH: "",
      },
      "",
      temporaryDirectory,
    );
    if (isolated.exitCode !== 0 || isolated.stdout !==
      `{"version":1,"ok":true,"command":"cli","data":"${CLI_VERSION}"}\n`) {
      throw new Error(`Native isolation smoke failed: ${JSON.stringify(isolated)}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const dependencyCommand = process.platform === "darwin"
    ? spawnSync("otool", ["-L", nativeExecutable], { encoding: "utf8" })
    : spawnSync("ldd", [nativeExecutable], { encoding: "utf8" });
  if (dependencyCommand.status !== 0) {
    throw new Error(`Could not inspect native dependencies: ${dependencyCommand.stderr}`);
  }
  const dependencies = dependencyCommand.stdout.toLowerCase();
  const forbidden = ["libnode", "libv8", "quickjs", "javascriptcore"];
  let forbiddenIndex = 0;
  while (forbiddenIndex < forbidden.length) {
    if (dependencies.includes(forbidden[forbiddenIndex])) {
      throw new Error(`Native executable depends on ${forbidden[forbiddenIndex]}.`);
    }
    forbiddenIndex += 1;
  }
  process.stdout.write("native isolation and dependency checks: ok\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown native test failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
