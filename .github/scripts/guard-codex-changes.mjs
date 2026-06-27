import { execFileSync } from "node:child_process";

const diff = execFileSync("git", ["diff", "--name-status"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const deleted = diff.filter((line) => line.startsWith("D\t"));
const sensitive = diff.filter((line) => {
  const file = line.split(/\t+/).pop() || "";
  return /(^|\/)(\.env|\.env\..*|id_rsa|id_dsa|\.npmrc|\.pypirc|secrets?\.|credentials?\.|.*token.*)$/i.test(file);
});

if (deleted.length > 3) {
  console.error(`Blocked: too many deleted files (${deleted.length}).`);
  process.exit(1);
}

if (sensitive.length > 0) {
  console.error(`Blocked: sensitive file touched: ${sensitive.join(", ")}`);
  process.exit(1);
}

console.log("Codex change guard passed.");
