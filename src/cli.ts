import { writeFileSync } from "node:fs";

import { parseArgs } from "./cli/args.js";
import { readInputDocument } from "./cli/input.js";
import {
  AgentRunControl,
  buildAgentRunRequest,
  cancelAgent,
  getAgent,
  runAgent,
  waitAgent,
} from "./commands/agent.js";
import { buildFetchRequest } from "./commands/fetch.js";
import { buildSearchRequest } from "./commands/search.js";
import type {
  CliEnvelope,
  EnvelopeCommandName,
  JsonObject,
  JsonValue,
  ParsedCommand,
} from "./core/contracts.js";
import { CliError } from "./core/errors.js";
import { ExaHttpClient, RequestControl } from "./core/http.js";
import { CLI_VERSION } from "./version.js";

function argvWithoutRuntime(): string[] {
  const values: string[] = [];
  let index = 2;
  while (index < process.argv.length) {
    const value = process.argv[index];
    if (typeof value === "string") {
      values.push(value);
    }
    index += 1;
  }
  return values;
}

function containsArgument(args: string[], wanted: string): boolean {
  let index = 0;
  while (index < args.length) {
    if (args[index] === wanted) {
      return true;
    }
    index += 1;
  }
  return false;
}

function helpData(topic: string): JsonObject {
  return {
    usage: "exa <command> [options]",
    topic,
    commands: [
      "exa search <query> [options]",
      "exa search --input <file|->",
      "exa fetch <url>... [options]",
      "exa fetch --input <file|->",
      "exa agent run <query> [options]",
      "exa agent run --input <file|->",
      "exa agent get <agent_run_id>",
      "exa agent wait <agent_run_id> [--poll-interval-ms 4000]",
      "exa agent cancel <agent_run_id>",
    ],
    globalOptions: [
      "--pretty",
      "--timeout-ms <integer>",
      "--verbose",
      "--help",
      "--version",
    ],
  };
}

function validateApiBaseUrl(raw: string): string {
  const value = raw.length === 0 ? "https://api.exa.ai" : raw;
  if (/\s/.test(value) || value.includes("?") || value.includes("#")) {
    throw new CliError("INVALID_INPUT", "EXA_API_BASE_URL is not a valid API base URL.", "cli");
  }
  if (value.startsWith("https://") && value.length > "https://".length) {
    return value.endsWith("/") ? value.slice(0, value.length - 1) : value;
  }
  if (!value.startsWith("http://")) {
    throw new CliError(
      "INVALID_INPUT",
      "EXA_API_BASE_URL must use HTTPS, except for a local test server.",
      "cli",
    );
  }

  const remainder = value.slice("http://".length);
  const slash = remainder.indexOf("/");
  const authority = slash < 0 ? remainder : remainder.slice(0, slash);
  if (authority.length === 0 || authority.includes("@")) {
    throw new CliError("INVALID_INPUT", "EXA_API_BASE_URL is not a valid API base URL.", "cli");
  }

  let hostname = "";
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    hostname = close < 0 ? "" : authority.slice(1, close);
  } else {
    const colon = authority.indexOf(":");
    hostname = colon < 0 ? authority : authority.slice(0, colon);
  }
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new CliError(
      "INVALID_INPUT",
      "Cleartext EXA_API_BASE_URL is allowed only for localhost, 127.0.0.1, or ::1.",
      "cli",
    );
  }
  return value.endsWith("/") ? value.slice(0, value.length - 1) : value;
}

function environmentValue(name: "EXA_API_KEY" | "EXA_SOURCE" | "EXA_API_BASE_URL"): string {
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

function diagnostic(enabled: boolean, message: string): void {
  if (enabled) {
    writeFileSync("/dev/stderr", `${message}\n`, "utf8");
  }
}

async function executeApiCommand(
  command: ParsedCommand,
  control: RequestControl,
  agentRunControl: AgentRunControl | null,
): Promise<JsonValue> {
  const apiKey = environmentValue("EXA_API_KEY");
  if (apiKey.trim().length === 0) {
    throw new CliError(
      "AUTH_ERROR",
      "EXA_API_KEY is required for API commands.",
      command.command,
    );
  }
  const baseUrl = validateApiBaseUrl(environmentValue("EXA_API_BASE_URL"));
  const source = environmentValue("EXA_SOURCE");
  const client = new ExaHttpClient(baseUrl, apiKey, source);

  if (command.kind === "search") {
    const raw =
      command.inputPath.length > 0
        ? readInputDocument(command.inputPath, command.command)
        : undefined;
    const request = buildSearchRequest(raw === undefined ? command : null, raw);
    diagnostic(command.verbose, "request search POST /search");
    return client.requestJson(
      command.command,
      "POST",
      "/search",
      request,
      command.timeoutMs,
      true,
      control,
    );
  }
  if (command.kind === "fetch") {
    const raw =
      command.inputPath.length > 0
        ? readInputDocument(command.inputPath, command.command)
        : undefined;
    const request = buildFetchRequest(raw === undefined ? command : null, raw);
    diagnostic(command.verbose, "request fetch POST /contents");
    return client.requestJson(
      command.command,
      "POST",
      "/contents",
      request,
      command.timeoutMs,
      true,
      control,
    );
  }
  if (command.kind === "agent.run") {
    const raw =
      command.inputPath.length > 0
        ? readInputDocument(command.inputPath, command.command)
        : undefined;
    const request = buildAgentRunRequest(raw === undefined ? command : null, raw);
    diagnostic(command.verbose, "request agent.run POST /agent/runs");
    if (agentRunControl === null) {
      throw new CliError("INVALID_RESPONSE", "Agent run control was not initialized.", command.command);
    }
    try {
      return await runAgent(
        client,
        request,
        command.timeoutMs,
        command.verbose ? (message) => diagnostic(true, message) : undefined,
        agentRunControl,
      );
    } catch (error) {
      if (!agentRunControl.requestControl.interrupted) {
        throw error;
      }
      let cancellationMessage = "No Agent run ID was received, so no upstream cancellation was possible.";
      if (agentRunControl.runId.length > 0) {
        diagnostic(
          command.verbose,
          `request agent.cancel POST /agent/runs/${agentRunControl.runId}/cancel`,
        );
        try {
          await cancelAgent(
            client,
            agentRunControl.runId,
            command.timeoutMs < 5000 ? command.timeoutMs : 5000,
            new RequestControl(),
          );
          cancellationMessage = `Agent run ${agentRunControl.runId} was cancelled upstream.`;
        } catch {
          cancellationMessage = `Agent run ${agentRunControl.runId} may still be executing because upstream cancellation failed.`;
        }
      }
      throw new CliError(
        "CANCELLED",
        `CLI invocation was interrupted. ${cancellationMessage}`,
        command.command,
      );
    }
  }
  if (command.kind === "agent.get") {
    diagnostic(command.verbose, `request agent.get GET /agent/runs/${command.runId}`);
    return getAgent(client, command.runId, command.timeoutMs, control);
  }
  if (command.kind === "agent.wait") {
    diagnostic(command.verbose, `request agent.wait GET /agent/runs/${command.runId}`);
    return waitAgent(
      client,
      command.runId,
      command.timeoutMs,
      command.pollIntervalMs,
      command.verbose ? (message) => diagnostic(true, message) : undefined,
      control,
    );
  }
  if (command.kind === "agent.cancel") {
    diagnostic(command.verbose, `request agent.cancel POST /agent/runs/${command.runId}/cancel`);
    return cancelAgent(client, command.runId, command.timeoutMs, control);
  }
  throw new CliError("USAGE_ERROR", "Expected an API command.", "cli");
}

function exitCodeFor(error: CliError): number {
  if (error.code === "USAGE_ERROR" || error.code === "INVALID_INPUT") {
    return 2;
  }
  if (error.code === "AUTH_ERROR") {
    return 3;
  }
  if (error.code === "RATE_LIMITED") {
    return 4;
  }
  if (error.code === "UPSTREAM_ERROR" || error.code === "CANCELLED") {
    return 5;
  }
  return 6;
}

function emit(envelope: CliEnvelope, pretty: boolean): void {
  const compact = JSON.stringify(envelope);
  writeFileSync("/dev/stdout", `${pretty ? prettyJson(compact) : compact}\n`, "utf8");
}

function indentation(level: number): string {
  let value = "";
  let index = 0;
  while (index < level) {
    value += "  ";
    index += 1;
  }
  return value;
}

function prettyJson(compact: string): string {
  let result = "";
  let level = 0;
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < compact.length) {
    const character = compact[index];
    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
      result += character;
    } else if (character === "{" || character === "[") {
      result += character;
      const closing = character === "{" ? "}" : "]";
      if (index + 1 < compact.length && compact[index + 1] !== closing) {
        level += 1;
        result += `\n${indentation(level)}`;
      }
    } else if (character === "}" || character === "]") {
      const opening = character === "}" ? "{" : "[";
      if (index > 0 && compact[index - 1] !== opening) {
        level -= 1;
        result += `\n${indentation(level)}`;
      }
      result += character;
    } else if (character === ",") {
      result += `,\n${indentation(level)}`;
    } else if (character === ":") {
      result += ": ";
    } else {
      result += character;
    }
    index += 1;
  }
  return result;
}

async function main(): Promise<number> {
  const args = argvWithoutRuntime();
  const pretty = containsArgument(args, "--pretty");
  let activeCommand: EnvelopeCommandName = "cli";
  let interrupted = false;
  let activeControl: RequestControl | null = null;
  const onInterrupt = (): void => {
    interrupted = true;
    if (activeControl !== null) {
      activeControl.interrupt();
    }
  };
  process.on("SIGINT", onInterrupt);
  try {
    const command = parseArgs(args);
    activeCommand = command.command;
    if (command.kind === "help") {
      emit(
        {
          version: 1,
          ok: true,
          command: "cli",
          data: helpData(command.topic),
        },
        command.pretty,
      );
      return 0;
    }
    if (command.kind === "version") {
      emit(
        {
          version: 1,
          ok: true,
          command: "cli",
          data: CLI_VERSION,
        },
        command.pretty,
      );
      return 0;
    }

    const agentRunControl = command.kind === "agent.run" ? new AgentRunControl() : null;
    activeControl =
      agentRunControl === null ? new RequestControl() : agentRunControl.requestControl;
    const data = await executeApiCommand(command, activeControl, agentRunControl);
    emit(
      {
        version: 1,
        ok: true,
        command: command.command,
        data,
      },
      command.pretty,
    );
    return 0;
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError("INVALID_RESPONSE", "The CLI failed unexpectedly.", activeCommand);
    emit(
      {
        version: 1,
        ok: false,
        command: cliError.command,
        error: cliError.toRecord(),
      },
      pretty,
    );
    return interrupted ? 130 : exitCodeFor(cliError);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
  }
}

main().then((exitCode) => {
  process.exit(exitCode);
});
