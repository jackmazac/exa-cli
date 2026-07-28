import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scriptcEntry = resolve("node_modules/scriptc/dist/main.js");
const result = spawnSync(process.execPath, [scriptcEntry, "coverage", "src/cli.ts"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}
if (result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

const report = `${result.stdout}\n${result.stderr}`;
const fullyStatic = report.includes("compile statically") &&
  report.includes("(100%)") &&
  report.includes("fully static") &&
  !report.includes("blockers:");

if (result.status !== 0 || !fullyStatic) {
  process.stderr.write("Static coverage gate failed: expected 100% fully static coverage.\n");
  process.exit(1);
}
