import * as http from "node:http";
import * as https from "node:https";

import type {
  CommandName,
  ErrorCode,
  JsonObject,
  JsonValue,
} from "./contracts.js";
import { CliError } from "./errors.js";
import { sanitizeJson } from "./json.js";
import { SseParser, type SseFrame } from "./sse.js";
import { CLI_USER_AGENT } from "../version.js";

type HttpMethod = "GET" | "POST";

function integrationName(command: CommandName): string {
  if (command === "search") {
    return "cli-search";
  }
  if (command === "fetch") {
    return "cli-fetch";
  }
  if (command === "agent.run") {
    return "cli-agent-run";
  }
  if (command === "agent.get") {
    return "cli-agent-get";
  }
  if (command === "agent.wait") {
    return "cli-agent-wait";
  }
  return "cli-agent-cancel";
}

function integrationHeader(command: CommandName, source: string): string {
  const name = integrationName(command);
  if (source.length === 0) {
    return name;
  }
  return `${name}:${encodeURIComponent(source)}`;
}

function headerValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return "";
}

function retryAfterSeconds(value: string): number {
  if (/^[0-9]+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: { [key: string]: unknown }, key: string): string {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : "";
}

interface ErrorBody {
  message: string;
  requestId: string;
}

function parseErrorBody(body: string, status: number): ErrorBody {
  let message = `Exa API request failed with HTTP ${status}.`;
  let requestId = "";
  try {
    const parsed: unknown = JSON.parse(body);
    if (isObject(parsed)) {
      const parsedMessage = stringField(parsed, "message");
      const parsedError = stringField(parsed, "error");
      requestId = stringField(parsed, "requestId");
      if (parsedMessage.length > 0) {
        message = parsedMessage;
      } else if (parsedError.length > 0) {
        message = parsedError;
      } else {
        const nested = parsed.error;
        if (isObject(nested)) {
          const nestedMessage = stringField(nested, "message");
          if (nestedMessage.length > 0) {
            message = nestedMessage;
          }
        }
      }
    }
  } catch {
    if (body.trim().length > 0) {
      message = `Exa API request failed with HTTP ${status}.`;
    }
  }
  return { message, requestId };
}

function errorCodeForStatus(status: number, message: string): ErrorCode {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (
    status === 409 &&
    (message.toLowerCase().includes("concurr") || message.toLowerCase().includes("limit"))
  ) {
    return "RATE_LIMITED";
  }
  return "UPSTREAM_ERROR";
}

function isRetryableStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class RequestControl {
  private activeRequest: http.ClientRequest | null = null;
  interrupted = false;

  attach(request: http.ClientRequest): void {
    this.activeRequest = request;
    if (this.interrupted) {
      request.destroy();
    }
  }

  clear(request: http.ClientRequest): void {
    if (this.activeRequest === request) {
      this.activeRequest = null;
    }
  }

  interrupt(): void {
    this.interrupted = true;
    if (this.activeRequest !== null) {
      this.activeRequest.destroy();
    }
  }
}

export class ExaHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly source: string;
  private readonly retryBaseDelayMs: number;
  private readonly useHttps: boolean;
  private readonly hostname: string;
  private readonly port: number;
  private readonly basePath: string;

  constructor(baseUrl: string, apiKey: string, source: string, retryBaseDelayMs = 1000) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, baseUrl.length - 1) : baseUrl;
    this.apiKey = apiKey;
    this.source = source;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.useHttps = this.baseUrl.startsWith("https://");
    const schemeLength = this.useHttps ? "https://".length : "http://".length;
    const remainder = this.baseUrl.slice(schemeLength);
    const slash = remainder.indexOf("/");
    const authority = slash < 0 ? remainder : remainder.slice(0, slash);
    this.basePath = slash < 0 ? "" : remainder.slice(slash);
    let hostname = authority;
    let port = this.useHttps ? 443 : 80;
    if (authority.startsWith("[")) {
      const close = authority.indexOf("]");
      hostname = authority.slice(1, close);
      if (close + 1 < authority.length && authority.slice(close + 1, close + 2) === ":") {
        port = Number(authority.slice(close + 2));
      }
    } else {
      const colon = authority.lastIndexOf(":");
      if (colon >= 0) {
        hostname = authority.slice(0, colon);
        port = Number(authority.slice(colon + 1));
      }
    }
    this.hostname = hostname;
    this.port = port;
  }

  async requestJson(
    command: CommandName,
    method: HttpMethod,
    path: string,
    body: JsonObject | null,
    timeoutMs: number,
    retryable: boolean,
    control?: RequestControl,
  ): Promise<JsonValue> {
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    while (attempt < 3) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new CliError("TIMEOUT", "Exa API request timed out.", command);
      }
      if (control !== undefined && control.interrupted) {
        throw new CliError("CANCELLED", "CLI invocation was interrupted.", command);
      }
      try {
        return await this.requestJsonOnce(command, method, path, body, remaining, control);
      } catch (error) {
        if (!(error instanceof CliError)) {
          throw new CliError("NETWORK_ERROR", "Network request failed.", command);
        }

        const mayRetry =
          retryable &&
          attempt < 2 &&
          (error.code === "NETWORK_ERROR" ||
            (error.code === "UPSTREAM_ERROR" && isRetryableStatus(error.status)));
        if (!mayRetry) {
          throw error;
        }

        const waitMs = this.retryBaseDelayMs * (attempt + 1);
        if (Date.now() + waitMs >= deadline) {
          throw new CliError("TIMEOUT", "Exa API request timed out.", command);
        }
        await pause(waitMs);
        attempt += 1;
      }
    }
    throw new CliError("NETWORK_ERROR", "Network request failed.", command);
  }

  requestSse(
    command: CommandName,
    path: string,
    body: JsonObject,
    timeoutMs: number,
    onFrame: (frame: SseFrame) => void,
    control?: RequestControl,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const serialized = JSON.stringify(body);
      const integration = integrationHeader(command, this.source);
      const contentLength = Buffer.byteLength(serialized);
      let settled = false;
      let timedOut = false;
      let request: http.ClientRequest;
      let timeoutTimer: ReturnType<typeof setTimeout>;

      const onResponse = (response: http.IncomingMessage): void => {
        response.setEncoding("utf8");
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          let errorBody = "";
          response.on("data", (chunk: Buffer) => {
            if (errorBody.length <= 1_048_576) {
              errorBody += chunk.toString("utf8");
            }
          });
          response.on("end", () => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timeoutTimer);
            if (control !== undefined) {
              control.clear(request);
            }
            const details = parseErrorBody(errorBody, status);
            const requestId =
              details.requestId.length > 0
                ? details.requestId
                : headerValue(response.headers["x-request-id"]);
            reject(
              new CliError(
                errorCodeForStatus(status, details.message),
                details.message,
                command,
                status,
                requestId,
                retryAfterSeconds(headerValue(response.headers["retry-after"])),
              ),
            );
          });
          return;
        }

        const parser = new SseParser();
        const deliver = (frames: SseFrame[]): boolean => {
          let index = 0;
          while (index < frames.length) {
            try {
              onFrame(frames[index]);
            } catch (error) {
              if (!settled) {
                settled = true;
                response.destroy();
                clearTimeout(timeoutTimer);
                if (control !== undefined) {
                  control.clear(request);
                }
                reject(error);
              }
              return false;
            }
            index += 1;
          }
          return true;
        };

        response.on("data", (chunk: Buffer) => {
          if (!settled) {
            deliver(parser.push(chunk.toString("utf8")));
          }
        });
        response.on("end", () => {
          if (settled) {
            return;
          }
          if (!deliver(parser.finish())) {
            return;
          }
          settled = true;
          clearTimeout(timeoutTimer);
          if (control !== undefined) {
            control.clear(request);
          }
          resolve();
        });
        response.on("aborted", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutTimer);
            if (control !== undefined) {
              control.clear(request);
            }
            reject(new CliError("NETWORK_ERROR", "Agent event stream was interrupted.", command));
          }
        });
      };

      const requestPath = `${this.basePath}${path}`;
      request = this.useHttps
        ? https.request(
            {
              hostname: this.hostname,
              port: this.port,
              path: requestPath,
              method: "POST",
              headers: {
                "x-api-key": this.apiKey,
                "content-type": "application/json",
                accept: "text/event-stream",
                "user-agent": CLI_USER_AGENT,
                "x-exa-integration": integration,
                "content-length": contentLength,
              },
            },
            onResponse,
          )
        : http.request(
            {
              hostname: this.hostname,
              port: this.port,
              path: requestPath,
              method: "POST",
              headers: {
                "x-api-key": this.apiKey,
                "content-type": "application/json",
                accept: "text/event-stream",
                "user-agent": CLI_USER_AGENT,
                "x-exa-integration": integration,
                "content-length": contentLength,
              },
            },
            onResponse,
          );
      if (control !== undefined) {
        control.attach(request);
      }

      request.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          if (control !== undefined) {
            control.clear(request);
          }
          reject(
            control !== undefined && control.interrupted
              ? new CliError("CANCELLED", "CLI invocation was interrupted.", command)
              : timedOut
              ? new CliError("TIMEOUT", "Agent event stream timed out.", command)
              : new CliError("NETWORK_ERROR", "Agent event stream failed.", command),
          );
        }
      });
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        request.destroy();
      }, timeoutMs);
      request.write(serialized);
      request.end();
    });
  }

  private requestJsonOnce(
    command: CommandName,
    method: HttpMethod,
    path: string,
    body: JsonObject | null,
    timeoutMs: number,
    control?: RequestControl,
  ): Promise<JsonValue> {
    return new Promise((resolve, reject) => {
      const serialized = body === null ? "" : JSON.stringify(body);
      const integration = integrationHeader(command, this.source);
      const contentLength = Buffer.byteLength(serialized);

      let settled = false;
      let timedOut = false;
      const onResponse = (response: http.IncomingMessage): void => {
        response.setEncoding("utf8");
        let responseBody = "";
        response.on("data", (chunk: Buffer) => {
          if (responseBody.length <= 67_108_864) {
            responseBody += chunk.toString("utf8");
          }
          if (responseBody.length > 67_108_864) {
            response.destroy();
            if (!settled) {
              settled = true;
              clearTimeout(timeoutTimer);
              reject(
                new CliError(
                  "INVALID_RESPONSE",
                  "Exa API response exceeded the 64 MiB limit.",
                  command,
                ),
              );
            }
          }
        });
        response.on("end", () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutTimer);
          if (control !== undefined) {
            control.clear(request);
          }
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            const details = parseErrorBody(responseBody, status);
            const requestId =
              details.requestId.length > 0
                ? details.requestId
                : headerValue(response.headers["x-request-id"]);
            reject(
              new CliError(
                errorCodeForStatus(status, details.message),
                details.message,
                command,
                status,
                requestId,
                retryAfterSeconds(headerValue(response.headers["retry-after"])),
              ),
            );
            return;
          }
          if (responseBody.trim().length === 0) {
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(responseBody) as JsonValue;
            resolve(sanitizeJson(parsed));
          } catch {
            reject(
              new CliError(
                "INVALID_RESPONSE",
                "Exa API returned malformed JSON.",
                command,
                status,
                headerValue(response.headers["x-request-id"]),
              ),
            );
          }
        });
        response.on("aborted", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutTimer);
            if (control !== undefined) {
              control.clear(request);
            }
            reject(new CliError("NETWORK_ERROR", "Exa API response was interrupted.", command));
          }
        });
      };

      const requestPath = `${this.basePath}${path}`;
      const request = this.useHttps
        ? https.request(
            {
              hostname: this.hostname,
              port: this.port,
              path: requestPath,
              method,
              headers: {
                "x-api-key": this.apiKey,
                "content-type": "application/json",
                accept: "application/json",
                "user-agent": CLI_USER_AGENT,
                "x-exa-integration": integration,
                "content-length": contentLength,
              },
            },
            onResponse,
          )
        : http.request(
            {
              hostname: this.hostname,
              port: this.port,
              path: requestPath,
              method,
              headers: {
                "x-api-key": this.apiKey,
                "content-type": "application/json",
                accept: "application/json",
                "user-agent": CLI_USER_AGENT,
                "x-exa-integration": integration,
                "content-length": contentLength,
              },
            },
            onResponse,
          );
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        request.destroy();
      }, timeoutMs);
      if (control !== undefined) {
        control.attach(request);
      }

      request.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutTimer);
          if (control !== undefined) {
            control.clear(request);
          }
          reject(
            control !== undefined && control.interrupted
              ? new CliError("CANCELLED", "CLI invocation was interrupted.", command)
              : timedOut
              ? new CliError("TIMEOUT", "Exa API request timed out.", command)
              : new CliError("NETWORK_ERROR", "Network request failed.", command),
          );
        }
      });
      if (serialized.length > 0) {
        request.write(serialized);
      }
      request.end();
    });
  }
}
