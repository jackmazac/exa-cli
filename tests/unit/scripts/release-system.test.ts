import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("release system", () => {
  test("builds versioned archives, a binary npm package, manifest, and SHA ledger", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      name: string;
      repository: { url: string };
      scripts: Record<string, string>;
      engines: { node: string };
    };
    const builder = readFileSync("scripts/build-release-artifacts.ts", "utf8");

    expect(packageJson.name).toBe("@jackmazac/exa-cli");
    expect(packageJson.repository.url).toContain("jackmazac/exa-cli");
    expect(packageJson.engines.node).toBe(">=18");
    expect(packageJson.scripts["version:major"]).toContain("bump-version.ts");
    expect(packageJson.scripts["version:minor"]).toContain("bump-version.ts");
    expect(packageJson.scripts["release:verify"]).toBeDefined();
    expect(builder).toContain('import { CLI_VERSION } from "../src/version.js"');
    expect(builder).toContain("release-manifest.json");
    expect(builder).toContain("npm pack");
    expect(builder).toContain(".tgz");
    expect(builder).toContain("SHA256SUMS");
    expect(builder).not.toContain('const version = "4.0.0"');
  });

  test("supports immutable tagged and manual major/minor GitHub releases", () => {
    const workflow = readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("- major");
    expect(workflow).toContain("- minor");
    expect(workflow).toContain("actions/attest@v4");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("release-manifest.json");
    expect(workflow).toContain("*.tgz");
    expect(workflow).toContain("v*.*.*");
    expect(workflow).not.toContain("v4.*");
    expect(workflow).not.toContain("exa-v4.0.0");
  });
});
