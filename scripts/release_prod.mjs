import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const changelogPath = path.join(root, "client", "public", "changelog.json");
const versionPath = path.join(root, "client", "public", "version.json");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? "pipe" : "inherit",
    shell: options.shell ?? false,
    encoding: "utf8"
  });
  if (result.error != null) {
    const rendered = [command, ...args].join(" ");
    throw new Error(`Command could not start: ${rendered}\n${result.error.message}`);
  }
  if (result.status !== 0) {
    const rendered = [command, ...args].join(" ");
    throw new Error(`Command failed: ${rendered}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function git(args, options = {}) {
  return run("git", args, options);
}

function npmRun(script) {
  run("npm", ["run", script], { shell: process.platform === "win32" });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatReleaseVersion(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join(".") + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function assertChangelogShape(changelog) {
  for (const language of ["en", "fr"]) {
    if (
      changelog[language] == null
      || typeof changelog[language].title !== "string"
      || changelog[language].title.trim() === ""
      || !Array.isArray(changelog[language].items)
      || changelog[language].items.length === 0
      || changelog[language].items.some((item) => typeof item !== "string" || item.trim() === "")
    ) {
      throw new Error(`client/public/changelog.json must contain ${language}.title and at least one ${language}.items entry`);
    }
  }
}

function hasWorkingTreeChanges() {
  return git(["status", "--porcelain"], { capture: true }) !== "";
}

function commitIfNeeded(message) {
  git(["add", "-A"]);
  if (!hasWorkingTreeChanges()) {
    return false;
  }
  git(["commit", "-m", message]);
  return true;
}

const branch = git(["branch", "--show-current"], { capture: true });
if (branch !== "develop") {
  throw new Error(`Production releases must start from develop. Current branch: ${branch || "(detached)"}`);
}

git(["fetch", "origin"]);

const now = new Date();
const version = process.env.RELEASE_VERSION?.trim() || formatReleaseVersion(now);
const releasedAt = now.toISOString();

const changelog = readJson(changelogPath);
assertChangelogShape(changelog);
changelog.version = version;
changelog.releasedAt = releasedAt;
writeJson(changelogPath, changelog);

writeJson(versionPath, {
  version,
  releasedAt,
  commit: git(["rev-parse", "--short", "HEAD"], { capture: true }),
  branch: "develop"
});

npmRun("typecheck");
npmRun("build");

commitIfNeeded(`Prepare release ${version}`);
git(["push", "origin", "develop"]);

git(["checkout", "main"]);
git(["pull", "--ff-only", "origin", "main"]);
git(["merge", "--no-ff", "develop", "-m", `Release ${version}`]);

const mainCommit = git(["rev-parse", "--short", "HEAD"], { capture: true });
writeJson(versionPath, {
  version,
  releasedAt,
  commit: mainCommit,
  branch: "main"
});
commitIfNeeded(`Trace release ${version}`);
git(["push", "origin", "main"]);

git(["checkout", "develop"]);
git(["merge", "--ff-only", "main"]);
git(["push", "origin", "develop"]);

console.log(`Released ${version} to main. Railway should rebuild from the pushed main branch.`);
