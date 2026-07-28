import type { EnvelopeCommandName, ErrorCode, ErrorRecord } from "./contracts.js";

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly command: EnvelopeCommandName;
  readonly status: number;
  readonly requestId: string;
  readonly retryAfterSeconds: number;
  readonly hasStatus: boolean;
  readonly hasRequestId: boolean;
  readonly hasRetryAfterSeconds: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    command: EnvelopeCommandName,
    status = 0,
    requestId = "",
    retryAfterSeconds = 0,
  ) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.command = command;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
    this.hasStatus = status > 0;
    this.hasRequestId = requestId.length > 0;
    this.hasRetryAfterSeconds = retryAfterSeconds > 0;
  }

  toRecord(): ErrorRecord {
    const record: ErrorRecord = {
      code: this.code,
      message: this.message,
    };
    if (this.hasStatus) {
      record.status = this.status;
    }
    if (this.hasRequestId) {
      record.requestId = this.requestId;
    }
    if (this.hasRetryAfterSeconds) {
      record.retryAfterSeconds = this.retryAfterSeconds;
    }
    return record;
  }
}

export function usageError(message: string): CliError {
  return new CliError("USAGE_ERROR", message, "cli");
}
