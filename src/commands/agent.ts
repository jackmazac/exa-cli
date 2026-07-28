import type {
  AgentRunCommand,
  CommandName,
  JsonObject,
  JsonValue,
} from "../core/contracts.js";
import { CliError } from "../core/errors.js";
import { RequestControl, type ExaHttpClient } from "../core/http.js";
import { sanitizeJson } from "../core/json.js";

export function buildAgentRunRequest(
  command: AgentRunCommand | null,
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
    effort: command.effort,
  };
  if (command.previousRunId.length > 0) {
    request.previousRunId = command.previousRunId;
  }
  return request;
}

export class AgentRunControl {
  readonly requestControl = new RequestControl();
  runId = "";
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectString(value: JsonValue, key: string): string {
  if (!isObject(value)) {
    return "";
  }
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : "";
}

function terminalMessage(value: JsonValue, fallback: string): string {
  const message = objectString(value, "message");
  if (message.length > 0) {
    return message;
  }
  if (isObject(value)) {
    const error = value.error;
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
    if (isObject(error)) {
      const nested = objectString(error, "message");
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return fallback;
}

function parseEventData(document: string): JsonValue {
  try {
    return sanitizeJson(JSON.parse(document) as JsonValue);
  } catch {
    throw new CliError(
      "INVALID_RESPONSE",
      "Exa Agent returned invalid JSON in an SSE event.",
      "agent.run",
    );
  }
}

export async function runAgent(
  client: ExaHttpClient,
  request: JsonObject,
  timeoutMs: number,
  onProgress?: (message: string) => void,
  control?: AgentRunControl,
): Promise<JsonValue> {
  let runId = "";
  let terminalEvent = "";
  let terminalData: JsonValue = null;

  try {
    await client.requestSse("agent.run", "/agent/runs", request, timeoutMs, (frame) => {
      const data = parseEventData(frame.data);
      const eventRunId = objectString(data, "id");
      if (eventRunId.length > 0) {
        runId = eventRunId;
        if (control !== undefined) {
          control.runId = eventRunId;
        }
      }
      if (onProgress !== undefined) {
        onProgress(runId.length > 0 ? `${frame.event} ${runId}` : frame.event);
      }
      if (
        frame.event === "agent_run.completed" ||
        frame.event === "agent_run.failed" ||
        frame.event === "agent_run.cancelled"
      ) {
        terminalEvent = frame.event;
        terminalData = data;
      }
    }, control === undefined ? undefined : control.requestControl);
  } catch (error) {
    if (control !== undefined && control.requestControl.interrupted) {
      throw new CliError("CANCELLED", "CLI invocation was interrupted.", "agent.run");
    }
    if (
      error instanceof CliError &&
      (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT")
    ) {
      if (runId.length > 0) {
        return { id: runId, status: "running" };
      }
      throw new CliError(
        "UPSTREAM_STATE_UNKNOWN",
        "The Agent stream failed before a run ID was received. Upstream state is unknown; do not blindly retry because that may create duplicate paid work.",
        "agent.run",
      );
    }
    throw error;
  }

  if (terminalEvent === "agent_run.completed") {
    return terminalData;
  }
  if (terminalEvent === "agent_run.failed") {
    throw new CliError(
      "UPSTREAM_ERROR",
      terminalMessage(terminalData, "Agent run failed."),
      "agent.run",
    );
  }
  if (terminalEvent === "agent_run.cancelled") {
    throw new CliError(
      "CANCELLED",
      terminalMessage(terminalData, "Agent run was cancelled."),
      "agent.run",
    );
  }
  if (runId.length > 0) {
    return { id: runId, status: "running" };
  }
  throw new CliError(
    "UPSTREAM_STATE_UNKNOWN",
    "The Agent stream ended before a run ID was received. Upstream state is unknown; do not blindly retry because that may create duplicate paid work.",
    "agent.run",
  );
}

function agentPath(runId: string): string {
  return `/agent/runs/${encodeURIComponent(runId)}`;
}

async function getAgentForCommand(
  client: ExaHttpClient,
  runId: string,
  timeoutMs: number,
  command: CommandName,
  control?: RequestControl,
): Promise<JsonValue> {
  return client.requestJson(command, "GET", agentPath(runId), null, timeoutMs, true, control);
}

export function getAgent(
  client: ExaHttpClient,
  runId: string,
  timeoutMs: number,
  control?: RequestControl,
): Promise<JsonValue> {
  return getAgentForCommand(client, runId, timeoutMs, "agent.get", control);
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function waitAgent(
  client: ExaHttpClient,
  runId: string,
  timeoutMs: number,
  pollIntervalMs: number,
  onProgress?: (message: string) => void,
  control?: RequestControl,
): Promise<JsonValue> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (control !== undefined && control.interrupted) {
      throw new CliError("CANCELLED", "CLI invocation was interrupted.", "agent.wait");
    }
    const data = await getAgentForCommand(
      client,
      runId,
      remaining,
      "agent.wait",
      control,
    );
    const status = objectString(data, "status");
    if (onProgress !== undefined) {
      onProgress(`agent.wait ${runId} ${status.length > 0 ? status : "unknown"}`);
    }
    if (status === "completed") {
      return data;
    }
    if (status === "failed") {
      throw new CliError(
        "UPSTREAM_ERROR",
        terminalMessage(data, "Agent run failed."),
        "agent.wait",
      );
    }
    if (status === "cancelled") {
      throw new CliError(
        "CANCELLED",
        terminalMessage(data, "Agent run was cancelled."),
        "agent.wait",
      );
    }
    if (status !== "queued" && status !== "running") {
      throw new CliError(
        "INVALID_RESPONSE",
        "Exa Agent returned an unknown run status.",
        "agent.wait",
      );
    }
    if (Date.now() + pollIntervalMs >= deadline) {
      break;
    }
    let waited = 0;
    while (waited < pollIntervalMs) {
      if (control !== undefined && control.interrupted) {
        throw new CliError("CANCELLED", "CLI invocation was interrupted.", "agent.wait");
      }
      const slice = pollIntervalMs - waited > 100 ? 100 : pollIntervalMs - waited;
      await pause(slice);
      waited += slice;
    }
  }
  throw new CliError("TIMEOUT", "Timed out waiting for the Agent run.", "agent.wait");
}

export function cancelAgent(
  client: ExaHttpClient,
  runId: string,
  timeoutMs: number,
  control?: RequestControl,
): Promise<JsonValue> {
  return client.requestJson(
    "agent.cancel",
    "POST",
    `${agentPath(runId)}/cancel`,
    null,
    timeoutMs,
    false,
    control,
  );
}
