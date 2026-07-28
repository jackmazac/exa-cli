# Process Integration

## TypeScript Pattern

Spawn the executable directly, write one request object to stdin, parse one stdout document, and treat nonzero exits as structured failures.

```typescript
import { spawn } from "node:child_process";

type ExaEnvelope =
  | { version: 1; ok: true; command: string; data: unknown }
  | {
      version: 1;
      ok: false;
      command: string;
      error: {
        code: string;
        message: string;
        status?: number;
        requestId?: string;
        retryAfterSeconds?: number;
      };
    };

export async function exaSearch(
  input: Record<string, unknown>,
): Promise<ExaEnvelope> {
  const child = spawn("exa", ["search", "--input", "-"], {
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  child.stdin.end(`${JSON.stringify(input)}\n`);

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 6));
  });

  let envelope: ExaEnvelope;
  try {
    envelope = JSON.parse(stdout) as ExaEnvelope;
  } catch {
    throw new Error(`exa emitted invalid JSON (exit ${exitCode})`);
  }

  if (exitCode !== 0 || !envelope.ok) {
    const code = envelope.ok ? "PROCESS_ERROR" : envelope.error.code;
    throw new Error(`exa failed with ${code} (exit ${exitCode})`);
  }

  if (stderr.length > 0) {
    // Forward diagnostics only to a protected debug sink.
  }
  return envelope;
}
```

Call it with the exact Search request shape:

```typescript
const response = await exaSearch({
  query: "recent battery policy changes in the EU",
  type: "auto",
  numResults: 5,
  contents: { highlights: true },
});

if (response.ok) {
  console.log(response.data);
}
```

## Process Rules

- Keep `shell: false`; query text and filenames must be distinct argument-array elements.
- Inherit or explicitly set `EXA_API_KEY`, but never print the environment.
- Bound the child with the CLI `--timeout-ms` option and an application-level supervisor when needed.
- Parse stdout only after the process closes.
- Handle exit code `130` as cancellation, not an upstream failure.
- Use the envelope error code for retry decisions.
- Never retry Agent creation automatically after `UPSTREAM_STATE_UNKNOWN`.
