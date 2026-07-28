# Search Output

## Success Envelope

```json
{
  "version": 1,
  "ok": true,
  "command": "search",
  "data": {
    "requestId": "request-id",
    "results": [
      {
        "title": "Example",
        "url": "https://example.com",
        "highlights": ["Relevant excerpt"]
      }
    ]
  }
}
```

Check `ok` before reading:

- `data.results`: ranked sources.
- `data.results[].text`, `highlights`, or `summary`: requested content.
- `data.output`: optional synthesized output.
- `data.costDollars`: cost details when returned.
- `data.searchTime`: latency when returned.

The CLI removes `requestTags` recursively but otherwise preserves future response fields.

## Errors and Retry Behavior

The CLI returns stable error codes in `error.code` and a matching process exit code. It automatically retries connection failures and retryable upstream statuses at most twice, after one and two seconds.

Do not automatically retry:

- invalid input or unsupported field combinations,
- rejected credentials,
- rate limits,
- other non-retryable upstream errors.

When rate limited, inspect `error.retryAfterSeconds`.
