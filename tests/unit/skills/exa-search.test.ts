import { describe, expect, test } from "vitest";
import {
  expectCliOnly,
  expectLocalMarkdownLinks,
  expectSkillFrontmatter,
  readSkillFiles,
} from "./skillTestUtils.js";

describe("exa-search CLI skill", () => {
  test("maps Search discovery and advanced requests to exa search", () => {
    const files = readSkillFiles("exa-search");
    const combined = [...files.values()].join("\n");

    expect(combined).toContain("exa search");
    expect(combined).toContain("--input -");
    expect(combined).toContain("--type");
    expect(combined).toContain("--num-results");
    expect(combined).toContain("--category");
    expect(combined).toContain('type: "auto"');
    expect(combined).toContain("contents.highlights");
    expect(combined).toContain("data.results");
    expect(combined).toContain("Search streaming is not exposed");
    expect(combined).toContain("Do not mix `--input`");

    for (const value of [
      "auto",
      "fast",
      "instant",
      "deep",
      "deep-reasoning",
      "company",
      "publication",
      "news",
      "pdf",
      "github",
      "personal-site",
      "people",
      "financial-report",
    ]) {
      expect(combined).toContain(`\`${value}\``);
    }

    const skillPath = [...files.keys()].find((path) => path.endsWith("/SKILL.md"));
    expect(skillPath).toBeDefined();
    expectSkillFrontmatter(files.get(skillPath ?? "") ?? "", "exa-search");
    expectCliOnly(files);
    expectLocalMarkdownLinks(files);
  });
});
