---
name: exa-contents
description: Use when an agent already has URLs and needs page text, highlights, summaries, freshness controls, subpages, links, or per-URL statuses through the native stateless exa CLI.
---

# Exa Contents CLI

## Overview

The Contents surface is `exa fetch`. Use it when URLs are known and the task needs page extraction without another search.

Set the credential in the environment:

```bash
export EXA_API_KEY="your_api_key_here"
```

Never place the credential in command arguments, input JSON, source code, or logs.

## Quick Start

Fetch one or more URLs:

```bash
exa fetch \
  "https://example.com/report" \
  "https://example.org/analysis"
```

Convenience mode requests text with `text.maxCharacters: 3000`. Override the per-page text budget:

```bash
exa fetch "https://example.com/report" \
  --max-characters 5000 \
  --timeout-ms 30000
```

The command emits one JSON envelope. Read extracted pages from `data.results`.

## Advanced Input

Use `--input <file|->` for highlights, summaries, freshness, subpages, or extras. `-` reads one complete request object from stdin:

```bash
exa fetch --input - <<'JSON'
{
  "urls": ["https://example.com/report"],
  "highlights": {
    "query": "methodology and findings",
    "maxCharacters": 1500
  },
  "maxAgeHours": 24,
  "livecrawlTimeout": 12000
}
JSON
```

Do not mix `--input` with positional URLs or `--max-characters`. Global flags such as `--timeout-ms`, `--verbose`, and `--pretty` remain valid.

Unknown fields are forwarded. The CLI validates an object; the upstream service remains authoritative for field combinations.

Contents does not support streaming. Omit `stream`.

## Choose One Content Mode

On Contents input, `text`, `highlights`, and `summary` are top-level fields:

| Mode | Use |
| --- | --- |
| `highlights` | Compact source excerpts for agents and factual lookups |
| `text` | Broad page context, bounded with `maxCharacters` |
| `summary` | Exa-side per-page compression or structured extraction |

Choose one by default. Multiple modes return overlapping views and may add latency or synthesis work.

Read [Contents input](references/contents-input.md) for freshness, subpages, extras, and advanced field shapes.

## Inspect Every URL Status

A successful envelope can contain a mixture of successful and failed URLs. Always inspect both:

- `data.results` for returned page content.
- `data.statuses` for per-URL success or error states.

Do not treat process exit `0` as proof that every requested URL was extracted. Read [Contents output](references/contents-output.md) for the response contract and retry behavior.

## Search or Fetch?

- Need discovery or ranking: use `exa search`.
- Already know the URLs: use `exa fetch`.
- Need compact excerpts while searching: request Search `contents.highlights`; do not add a redundant Fetch call.
- Need a second extraction policy for selected Search results: pass those URLs to a new Fetch invocation.

## Critical Mistakes

- Do not wrap `text`, `highlights`, or `summary` in a `contents` object; that nesting belongs to Search.
- Do not read `results` or `statuses` at the envelope root.
- Do not assume every URL succeeded because the command exited `0`.
- Do not mix `--input` with convenience arguments.
- Do not send `stream`.
- Do not request multiple content modes without a concrete need.
- Do not use a huge unbounded text request when a smaller `maxCharacters` budget suffices.
