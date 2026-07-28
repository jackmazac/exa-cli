import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

function preview(bump: "major" | "minor"): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/bump-version.ts", "--dry-run", bump],
    { cwd: process.cwd(), encoding: "utf8" },
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
      currentVersion: "4.0.0",
      nextVersion: "4.1.0",
    });
  });

  test("previews a major release without changing files", () => {
    const result = preview("major");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      bump: "major",
      currentVersion: "4.0.0",
      nextVersion: "5.0.0",
    });
  });
});
