---
name: exa-search
description: Use when an agent needs semantic web discovery, ranked sources, Search filters, result content, or structured Search output through the native stateless exa CLI.
---

# Exa Search CLI

## Overview

Use `exa search` to discover and rank web sources. The command emits one JSON envelope to stdout and exits; successful API response fields are under `data`.

Set the credential in the environment:

```bash
export EXA_API_KEY="your_api_key_here"
```

Never put the credential in an argument, request object, source file, or log.

## Quick Start

Default search:

```bash
exa search "latest developments in LLM evaluation"
```

The convenience form defaults to `type: "auto"`, `numResults: 10`, and `contents.highlights: true`.

Bounded low-latency search:

```bash
exa search "recent AI infrastructure funding" \
  --type fast \
  --num-results 5 \
  --category news \
  --timeout-ms 30000
```

Use `--pretty` only for inspection. Automation should accept compact or pretty JSON rather than depend on whitespace.

## Convenience Options

| Option | Accepted values | Default |
| --- | --- | --- |
| `--type` | `auto`, `fast`, `instant`, `deep`, `deep-reasoning` | `auto` |
| `--num-results` | integer from 1 to 100 | `10` |
| `--category` | `company`, `publication`, `news`, `pdf`, `github`, `personal-site`, `people`, `financial-report` | none |

Choose:

- `auto` for general retrieval.
- `fast` for low-latency agent and product loops.
- `instant` for the lowest-latency interactive path.
- `deep` for multi-step discovery and synthesis.
- `deep-reasoning` for the most ambiguous research tasks.

## Advanced Search Input

Use `--input <file|->` when the request needs fields beyond the convenience options. `-` reads one complete Search request object from stdin:

```bash
exa search --input - <<'JSON'
{
  "query": "AI regulation policy updates",
  "type": "auto",
  "category": "news",
  "numResults": 10,
  "includeDomains": ["reuters.com", "bbc.com"],
  "startPublishedDate": "2026-01-01",
  "contents": {
    "text": {
      "maxCharacters": 2000
    },
    "maxAgeHours": 24,
    "livecrawlTimeout": 12000
  }
}
JSON
```

Do not mix `--input` with a positional query, `--type`, `--num-results`, or `--category`. Global flags such as `--timeout-ms`, `--verbose`, and `--pretty` remain valid.

Unknown request fields are forwarded, which lets new API fields work without a CLI release. The CLI validates the input as a JSON object; the upstream service remains authoritative for field combinations.

Search streaming is not exposed by this CLI. Omit `stream`; the Search command expects one JSON response.

## Advanced Fields and Results

Read [Search input](references/search-input.md) when using result content, freshness, structured output, domain/date filters, subpages, or extras.

Read [Search output](references/search-output.md) before implementing envelope parsing, retry handling, costs, or grounding.

## Critical Mistakes

- Do not place `text`, `highlights`, or `summary` at the request root; nest them in `contents`.
- Do not read `results` at the envelope root; read `data.results`.
- Do not use `--input` for a partial patch; it is the complete request object.
- Do not mix `--input` with convenience fields.
- Do not add Search streaming.
- Do not request multiple content modes without a concrete need.
- Do not assume every category supports every filter; let a rejected combination fail visibly and adjust the request.
