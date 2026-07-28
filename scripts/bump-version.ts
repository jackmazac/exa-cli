import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Bump = "major" | "minor";

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

function parseVersion(version: string): [number, number, number] {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version);
  if (match === null) {
    throw new Error(`Expected a stable semantic version, received ${version}.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function nextVersion(version: string, bump: Bump): string {
  const [major, minor] = parseVersion(version);
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  return `${major}.${minor + 1}.0`;
}

function parseArguments(args: string[]): { write: boolean; bump: Bump } {
  if (args.length !== 2 || (args[0] !== "--dry-run" && args[0] !== "--write")) {
    throw new Error("Usage: bump-version.ts <--dry-run|--write> <major|minor>");
  }
  const bump = args[1];
  if (bump !== "major" && bump !== "minor") {
    throw new Error("Version bump must be major or minor.");
  }
  return { write: args[0] === "--write", bump };
}

function readSourceVersion(contents: string): string {
  const match = /export const CLI_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)";/.exec(contents);
  if (match === null) {
    throw new Error("src/version.ts does not contain CLI_VERSION.");
  }
  return match[1];
}

function updateSourceVersion(contents: string, current: string, next: string): string {
  const versionLine = `export const CLI_VERSION = "${current}";`;
  const userAgentLine = `export const CLI_USER_AGENT = "exa-cli/${current}";`;
  if (!contents.includes(versionLine) || !contents.includes(userAgentLine)) {
    throw new Error("src/version.ts is not synchronized with package.json.");
  }
  return contents
    .replace(versionLine, `export const CLI_VERSION = "${next}";`)
    .replace(userAgentLine, `export const CLI_USER_AGENT = "exa-cli/${next}";`);
}

async function main(): Promise<void> {
  const { write, bump } = parseArguments(process.argv.slice(2));
  const packagePath = resolve("package.json");
  const lockPath = resolve("package-lock.json");
  const sourcePath = resolve("src/version.ts");

  const packageDocument = JSON.parse(await readFile(packagePath, "utf8")) as PackageDocument;
  const lockDocument = JSON.parse(await readFile(lockPath, "utf8")) as LockDocument;
  const sourceContents = await readFile(sourcePath, "utf8");
  const currentVersion = packageDocument.version;

  if (
    lockDocument.version !== currentVersion ||
    lockDocument.packages[""].version !== currentVersion ||
    readSourceVersion(sourceContents) !== currentVersion
  ) {
    throw new Error("package.json, package-lock.json, and src/version.ts versions differ.");
  }

  const next = nextVersion(currentVersion, bump);
  if (write) {
    packageDocument.version = next;
    lockDocument.version = next;
    lockDocument.packages[""].version = next;
    await writeFile(packagePath, `${JSON.stringify(packageDocument, null, 2)}\n`, "utf8");
    await writeFile(lockPath, `${JSON.stringify(lockDocument, null, 2)}\n`, "utf8");
    await writeFile(sourcePath, updateSourceVersion(sourceContents, currentVersion, next), "utf8");
  }

  process.stdout.write(
    `${JSON.stringify({ bump, currentVersion, nextVersion: next })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown versioning failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
