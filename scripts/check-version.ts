import { readFile } from "node:fs/promises";

import { CLI_USER_AGENT, CLI_VERSION } from "../src/version.js";

interface PackageDocument {
  name: string;
  version: string;
}

interface LockDocument {
  name: string;
  version: string;
  packages: {
    "": {
      name: string;
      version: string;
    };
  };
}

async function main(): Promise<void> {
  const packageDocument = JSON.parse(await readFile("package.json", "utf8")) as PackageDocument;
  const lockDocument = JSON.parse(await readFile("package-lock.json", "utf8")) as LockDocument;
  const expectedName = "@jackmazac/exa-cli";
  if (
    packageDocument.name !== expectedName ||
    lockDocument.name !== expectedName ||
    lockDocument.packages[""].name !== expectedName
  ) {
    throw new Error("Package identity differs between package.json and package-lock.json.");
  }
  if (
    packageDocument.version !== CLI_VERSION ||
    lockDocument.version !== CLI_VERSION ||
    lockDocument.packages[""].version !== CLI_VERSION ||
    CLI_USER_AGENT !== `exa-cli/${CLI_VERSION}`
  ) {
    throw new Error("CLI, package, lockfile, and user-agent versions differ.");
  }
  process.stdout.write(`version ${CLI_VERSION}: synchronized\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown version check failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
