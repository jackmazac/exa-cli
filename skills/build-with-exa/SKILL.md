---
name: build-with-exa
description: Use when building applications or agents that need Exa web search, known-URL extraction, or long-running research through the native stateless exa CLI.
---

# Build with Exa CLI

## Overview

Use `exa` as a JSON subprocess. Each invocation performs one bounded workflow, emits one envelope, and exits. It has no daemon, session, credential store, cache, or background process.

Only three Exa surfaces are available:

| Need | Command |
| --- | --- |
| Discover and rank web sources | `exa search` |
| Extract content from known URLs | `exa fetch` |
| Run multi-step research or enrichment | `exa agent run` |

Default to Search; reserve Agent for multi-step research.

## Prerequisites

Confirm installation and set the credential:

```bash
exa --version
export EXA_API_KEY="your_api_key_here"
```

Never pass the API key on the command line, place it in JSON input, log the environment, or embed it in source code.

## Choose an Invocation Mode

Use convenience arguments for common calls:

```bash
exa search "latest grid-scale battery developments" --num-results 5
exa fetch "https://example.com/report" --max-characters 5000
exa agent run "Compare five storage technologies with evidence." --effort low
```

Use `--input <file|->` for advanced fields. `-` reads one object from stdin:

```bash
exa search --input - <<'JSON'
{
  "query": "recent grid-scale battery deployments",
  "type": "deep",
  "numResults": 8,
  "contents": { "highlights": true }
}
JSON
```

Do not mix `--input` with positional arguments or command-specific convenience flags. Global flags such as `--pretty`, `--verbose`, and `--timeout-ms` may still be used.

Unknown input fields are forwarded. The CLI still owns transport: omit Search streaming and Agent `stream`.

## Consume the Envelope

Stdout contains one newline-terminated document:

```json
{
  "version": 1,
  "ok": true,
  "command": "search",
  "data": { "results": [] }
}
```

Failures replace `data` with `error`. Read fields under `data`, check the exit status and `ok`, and keep stderr separate. See [CLI contract](references/cli-contract.md) for defaults, errors, and exit codes.

## Integrate with an Application

Spawn `exa` without a shell, send JSON through stdin, and parse stdout. Preserve `EXA_API_KEY`, but never serialize the environment.

See [process integration](references/process-integration.md) for a complete TypeScript example.

## Agent Lifecycle

`exa agent run` normally waits for a terminal result. If it returns a known running ID, continue with:

```bash
exa agent get agent_run_123
exa agent wait agent_run_123 --poll-interval-ms 4000
exa agent cancel agent_run_123
```

Never repeat Agent creation after `UPSTREAM_STATE_UNKNOWN`. See [Agent workflows](references/agent.md).

## Surface-Specific Guidance

- Use the `exa-search` skill for Search request fields, modes, filters, and result handling.
- Use the `exa-contents` skill for known-URL extraction, freshness, and per-URL statuses.
- Read [common mistakes](references/common-mistakes.md) before constructing advanced `--input` objects.

## Boundaries

The CLI does not expose Answer, Context, Monitors, Websets, compatibility endpoints, arbitrary endpoints, or Search streaming. Do not simulate them with undocumented flags.
