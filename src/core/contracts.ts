export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type CommandName =
  | "search"
  | "fetch"
  | "agent.run"
  | "agent.get"
  | "agent.wait"
  | "agent.cancel";

export type EnvelopeCommandName = CommandName | "cli";

export type ErrorCode =
  | "USAGE_ERROR"
  | "INVALID_INPUT"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UPSTREAM_STATE_UNKNOWN"
  | "CANCELLED";

export interface ErrorRecord {
  code: ErrorCode;
  message: string;
  status?: number;
  requestId?: string;
  retryAfterSeconds?: number;
}

export type CliEnvelope =
  | {
      version: 1;
      ok: true;
      command: EnvelopeCommandName;
      data: JsonValue;
    }
  | {
      version: 1;
      ok: false;
      command: EnvelopeCommandName;
      error: ErrorRecord;
    };

export interface GlobalCommandOptions {
  pretty: boolean;
  verbose: boolean;
  timeoutMs: number;
}

export type SearchType = "auto" | "fast" | "instant" | "deep" | "deep-reasoning";

export type SearchCategory =
  | "company"
  | "publication"
  | "news"
  | "pdf"
  | "github"
  | "personal-site"
  | "people"
  | "financial-report";

export type AgentEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "auto";

export interface SearchCommand extends GlobalCommandOptions {
  kind: "search";
  command: "search";
  inputPath: string;
  query: string;
  searchType: SearchType;
  numResults: number;
  category: SearchCategory | "";
}

export interface FetchCommand extends GlobalCommandOptions {
  kind: "fetch";
  command: "fetch";
  inputPath: string;
  urls: string[];
  maxCharacters: number;
}

export interface AgentRunCommand extends GlobalCommandOptions {
  kind: "agent.run";
  command: "agent.run";
  inputPath: string;
  query: string;
  effort: AgentEffort;
  previousRunId: string;
}

export interface AgentGetCommand extends GlobalCommandOptions {
  kind: "agent.get";
  command: "agent.get";
  runId: string;
}

export interface AgentWaitCommand extends GlobalCommandOptions {
  kind: "agent.wait";
  command: "agent.wait";
  runId: string;
  pollIntervalMs: number;
}

export interface AgentCancelCommand extends GlobalCommandOptions {
  kind: "agent.cancel";
  command: "agent.cancel";
  runId: string;
}

export interface HelpCommand extends GlobalCommandOptions {
  kind: "help";
  command: "cli";
  topic: string;
}

export interface VersionCommand extends GlobalCommandOptions {
  kind: "version";
  command: "cli";
}

export type ParsedCommand =
  | SearchCommand
  | FetchCommand
  | AgentRunCommand
  | AgentGetCommand
  | AgentWaitCommand
  | AgentCancelCommand
  | HelpCommand
  | VersionCommand;
