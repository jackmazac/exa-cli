import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect } from "vitest";

export function readSkillFiles(skillName: string): Map<string, string> {
  const skillDirectory = resolve("skills", skillName);
  expect(existsSync(skillDirectory), `${skillName} directory`).toBe(true);

  const files = new Map<string, string>();
  const pending = [skillDirectory];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) {
      continue;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.set(path, readFileSync(path, "utf8"));
      }
    }
  }
  return files;
}

export function expectSkillFrontmatter(skillMarkdown: string, name: string): void {
  expect(skillMarkdown).toMatch(/^---\nname: [a-z0-9-]+\ndescription: Use when [^\n]+\n---\n/);
  expect(skillMarkdown).toContain(`\nname: ${name}\n`);
}

export function expectCliOnly(files: Map<string, string>): void {
  const combined = [...files.values()].join("\n");
  const forbidden = [
    /\bcurl\b/i,
    /https:\/\/api\.exa\.ai/i,
    /\bx-api-key\b/i,
    /authorization:\s*bearer/i,
    /\bexa-js\b/i,
    /\bexa-py\b/i,
    /\bnew Exa\s*\(/,
    /\bfrom exa_py import\b/,
  ];
  for (const pattern of forbidden) {
    expect(combined, `forbidden direct API or SDK pattern: ${pattern}`).not.toMatch(pattern);
  }
}

export function expectLocalMarkdownLinks(files: Map<string, string>): void {
  const markdownLink = /\[[^\]]+\]\((?!https?:\/\/|#)([^)#]+)(?:#[^)]+)?\)/g;
  for (const [path, contents] of files) {
    for (const match of contents.matchAll(markdownLink)) {
      const target = match[1];
      expect(existsSync(resolve(dirname(path), target)), `${path} -> ${target}`).toBe(true);
    }
  }
}
