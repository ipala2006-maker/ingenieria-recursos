const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const hash = value => "'sha256-" + crypto.createHash("sha256").update(value).digest("base64") + "'";

function collectHashes() {
  const scripts = new Set(), handlers = new Set();
  // Match the runtime data-only prefetch rules created by theme-init.js.
  scripts.add(hash(JSON.stringify({ prefetch: [{ source: 'document', where: { href_matches: '/*' }, eagerness: 'moderate' }] })));
  const files = execFileSync("git", ["ls-files", "-z", "*.html"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n?/g, "\n");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) scripts.add(hash(match[2]));
    }
    for (const match of html.matchAll(/\bon\w+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const handler = match[1] ?? match[2];
      if (!/^show(?:Videos|PDFs|Tools|Categories)\(\)$/.test(handler)) throw new Error(`Unapproved inline handler in ${file}; use addEventListener instead.`);
      handlers.add(hash(handler));
    }
  }
  return { scripts: [...scripts].sort(), handlers: [...handlers].sort() };
}

function main() {
  const file = path.join(root, "vercel.json");
  const original = fs.readFileSync(file, "utf8");
  const config = JSON.parse(original);
  const policy = config.headers.find(rule => rule.source === "/(.*)").headers.find(header => header.key === "Content-Security-Policy");
  const previousPolicy = policy.value;
  const { scripts, handlers } = collectHashes();
  const expectedScripts = "script-src 'self' https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js https://challenges.cloudflare.com " + scripts.join(" ");
  // Only four harmless, existing topic-navigation handlers are hash-approved.
  const expectedHandlers = "script-src-attr 'unsafe-hashes' " + handlers.join(" ");
  if (process.argv.includes("--write")) {
    const directives = policy.value.split(";").map(value => value.trim()).filter(value => !/^script-src(?:\s|-attr\s)/.test(value));
    directives.splice(1, 0, expectedScripts, expectedHandlers);
    policy.value = directives.join("; ");
    fs.writeFileSync(file, original.replace(JSON.stringify(previousPolicy), JSON.stringify(policy.value)));
  } else {
    const directives = policy.value.split(";").map(value => value.trim());
    if (!directives.includes(expectedScripts) || !directives.includes(expectedHandlers)) {
      throw new Error("CSP hashes are stale. Run node scripts/csp-check.js --write and review vercel.json.");
    }
  }
  console.log(`CSP verified: ${scripts.length} inline scripts, ${handlers.length} navigation handlers; no arbitrary inline scripts.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { collectHashes };
