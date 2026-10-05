const test = require("node:test");
const assert = require("node:assert/strict");
const { collectHashes } = require("../scripts/csp-check");
const config = require("../vercel.json");

test("public script policy only allows approved inline code, not arbitrary scripts or eval", () => {
  const policy = config.headers.find(rule => rule.source === "/(.*)").headers.find(header => header.key === "Content-Security-Policy").value;
  const directives = Object.fromEntries(policy.split(";").map(value => value.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.ok(!directives["script-src"].includes("'unsafe-inline'"));
  assert.ok(!directives["script-src"].includes("'unsafe-eval'"));
  const { scripts, handlers } = collectHashes();
  assert.deepEqual(directives["script-src"].filter(value => value.startsWith("'sha256-")), scripts);
  assert.deepEqual(directives["script-src-attr"], ["'unsafe-hashes'", ...handlers]);
});
