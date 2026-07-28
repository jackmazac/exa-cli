# Search Input

## Core Fields

| Field | Type | Purpose |
| --- | --- | --- |
| `query` | string | Required natural-language search intent |
| `type` | string | Retrieval and synthesis mode |
| `numResults` | integer | Number of ranked results |
| `category` | string | Optional specialized result index |
| `includeDomains` | string[] | Restrict results to domains, paths, or supported patterns |
| `excludeDomains` | string[] | Exclude domains, paths, or supported patterns |
| `startPublishedDate` | string | ISO 8601 publication-date lower bound |
| `endPublishedDate` | string | ISO 8601 publication-date upper bound |
| `userLocation` | string | Two-letter country code |
| `moderation` | boolean | Request unsafe-content filtering |
| `additionalQueries` | string[] | Extra query variants for deeper modes |
| `systemPrompt` | string | Source and synthesis instructions |
| `outputSchema` | object | JSON Schema for synthesized `output.content` |
| `contents` | object | Per-result extraction settings |

## Result Content

On Search, extraction controls belong inside `contents`:

```json
{
  "query": "battery recycling policy changes",
  "contents": {
    "highlights": true,
    "maxAgeHours": 24
  }
}
```

Choose one primary content mode:

| Field | Use |
| --- | --- |
| `contents.highlights` | Compact, query-relevant excerpts; best general agent default |
| `contents.text` | Broader page text; bound with `maxCharacters` |
| `contents.summary` | Per-result synthesis when Exa-side compression is explicitly needed |

Avoid requesting all three views by default. Summary adds synthesis work per result, while text and highlights return overlapping source views.

Other useful `contents` fields:

- `maxAgeHours`: omit for balanced cache/crawl behavior, `0` for always-live crawling, `-1` for cache only.
- `livecrawlTimeout`: bound live-crawl time in milliseconds.
- `subpages` and `subpageTarget`: retrieve selected linked pages.
- `extras.links` and `extras.imageLinks`: return extracted links.

## Structured Output

Use `systemPrompt` for behavior and `outputSchema` for shape:

```bash
exa search --input - <<'JSON'
{
  "query": "compare recent frontier AI model releases",
  "type": "deep",
  "systemPrompt": "Prefer official sources and avoid duplicate reporting.",
  "outputSchema": {
    "type": "object",
    "properties": {
      "models": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "notableClaims": {
              "type": "array",
              "items": { "type": "string" }
            }
          },
          "required": ["name", "notableClaims"]
        }
      }
    },
    "required": ["models"]
  },
  "contents": {
    "highlights": true
  }
}
JSON
```

Keep schemas compact and bound arrays. Read synthesized content from `data.output.content` and grounding from `data.output.grounding`.
