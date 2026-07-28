# Common Mistakes

| Wrong | Correct |
| --- | --- |
| Reading `results` at the envelope root | Read `data.results` after checking `ok` |
| Mixing a query or URL with `--input` | Choose convenience mode or complete JSON input |
| Passing a credential as an argument | Set `EXA_API_KEY` in the environment |
| Logging the subprocess environment | Log only non-secret command metadata |
| Putting top-level `text` on Search | Put Search extraction under `contents` |
| Wrapping Fetch extraction in `contents` | Keep Fetch `text`, `highlights`, and `summary` at the input root |
| Assuming Fetch HTTP success means every URL succeeded | Inspect `data.statuses` |
| Adding `stream` to Agent input | Let the CLI own Agent streaming |
| Adding `stream` to Search input | Search streaming is not exposed by the CLI |
| Retrying `UPSTREAM_STATE_UNKNOWN` Agent creation | Stop and reconcile the possible upstream run |
| Using Agent for a simple lookup | Start with `exa search` |
| Parsing verbose stderr as JSON | Parse only stdout |

For advanced objects, remember that `--input` forwards unknown fields but does not make unsupported transport modes safe.
