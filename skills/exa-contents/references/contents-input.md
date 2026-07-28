# Contents Input

## Core Fields

| Field | Type | Purpose |
| --- | --- | --- |
| `urls` | string[] | URLs to extract |
| `text` | boolean or object | Full page text |
| `highlights` | boolean or object | Key excerpts |
| `summary` | boolean or object | Per-page synthesis |
| `maxAgeHours` | integer | Freshness policy |
| `livecrawlTimeout` | integer | Live-crawl timeout in milliseconds |
| `subpages` | integer | Number of linked subpages to crawl |
| `subpageTarget` | string or string[] | Terms used to choose relevant subpages |
| `extras.links` | integer | Number of links to extract |
| `extras.imageLinks` | integer | Number of image URLs to extract |

## Text Options

Object-form `text` supports:

- `maxCharacters` to bound returned text.
- `includeHtmlTags` to retain tags.
- `verbosity` with `compact`, `standard`, or `full`.
- `includeSections` and `excludeSections` for page regions.

Example:

```bash
exa fetch --input - <<'JSON'
{
  "urls": ["https://docs.example.com"],
  "text": {
    "maxCharacters": 5000,
    "verbosity": "compact",
    "excludeSections": ["navigation", "footer"]
  }
}
JSON
```

## Highlights and Summary

Object-form `highlights` can include a guiding `query` and a `maxCharacters` budget. Bare `highlights: true` is a strong agent default.

Object-form `summary` can include a guiding `query` and a JSON `schema`. Summary adds synthesis work per page, so request it deliberately.

## Freshness

| `maxAgeHours` | Behavior |
| --- | --- |
| omitted | Balanced cache-first behavior with crawl fallback |
| positive integer | Accept cache younger than that age, otherwise crawl |
| `0` | Always live crawl |
| `-1` | Cache only |

Set `livecrawlTimeout` when live crawling must stay within a fixed budget.

## Subpages and Extras

```bash
exa fetch --input - <<'JSON'
{
  "urls": ["https://docs.example.com"],
  "text": {
    "maxCharacters": 5000
  },
  "subpages": 8,
  "subpageTarget": ["api", "reference", "guide"],
  "extras": {
    "links": 10,
    "imageLinks": 5
  }
}
JSON
```

Start with a small subpage count. Use `subpageTarget` so linked-page selection reflects the task.
