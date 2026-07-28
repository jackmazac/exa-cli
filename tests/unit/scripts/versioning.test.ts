import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { CLI_VERSION } from "../../../src/version.js";

const [major, minor] = CLI_VERSION.split(".").map(Number);

function preview(bump: "major" | "minor"): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/bump-version.ts", "--dry-run", bump],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("release versioning", () => {
  test("previews a minor release without changing files", () => {
    const result = preview("minor");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      bump: "minor",
      currentVersion: CLI_VERSION,
      nextVersion: `${major}.${minor + 1}.0`,
    });
  });

  test("previews a major release without changing files", () => {
    const result = preview("major");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      bump: "major",
      currentVersion: CLI_VERSION,
      nextVersion: `${major + 1}.0.0`,
    });
  });
});
