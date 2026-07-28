# Contents Output

## Success Envelope

```json
{
  "version": 1,
  "ok": true,
  "command": "fetch",
  "data": {
    "results": [
      {
        "url": "https://example.com",
        "text": "Extracted page text"
      }
    ],
    "statuses": [
      {
        "id": "https://example.com",
        "status": "success"
      }
    ]
  }
}
```

Useful fields:

- `data.requestId`: request identifier.
- `data.results`: extracted page objects.
- `data.results[].text`, `highlights`, or `summary`: requested content.
- `data.results[].subpages`: returned subpage objects.
- `data.results[].extras.links`: extracted links.
- `data.statuses`: per-URL outcomes.
- `data.costDollars`: cost details when returned.

## Partial URL Failures

Inspect every status even when `ok` is true. A failed status may include an error tag and an associated HTTP status.

Common error categories include:

- crawl not found,
- crawl timeout,
- live-crawl timeout,
- source unavailable,
- unsupported URL,
- unknown crawl failure.

Match results and statuses by URL or identifier rather than assuming array positions align.

## Command Failures

For command-level failures, the envelope has `ok: false` and an `error` object. The process exit code distinguishes usage, credentials, rate limits, upstream failures, transport failures, and interruption.

The CLI automatically retries connection failures and retryable upstream statuses at most twice, after one and two seconds. It does not automatically retry invalid input, rejected credentials, or rate limits. When rate limited, inspect `error.retryAfterSeconds`.
