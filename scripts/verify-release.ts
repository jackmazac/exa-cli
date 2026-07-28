import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { CLI_VERSION } from "../src/version.js";

interface ManifestArtifact {
  name: string;
  sha256: string;
}

interface ReleaseManifest {
  schemaVersion: number;
  package: string;
  version: string;
  tag: string;
  sourceCommit: string;
  artifacts: ManifestArtifact[];
}

async function sha256(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

function safeName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".."
  );
}

async function main(): Promise<void> {
  const releaseDirectory = resolve("dist/release");
  const checksumText = await readFile(resolve(releaseDirectory, "SHA256SUMS"), "utf8");
  const checksumLines = checksumText.trim().split("\n");
  const checksums = new Map<string, string>();

  for (const line of checksumLines) {
    const match = /^([0-9a-f]{64})  ([^/\\]+)$/.exec(line);
    if (match === null || !safeName(match[2]) || checksums.has(match[2])) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    checksums.set(match[2], match[1]);
    const actual = await sha256(resolve(releaseDirectory, match[2]));
    if (actual !== match[1]) {
      throw new Error(`Checksum mismatch for ${match[2]}.`);
    }
  }

  const manifest = JSON.parse(
    await readFile(resolve(releaseDirectory, "release-manifest.json"), "utf8"),
  ) as ReleaseManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.package !== "@jackmazac/exa-cli" ||
    manifest.version !== CLI_VERSION ||
    manifest.tag !== `v${CLI_VERSION}` ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)
  ) {
    throw new Error("Release manifest metadata is invalid.");
  }

  const expectedNames = new Set<string>(["release-manifest.json"]);
  for (const artifact of manifest.artifacts) {
    if (!safeName(artifact.name) || !/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      throw new Error("Release manifest contains an invalid artifact.");
    }
    if (checksums.get(artifact.name) !== artifact.sha256) {
      throw new Error(`Manifest checksum mismatch for ${artifact.name}.`);
    }
    expectedNames.add(artifact.name);
  }

  if (expectedNames.size !== checksums.size) {
    throw new Error("SHA256SUMS and release manifest contain different file sets.");
  }
  process.stdout.write(`verified ${manifest.artifacts.length} release artifacts\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown release verification failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
