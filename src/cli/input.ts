import { readFileSync } from "node:fs";

import type { CommandName, JsonObject } from "../core/contracts.js";
import { CliError } from "../core/errors.js";

function containsOwnField(value: JsonObject, wanted: string): boolean {
  const keys = Object.keys(value);
  let index = 0;
  while (index < keys.length) {
    if (keys[index] === wanted) {
      return true;
    }
    index += 1;
  }
  return false;
}

export function parseInputDocument(document: string, command: CommandName): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw new CliError("INVALID_INPUT", "Input must be one valid JSON document.", command);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("INVALID_INPUT", "Input must be a JSON object.", command);
  }

  const object = parsed as JsonObject;
  if (command === "agent.run" && containsOwnField(object, "stream")) {
    throw new CliError(
      "INVALID_INPUT",
      "agent run --input rejects the stream field because the CLI owns streaming.",
      command,
    );
  }
  return object;
}

async function readStdinDocument(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function readInputDocument(
  path: string,
  command: CommandName,
): Promise<JsonObject> {
  let document = "";
  try {
    document = path === "-" ? await readStdinDocument() : readFileSync(path, "utf8");
  } catch {
    throw new CliError(
      "INVALID_INPUT",
      path === "-" ? "Could not read JSON from stdin." : `Could not read input file: ${path}.`,
      command,
    );
  }
  return parseInputDocument(document, command);
}
