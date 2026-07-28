# Exa CLI

A stateless, JSON-first native command-line interface for Exa Search, Contents, and Agent, plus three agent skills tailored to the CLI.

The `exa` executable is written in TypeScript and compiled with [`scriptc`](https://github.com/vercel-labs/scriptc) into native binaries. Runtime use does not require Node.js, a JavaScript engine, a daemon, MCP, a credential store, or `node_modules`.

## Supported platforms

| Platform | Release target |
| --- | --- |
| macOS Apple Silicon | `darwin-arm64` |
| Linux x86_64, glibc 2.36+ | `linux-x64` |
| Linux arm64, glibc 2.36+ | `linux-arm64` |

Windows and macOS Intel are not supported in this release line.

## Install the native binary

### GitHub release archive

Download the archive for the host from the [latest release](https://github.com/jackmazac/exa-cli/releases/latest), verify it, and place `exa` on `PATH`.

Example for macOS Apple Silicon:

```bash
VERSION=4.0.0
gh release download "v${VERSION}" \
  --repo jackmazac/exa-cli \
  --pattern "exa-v${VERSION}-darwin-arm64.tar.gz" \
  --pattern SHA256SUMS
grep "exa-v${VERSION}-darwin-arm64.tar.gz" SHA256SUMS | shasum -a 256 -c -
tar -xzf "exa-v${VERSION}-darwin-arm64.tar.gz"
install -m 0755 exa "$HOME/.local/bin/exa"
exa --version
```

Verify an immutable GitHub release and its downloaded asset:

```bash
gh release verify "v${VERSION}" --repo jackmazac/exa-cli
gh release verify-asset "v${VERSION}" \
  "exa-v${VERSION}-darwin-arm64.tar.gz" \
  --repo jackmazac/exa-cli
```

### Binary npm package

Each release also contains `jackmazac-exa-cli-<version>.tgz`. It packages all three native targets and installs the matching binary:

```bash
gh release download "v${VERSION}" \
  --repo jackmazac/exa-cli \
  --pattern "jackmazac-exa-cli-${VERSION}.tgz"
npm install --global \
  --allow-scripts=@jackmazac/exa-cli \
  "./jackmazac-exa-cli-${VERSION}.tgz"
exa --version
```

The explicit script approval allows the reviewed installer to select the host binary under current and future npm install-script policies. Node.js is used only by that installer; the installed `exa` command is native.

## Authentication

Create an Exa API key and set it in the environment:

```bash
export EXA_API_KEY="your_api_key_here"
```

Never put the key in command arguments, JSON input, committed environment files, or logs. `EXA_SOURCE` is optional integration attribution.

## Commands

```text
exa search <query> [options]
exa search --input <file|->
exa fetch <url>... [options]
exa fetch --input <file|->
exa agent run <query> [options]
exa agent run --input <file|->
exa agent get <agent_run_id>
exa agent wait <agent_run_id> [--poll-interval-ms 4000]
exa agent cancel <agent_run_id>
```

Global options:

```text
--pretty
--timeout-ms <integer>
--verbose
--help
--version
```

### Search

```bash
exa search "recent grid-scale battery deployments" \
  --type fast \
  --num-results 5
```

Advanced request object:

```bash
exa search --input - <<'JSON'
{
  "query": "recent grid-scale battery deployments",
  "type": "deep",
  "numResults": 8,
  "contents": {
    "highlights": true,
    "maxAgeHours": 24
  }
}
JSON
```

### Fetch known URLs

```bash
exa fetch "https://exa.ai/docs/reference/search" \
  --max-characters 3000
```

Advanced Contents request:

```bash
exa fetch --input - <<'JSON'
{
  "urls": ["https://exa.ai/docs/reference/search"],
  "highlights": {
    "query": "request fields and defaults"
  },
  "maxAgeHours": 24
}
JSON
```

### Agent

```bash
exa agent run \
  "Compare five grid-storage technologies with cited evidence." \
  --effort low
```

If a known run is still active:

```bash
exa agent get agent_run_123
exa agent wait agent_run_123 --poll-interval-ms 4000
exa agent cancel agent_run_123
```

Agent creation can incur paid work. Do not blindly retry after `UPSTREAM_STATE_UNKNOWN`; the upstream run may have been created before the connection failed.

## JSON contract

Every invocation writes one newline-terminated JSON envelope to stdout.

Success:

```json
{
  "version": 1,
  "ok": true,
  "command": "search",
  "data": {
    "results": []
  }
}
```

Failure:

```json
{
  "version": 1,
  "ok": false,
  "command": "search",
  "error": {
    "code": "RATE_LIMITED",
    "message": "Request was rate limited.",
    "status": 429,
    "retryAfterSeconds": 10
  }
}
```

| Exit | Meaning |
| --- | --- |
| `0` | Success, including a known Agent run that remains queued or running |
| `2` | Usage or input validation |
| `3` | Missing or rejected credentials |
| `4` | Rate limit or Agent concurrency limit |
| `5` | Other upstream failure |
| `6` | Network, timeout, malformed response, or unknown upstream state |
| `130` | SIGINT |

Stdout is reserved for the envelope. Verbose diagnostics and Agent progress go to stderr.

## Agent skills

The repository ships:

- [`build-with-exa`](skills/build-with-exa/SKILL.md): choose a supported Exa surface and integrate `exa` as a JSON subprocess.
- [`exa-search`](skills/exa-search/SKILL.md): Search modes, filters, result content, structured output, and response handling.
- [`exa-contents`](skills/exa-contents/SKILL.md): known-URL extraction, freshness, subpages, extras, and per-URL statuses through `exa fetch`.

Install all three into Codex:

```bash
python3 /path/to/install-skill-from-github.py \
  --repo jackmazac/exa-cli \
  --path skills/build-with-exa skills/exa-search skills/exa-contents \
  --dest "$HOME/.codex/skills"
```

Use the same command with these destinations for other agents:

```text
~/.claude/skills
~/.pi/agent/skills
```

Restart or begin a new agent session after installation.

## Release integrity

Every release publishes:

- `exa-v<version>-darwin-arm64.tar.gz`
- `exa-v<version>-linux-x64.tar.gz`
- `exa-v<version>-linux-arm64.tar.gz`
- `jackmazac-exa-cli-<version>.tgz`
- `release-manifest.json`
- `SHA256SUMS`

`release-manifest.json` binds every artifact SHA-256 to the exact 40-character source commit. `SHA256SUMS` covers every artifact and the manifest. GitHub Actions creates Sigstore-backed artifact attestations with `actions/attest`.

The repository is configured for immutable GitHub Releases. A release is created as a draft with all assets attached, then published; after publication, its tag and assets cannot be changed.

## Versioning and releases

The package uses semantic versions:

- Major: breaking CLI or envelope behavior.
- Minor: backwards-compatible commands, options, API coverage, or skills.

Preview or write a version bump:

```bash
npx tsx scripts/bump-version.ts --dry-run minor
npm run version:minor
npm run version:major
```

The script updates `package.json`, `package-lock.json`, and `src/version.ts` together.

Release options:

1. Run the **Release native CLI** workflow manually and choose `minor` or `major`. The workflow commits the synchronized version, creates the exact tag, runs all gates, builds and attests assets, and publishes the immutable release.
2. Push an exact `v<major>.<minor>.<patch>` tag matching `package.json`. The same build and publication gates run without changing the version.

## Development

Requires Node.js 24 and macOS arm64 for the complete cross-platform release build.

```bash
npm ci
npm run typecheck
npm test
npm run native:coverage
npm run native:build
npm run test:native
npm run release:artifacts
npm run release:verify
```

`npm run ci` runs typecheck, Vitest, fully-static `scriptc` coverage, native compilation, Node/native differential fixtures, and native dependency isolation checks.

## Security

- Credentials are accepted only through `EXA_API_KEY`.
- Plain HTTP API base URLs are accepted only for loopback integration tests.
- Request headers and credentials are never serialized into CLI error envelopes.
- Secret and Git-history scans are release gates.
- Report security issues privately through the repository’s GitHub security advisory page.

## License

MIT
