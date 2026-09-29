#!/usr/bin/env node
// Bumps the app version everywhere it lives, in one step:
//   app.json  expo.version, expo.android.versionCode (+1), expo.ios.buildNumber (+1)
//   package.json / package-lock.json  version
//
// Usage: npm run version:bump -- patch|minor|major|<x.y.z>
// app.json is edited in place with targeted replacements so its formatting is preserved.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJsonPath = join(root, "app.json");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run version:bump -- patch|minor|major|<x.y.z>");
  process.exit(1);
}

const text = readFileSync(appJsonPath, "utf8");
const { expo } = JSON.parse(text);
const current = expo.version;
const [major, minor, patch] = current.split(".").map(Number);

let next;
if (arg === "patch") next = `${major}.${minor}.${patch + 1}`;
else if (arg === "minor") next = `${major}.${minor + 1}.0`;
else if (arg === "major") next = `${major + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else {
  console.error(`Invalid version "${arg}": use patch, minor, major or x.y.z`);
  process.exit(1);
}

const compare = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
if (compare(next, current) <= 0) {
  console.error(`New version ${next} must be greater than ${current}`);
  process.exit(1);
}

const versionCode = expo.android.versionCode + 1;
const buildNumber = String(Number(expo.ios.buildNumber) + 1);

const replaceOnce = (source, pattern, replacement) => {
  if (!pattern.test(source)) throw new Error(`app.json: ${pattern} not found`);
  return source.replace(pattern, replacement);
};
let updated = text;
updated = replaceOnce(updated, /("version":\s*)"[^"]*"/, `$1"${next}"`);
updated = replaceOnce(updated, /("versionCode":\s*)\d+/, `$1${versionCode}`);
updated = replaceOnce(updated, /("buildNumber":\s*)"[^"]*"/, `$1"${buildNumber}"`);
writeFileSync(appJsonPath, updated);

execSync(`npm version ${next} --no-git-tag-version --allow-same-version`, {
  cwd: root,
  stdio: "ignore",
});

console.log(
  `${expo.name} ${current} -> ${next} (android versionCode ${versionCode}, ios buildNumber ${buildNumber})`,
);
