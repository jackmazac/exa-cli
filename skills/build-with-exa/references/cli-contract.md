# CLI Contract

## Commands

```text
exa search <query> [options]
exa search --input <file|->
exa fetch <url>... [options]
exa fetch --input <file|->
exa agent run <query> [options]
exa agent run --input <file|->
exa agent get <agent_run_id>
exa agent wait <agent_run_id> [--poll-interval-ms 4000]
exa agent cancel <agent_run_id>
```

Global options:

| Option | Meaning |
| --- | --- |
| `--pretty` | Indent the stdout envelope by two spaces |
| `--timeout-ms <integer>` | Override the command deadline |
| `--verbose` | Send request and Agent progress diagnostics to stderr |
| `--help` | Emit a JSON help envelope |
| `--version` | Emit a JSON version envelope |

## Defaults

| Command | Request defaults | Deadline |
| --- | --- | --- |
| Search | `type: "auto"`, `numResults: 10`, `contents.highlights: true` | 300 seconds |
| Fetch | `text.maxCharacters: 3000` | 60 seconds |
| Agent run | `effort: "low"` | 65 minutes |
| Agent wait | poll every 4 seconds | 65 minutes |
| Agent get/cancel | none | 30 seconds |

## Input Rules

- `--input -` reads one JSON object from stdin.
- `--input <file>` reads one JSON object from that file.
- Do not mix `--input` with positional values or command-specific convenience flags.
- Unknown fields inside the object are forwarded.
- Global flags remain valid with `--input`.
- Agent input must not contain `stream`; the CLI owns Agent streaming.
- Search streaming is not exposed by this CLI. Omit `stream` from Search input.

## Envelope

Every invocation emits one JSON document followed by a newline. Success:

```json
{
  "version": 1,
  "ok": true,
  "command": "fetch",
  "data": {}
}
```

Failure:

```json
{
  "version": 1,
  "ok": false,
  "command": "fetch",
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "The upstream request failed.",
    "status": 500
  }
}
```

`data` preserves the sanitized API response. The CLI recursively removes `requestTags`. Optional error fields include `requestId` and `retryAfterSeconds`.

## Exit Codes

| Exit code | Meaning |
| --- | --- |
| `0` | Successful operation, including a known Agent run that is still queued or running |
| `2` | Usage or input validation error |
| `3` | Missing or rejected credentials |
| `4` | Rate limit or Agent concurrency limit |
| `5` | Other upstream failure |
| `6` | Network failure, timeout, malformed response, or unknown upstream state |
| `130` | Interrupted by SIGINT |

Exit code and envelope are complementary. Branch on the exit code for coarse process control and on `error.code` for stable application behavior.

## Output Isolation

- Stdout is always the envelope.
- Stderr is silent on success unless `--verbose` is set.
- Diagnostics and progress never belong in a JSON parser reading stdout.
- Do not log the child environment, invocation secrets, or full error objects from the process launcher.
