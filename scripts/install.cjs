"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const developmentCheckout = fs.existsSync(path.join(root, "src", "cli.ts"));
const platformKey = `${process.platform}-${process.arch}`;
const supported = {
  "darwin-arm64": "darwin-arm64",
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
};
const artifactName = supported[platformKey];

if (artifactName === undefined) {
  if (developmentCheckout) {
    process.exit(0);
  }
  process.stderr.write(
    `@jackmazac/exa-cli does not provide a native binary for ${platformKey}. ` +
      "Supported targets are darwin-arm64, linux-x64, and linux-arm64.\n",
  );
  process.exit(1);
}

const source = path.join(root, "artifacts", artifactName, "exa");
if (!fs.existsSync(source)) {
  if (developmentCheckout) {
    process.exit(0);
  }
  process.stderr.write(`@jackmazac/exa-cli is missing its ${artifactName} release binary.\n`);
  process.exit(1);
}

const destination = path.join(root, "dist", "exa");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
fs.chmodSync(destination, 0o755);
