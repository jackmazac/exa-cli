import { describe, expect, test } from "vitest";
import {
  expectCliOnly,
  expectLocalMarkdownLinks,
  expectSkillFrontmatter,
  readSkillFiles,
} from "./skillTestUtils.js";

describe("exa-contents CLI skill", () => {
  test("maps known-URL extraction and statuses to exa fetch", () => {
    const files = readSkillFiles("exa-contents");
    const combined = [...files.values()].join("\n");

    expect(combined).toContain("exa fetch");
    expect(combined).toContain("--max-characters");
    expect(combined).toContain("--input -");
    expect(combined).toContain("text.maxCharacters: 3000");
    expect(combined).toContain("data.results");
    expect(combined).toContain("data.statuses");
    expect(combined).toContain("`highlights`");
    expect(combined).toContain("`text`");
    expect(combined).toContain("`summary`");
    expect(combined).toContain("does not support streaming");
    expect(combined).toContain("Do not mix `--input`");

    const skillPath = [...files.keys()].find((path) => path.endsWith("/SKILL.md"));
    expect(skillPath).toBeDefined();
    expectSkillFrontmatter(files.get(skillPath ?? "") ?? "", "exa-contents");
    expectCliOnly(files);
    expectLocalMarkdownLinks(files);
  });
});
