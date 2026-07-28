import { describe, expect, test } from "vitest";
import {
  expectCliOnly,
  expectLocalMarkdownLinks,
  expectSkillFrontmatter,
  readSkillFiles,
} from "./skillTestUtils.js";

describe("build-with-exa CLI skill", () => {
  test("teaches the complete supported native CLI integration contract", () => {
    const files = readSkillFiles("build-with-exa");
    const combined = [...files.values()].join("\n");

    expect(files.size).toBeGreaterThan(1);
    expect(combined).toContain("exa search");
    expect(combined).toContain("exa fetch");
    expect(combined).toContain("exa agent run");
    expect(combined).toContain("--input -");
    expect(combined).toContain("EXA_API_KEY");
    expect(combined).toContain('"version": 1');
    expect(combined).toContain('"ok": true');
    expect(combined).toContain("Exit code");
    expect(combined).toContain("Never pass the API key");
    expect(combined).toContain("Do not mix `--input`");

    const skillPath = [...files.keys()].find((path) => path.endsWith("/SKILL.md"));
    expect(skillPath).toBeDefined();
    expectSkillFrontmatter(files.get(skillPath ?? "") ?? "", "build-with-exa");
    expectCliOnly(files);
    expectLocalMarkdownLinks(files);
  });
});
