import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";

import { CLI_VERSION } from "../src/version.js";

interface ReleaseTarget {
  name: string;
  scriptcTarget: string;
}

interface PackResult {
  filename: string;
}

interface ReleaseArtifact {
  name: string;
  kind: "native-archive" | "npm-package";
  target: string;
  sha256: string;
}

const releaseDirectory = resolve("dist/release");
const npmArtifactDirectory = resolve("artifacts");
const nativeExecutable = resolve("dist/exa");
const scriptcEntry = resolve("node_modules/scriptc/dist/main.js");
const localBin = resolve("node_modules/.bin");
const targets: ReleaseTarget[] = [
  { name: "darwin-arm64", scriptcTarget: "" },
  { name: "linux-x64", scriptcTarget: "x86_64-linux-gnu.2.36" },
  { name: "linux-arm64", scriptcTarget: "aarch64-linux-gnu.2.36" },
];

function run(
  command: string,
  args: string[],
  environment: Record<string, string>,
): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${localBin}${delimiter}${process.env.PATH ?? ""}`,
      ...environment,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit ${result.status ?? "unknown"}.`);
  }
  return result.stdout;
}

async function sha256(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

function sourceCommit(): string {
  const override = process.env.EXA_RELEASE_COMMIT ?? "";
  const commit = override.length > 0
    ? override
    : run("git", ["rev-parse", "HEAD"], {}).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Release source commit must be a full 40-character Git SHA.");
  }
  return commit;
}

async function main(): Promise<void> {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("Release cross-compilation must run on a macOS arm64 host.");
  }
  const packageDocument = JSON.parse(await readFile("package.json", "utf8")) as {
    name: string;
    version: string;
  };
  if (
    packageDocument.name !== "@jackmazac/exa-cli" ||
    packageDocument.version !== CLI_VERSION
  ) {
    throw new Error("Package identity and CLI version are not synchronized.");
  }

  await rm(releaseDirectory, { recursive: true, force: true });
  await rm(npmArtifactDirectory, { recursive: true, force: true });
  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(npmArtifactDirectory, { recursive: true });

  const artifacts: ReleaseArtifact[] = [];
  let index = 0;
  while (index < targets.length) {
    const target = targets[index];
    const stageDirectory = resolve(releaseDirectory, `stage-${target.name}`);
    const executable = resolve(stageDirectory, "exa");
    await mkdir(dirname(executable), { recursive: true });

    const environment: Record<string, string> = {};
    if (target.scriptcTarget.length > 0) {
      environment.SCRIPTC_CC = "zigcc";
      environment.SCRIPTC_TARGET = target.scriptcTarget;
    }
    const buildOutput = run(
      process.execPath,
      [scriptcEntry, "build", "src/cli.ts", "-o", executable, "--no-keep-c"],
      environment,
    );
    if (buildOutput.length > 0) {
      process.stdout.write(buildOutput);
    }
    await chmod(executable, 0o755);

    const npmExecutable = resolve(npmArtifactDirectory, target.name, "exa");
    await mkdir(dirname(npmExecutable), { recursive: true });
    await copyFile(executable, npmExecutable);
    await chmod(npmExecutable, 0o755);
    if (target.name === "darwin-arm64") {
      await mkdir(dirname(nativeExecutable), { recursive: true });
      await copyFile(executable, nativeExecutable);
      await chmod(nativeExecutable, 0o755);
    }

    const archiveName = `exa-v${CLI_VERSION}-${target.name}.tar.gz`;
    const archivePath = resolve(releaseDirectory, archiveName);
    run("tar", ["-czf", archivePath, "-C", stageDirectory, "exa"], {});
    artifacts.push({
      name: archiveName,
      kind: "native-archive",
      target: target.name,
      sha256: await sha256(archivePath),
    });
    process.stdout.write(`release artifact ${archiveName}: built\n`);
    index += 1;
  }

  const packOutput = run(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", releaseDirectory],
    {},
  );
  const packResults = JSON.parse(packOutput) as PackResult[];
  if (packResults.length !== 1 || typeof packResults[0].filename !== "string") {
    throw new Error("npm pack did not report exactly one package.");
  }
  const packageName = packResults[0].filename;
  if (!packageName.endsWith(".tgz")) {
    throw new Error("npm pack returned a non-tarball filename.");
  }
  const packagePath = resolve(releaseDirectory, packageName);
  artifacts.push({
    name: packageName,
    kind: "npm-package",
    target: "darwin-arm64,linux-x64,linux-arm64",
    sha256: await sha256(packagePath),
  });
  process.stdout.write(`release artifact ${packageName}: built\n`);

  const manifest = {
    schemaVersion: 1,
    package: "@jackmazac/exa-cli",
    version: CLI_VERSION,
    tag: `v${CLI_VERSION}`,
    sourceCommit: sourceCommit(),
    artifacts,
  };
  const manifestName = "release-manifest.json";
  const manifestPath = resolve(releaseDirectory, manifestName);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let checksums = "";
  let artifactIndex = 0;
  while (artifactIndex < artifacts.length) {
    const artifact = artifacts[artifactIndex];
    checksums += `${artifact.sha256}  ${artifact.name}\n`;
    artifactIndex += 1;
  }
  checksums += `${await sha256(manifestPath)}  ${manifestName}\n`;
  await writeFile(resolve(releaseDirectory, "SHA256SUMS"), checksums, "utf8");

  run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/verify-release.ts"], {});
  process.stdout.write("release package and checksums: verified\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown release build failure.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
