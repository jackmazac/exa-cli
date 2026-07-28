# Agent Workflows

## Choose Agent Deliberately

Use Agent for multi-step research, list-building, enrichment, structured extraction, or follow-up work over a completed run. Prefer `exa search` for ordinary retrieval and lower latency.

## Create a Run

Convenience mode:

```bash
exa agent run \
  "Find five recently launched developer tools for evaluating AI agents." \
  --effort low
```

Advanced structured mode:

```bash
exa agent run --input - <<'JSON'
{
  "query": "Find five recently launched developer tools for evaluating AI agents.",
  "effort": "low",
  "outputSchema": {
    "type": "object",
    "properties": {
      "tools": {
        "type": "array",
        "maxItems": 5,
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "url": { "type": "string", "format": "uri" }
          },
          "required": ["name", "url"]
        }
      }
    },
    "required": ["tools"]
  }
}
JSON
```

Do not include `stream`; the CLI creates and consumes the event stream. Bound arrays with `maxItems` so result size and enrichment work stay predictable.

## Interpret Creation Results

Normally `agent run` stays connected until the run completes, fails, or is cancelled. A completed result is under `data`.

If the stream closes after the CLI learns the run ID, the CLI returns success with a known ID and a queued or running status. Save that ID and continue:

```bash
exa agent wait agent_run_123 --poll-interval-ms 4000
```

If creation fails before an ID arrives, the CLI emits `UPSTREAM_STATE_UNKNOWN`. The upstream run may exist. Do not blindly retry because a second paid run could be created.

## Inspect, Wait, and Cancel

```bash
exa agent get agent_run_123
exa agent wait agent_run_123 --poll-interval-ms 4000
exa agent cancel agent_run_123
```

- `get` performs one status read.
- `wait` polls until completion, failure, cancellation, or its deadline.
- `cancel` requests upstream cancellation.
- SIGINT during `agent run` attempts one bounded upstream cancellation if an ID is known.
- SIGINT during `get` or `wait` stops only the local invocation.

## Follow Up

Use convenience mode:

```bash
exa agent run \
  "Narrow that result to companies hiring in San Francisco." \
  --previous-run-id agent_run_123 \
  --effort low
```

Or set `previousRunId` in an advanced input object. The prior run must be completed and accessible to the same account.

## Retention

Zero-data-retention runs must be consumed from the live `agent run` stream and generally cannot be recovered later with `agent wait`. Design the caller to retain the returned terminal data when ZDR applies.
