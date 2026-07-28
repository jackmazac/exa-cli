import type {
  AgentEffort,
  FetchCommand,
  GlobalCommandOptions,
  ParsedCommand,
  SearchCategory,
  SearchCommand,
  SearchType,
} from "../core/contracts.js";
import { usageError } from "../core/errors.js";

interface ParsedGlobals {
  values: string[];
  pretty: boolean;
  verbose: boolean;
  timeoutMs: number;
  timeoutWasSet: boolean;
  helpRequested: boolean;
  versionRequested: boolean;
}

function requireValue(args: string[], index: number, flag: string): string {
  if (index >= args.length) {
    throw usageError(`Missing value for ${flag}.`);
  }
  const value = args[index];
  if (typeof value !== "string" || value.length === 0) {
    throw usageError(`Missing value for ${flag}.`);
  }
  return value;
}

function positiveInteger(value: string, flag: string, maximum: number): number {
  if (!/^[0-9]+$/.test(value)) {
    throw usageError(`${flag} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > maximum) {
    throw usageError(`${flag} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseGlobals(args: string[]): ParsedGlobals {
  const values: string[] = [];
  let pretty = false;
  let verbose = false;
  let timeoutMs = 0;
  let timeoutWasSet = false;
  let helpRequested = false;
  let versionRequested = false;
  let index = 0;

  while (index < args.length) {
    const value = args[index];
    if (typeof value !== "string") {
      throw usageError("Arguments must be a dense array of strings.");
    }
    if (value === "--pretty") {
      pretty = true;
    } else if (value === "--verbose") {
      verbose = true;
    } else if (value === "--timeout-ms") {
      const raw = requireValue(args, index + 1, value);
      timeoutMs = positiveInteger(raw, value, 86_400_000);
      timeoutWasSet = true;
      index += 1;
    } else if (value === "--help") {
      helpRequested = true;
    } else if (value === "--version") {
      versionRequested = true;
    } else {
      values.push(value);
    }
    index += 1;
  }

  return {
    values,
    pretty,
    verbose,
    timeoutMs,
    timeoutWasSet,
    helpRequested,
    versionRequested,
  };
}

function globalsWithDefault(globals: ParsedGlobals, defaultTimeoutMs: number): GlobalCommandOptions {
  return {
    pretty: globals.pretty,
    verbose: globals.verbose,
    timeoutMs: globals.timeoutWasSet ? globals.timeoutMs : defaultTimeoutMs,
  };
}

function isSearchType(value: string): value is SearchType {
  return (
    value === "auto" ||
    value === "fast" ||
    value === "instant" ||
    value === "deep" ||
    value === "deep-reasoning"
  );
}

function isSearchCategory(value: string): value is SearchCategory {
  return (
    value === "company" ||
    value === "publication" ||
    value === "news" ||
    value === "pdf" ||
    value === "github" ||
    value === "personal-site" ||
    value === "people" ||
    value === "financial-report"
  );
}

function isAgentEffort(value: string): value is AgentEffort {
  return (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "auto"
  );
}

function validAgentId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validUrl(value: string): boolean {
  return (
    (value.startsWith("https://") && value.length > "https://".length) ||
    (value.startsWith("http://") && value.length > "http://".length)
  );
}

function parseSearch(values: string[], globals: ParsedGlobals): SearchCommand {
  const positions: string[] = [];
  let inputPath = "";
  let searchType: SearchType = "auto";
  let numResults = 10;
  let category: SearchCategory | "" = "";
  let convenienceFlagUsed = false;
  let index = 1;

  while (index < values.length) {
    const value = requireValue(values, index, "search argument");
    if (value === "--input") {
      inputPath = requireValue(values, index + 1, value);
      index += 1;
    } else if (value === "--type") {
      const rawType = requireValue(values, index + 1, value);
      if (!isSearchType(rawType)) {
        throw usageError(`Invalid search type: ${rawType}.`);
      }
      searchType = rawType;
      convenienceFlagUsed = true;
      index += 1;
    } else if (value === "--num-results") {
      numResults = positiveInteger(requireValue(values, index + 1, value), value, 100);
      convenienceFlagUsed = true;
      index += 1;
    } else if (value === "--category") {
      const rawCategory = requireValue(values, index + 1, value);
      if (!isSearchCategory(rawCategory)) {
        throw usageError(`Invalid search category: ${rawCategory}.`);
      }
      category = rawCategory;
      convenienceFlagUsed = true;
      index += 1;
    } else if (value.startsWith("--")) {
      throw usageError(`Unknown flag for search: ${value}.`);
    } else {
      positions.push(value);
    }
    index += 1;
  }

  if (inputPath.length > 0 && (positions.length > 0 || convenienceFlagUsed)) {
    throw usageError("--input cannot be mixed with positional or search convenience arguments.");
  }
  if (inputPath.length === 0 && positions.length !== 1) {
    throw usageError("search requires exactly one query or --input.");
  }

  const globalOptions = globalsWithDefault(globals, 300_000);
  return {
    ...globalOptions,
    kind: "search",
    command: "search",
    inputPath,
    query: positions.length === 1 ? positions[0] : "",
    searchType,
    numResults,
    category,
  };
}

function parseFetch(values: string[], globals: ParsedGlobals): FetchCommand {
  const urls: string[] = [];
  let inputPath = "";
  let maxCharacters = 3000;
  let convenienceFlagUsed = false;
  let index = 1;

  while (index < values.length) {
    const value = requireValue(values, index, "fetch argument");
    if (value === "--input") {
      inputPath = requireValue(values, index + 1, value);
      index += 1;
    } else if (value === "--max-characters") {
      maxCharacters = positiveInteger(
        requireValue(values, index + 1, value),
        value,
        100_000_000,
      );
      convenienceFlagUsed = true;
      index += 1;
    } else if (value.startsWith("--")) {
      throw usageError(`Unknown flag for fetch: ${value}.`);
    } else {
      if (!validUrl(value)) {
        throw usageError(`fetch URL must use http or https: ${value}.`);
      }
      urls.push(value);
    }
    index += 1;
  }

  if (inputPath.length > 0 && (urls.length > 0 || convenienceFlagUsed)) {
    throw usageError("--input cannot be mixed with URLs or fetch convenience arguments.");
  }
  if (inputPath.length === 0 && urls.length === 0) {
    throw usageError("fetch requires one or more URLs or --input.");
  }

  const globalOptions = globalsWithDefault(globals, 60_000);
  return {
    ...globalOptions,
    kind: "fetch",
    command: "fetch",
    inputPath,
    urls,
    maxCharacters,
  };
}

function parseAgentRun(values: string[], globals: ParsedGlobals): ParsedCommand {
  const positions: string[] = [];
  let inputPath = "";
  let effort: AgentEffort = "low";
  let previousRunId = "";
  let convenienceFlagUsed = false;
  let index = 2;

  while (index < values.length) {
    const value = requireValue(values, index, "agent run argument");
    if (value === "--input") {
      inputPath = requireValue(values, index + 1, value);
      index += 1;
    } else if (value === "--effort") {
      const rawEffort = requireValue(values, index + 1, value);
      if (!isAgentEffort(rawEffort)) {
        throw usageError(`Invalid Agent effort: ${rawEffort}.`);
      }
      effort = rawEffort;
      convenienceFlagUsed = true;
      index += 1;
    } else if (value === "--previous-run-id") {
      previousRunId = requireValue(values, index + 1, value);
      if (!validAgentId(previousRunId)) {
        throw usageError(`Invalid Agent run ID: ${previousRunId}.`);
      }
      convenienceFlagUsed = true;
      index += 1;
    } else if (value.startsWith("--")) {
      throw usageError(`Unknown flag for agent run: ${value}.`);
    } else {
      positions.push(value);
    }
    index += 1;
  }

  if (inputPath.length > 0 && (positions.length > 0 || convenienceFlagUsed)) {
    throw usageError("--input cannot be mixed with positional or Agent convenience arguments.");
  }
  if (inputPath.length === 0 && positions.length !== 1) {
    throw usageError("agent run requires exactly one query or --input.");
  }

  const globalOptions = globalsWithDefault(globals, 3_900_000);
  return {
    ...globalOptions,
    kind: "agent.run",
    command: "agent.run",
    inputPath,
    query: positions.length === 1 ? positions[0] : "",
    effort,
    previousRunId,
  };
}

function requireAgentId(values: string[], subcommand: string): string {
  if (values.length !== 3) {
    throw usageError(`agent ${subcommand} requires exactly one Agent run ID.`);
  }
  const runId = requireValue(values, 2, `agent ${subcommand}`);
  if (!validAgentId(runId)) {
    throw usageError(`Invalid Agent run ID: ${runId}.`);
  }
  return runId;
}

function parseAgent(values: string[], globals: ParsedGlobals): ParsedCommand {
  if (values.length < 2) {
    throw usageError("agent requires a subcommand.");
  }
  const subcommand = requireValue(values, 1, "agent subcommand");
  if (subcommand === "run") {
    return parseAgentRun(values, globals);
  }
  if (subcommand === "get") {
    const globalOptions = globalsWithDefault(globals, 30_000);
    return {
      ...globalOptions,
      kind: "agent.get",
      command: "agent.get",
      runId: requireAgentId(values, subcommand),
    };
  }
  if (subcommand === "cancel") {
    const globalOptions = globalsWithDefault(globals, 30_000);
    return {
      ...globalOptions,
      kind: "agent.cancel",
      command: "agent.cancel",
      runId: requireAgentId(values, subcommand),
    };
  }
  if (subcommand === "wait") {
    let runId = "";
    let pollIntervalMs = 4000;
    let index = 2;
    while (index < values.length) {
      const value = requireValue(values, index, "agent wait argument");
      if (value === "--poll-interval-ms") {
        pollIntervalMs = positiveInteger(
          requireValue(values, index + 1, value),
          value,
          3_600_000,
        );
        index += 1;
      } else if (value.startsWith("--")) {
        throw usageError(`Unknown flag for agent wait: ${value}.`);
      } else if (runId.length === 0) {
        runId = value;
      } else {
        throw usageError("agent wait accepts exactly one Agent run ID.");
      }
      index += 1;
    }
    if (!validAgentId(runId)) {
      throw usageError(`Invalid Agent run ID: ${runId}.`);
    }
    const globalOptions = globalsWithDefault(globals, 3_900_000);
    return {
      ...globalOptions,
      kind: "agent.wait",
      command: "agent.wait",
      runId,
      pollIntervalMs,
    };
  }
  throw usageError(`Unknown agent subcommand: ${subcommand}.`);
}

function helpTopic(values: string[]): string {
  if (values.length === 0) {
    return "cli";
  }
  if (values[0] === "agent" && values.length > 1) {
    return `agent ${values[1]}`;
  }
  return values[0];
}

export function parseArgs(args: string[]): ParsedCommand {
  const globals = parseGlobals(args);
  const values = globals.values;

  if (globals.versionRequested) {
    if (values.length !== 0 || globals.helpRequested) {
      throw usageError("--version cannot be combined with a command or --help.");
    }
    const globalOptions = globalsWithDefault(globals, 30_000);
    return {
      ...globalOptions,
      kind: "version",
      command: "cli",
    };
  }

  if (globals.helpRequested) {
    const globalOptions = globalsWithDefault(globals, 30_000);
    return {
      ...globalOptions,
      kind: "help",
      command: "cli",
      topic: helpTopic(values),
    };
  }

  if (values.length === 0) {
    throw usageError("A command is required. Use --help for usage.");
  }
  const command = requireValue(values, 0, "command");
  if (command === "search") {
    return parseSearch(values, globals);
  }
  if (command === "fetch") {
    return parseFetch(values, globals);
  }
  if (command === "agent") {
    return parseAgent(values, globals);
  }
  throw usageError(`Unknown command: ${command}.`);
}
