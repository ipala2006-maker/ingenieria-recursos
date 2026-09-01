const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const textExtensions = new Set([
  ".css", ".gradle", ".html", ".java", ".js", ".json", ".md", ".properties", ".sql", ".xml", ".yaml", ".yml"
]);
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Supabase secret key", /sb_secret_[0-9A-Za-z_-]{20,}/],
  ["Meta access token", /EAA[0-9A-Za-z]{45,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/]
];
const dependencies = [
  { package: { ecosystem: "npm", name: "@supabase/supabase-js" }, version: "2.112.3" },
  { package: { ecosystem: "Maven", name: "androidx.webkit:webkit" }, version: "1.12.1" },
  { package: { ecosystem: "Maven", name: "com.google.firebase:firebase-messaging" }, version: "25.1.2" },
  { package: { ecosystem: "Maven", name: "com.android.tools.build:gradle" }, version: "8.9.1" }
];

async function main() {
  scanTrackedFiles();
  await scanDependencies();
  console.log("Security checks passed.");
}

function scanTrackedFiles() {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const findings = [];
  for (const relative of files) {
    if (!textExtensions.has(path.extname(relative).toLowerCase())) continue;
    const content = fs.readFileSync(path.join(root, relative), "utf8");
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(content)) findings.push(`${relative}: ${label}`);
    }
  }
  if (findings.length) throw new Error(`Possible committed secrets:\n${findings.join("\n")}`);
}

async function scanDependencies() {
  for (const dependency of dependencies) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("https://api.osv.dev/v1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dependency),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}`);
      const result = await response.json();
      if (Array.isArray(result.vulns) && result.vulns.length) {
        const ids = result.vulns.map((item) => item.id).filter(Boolean).join(", ");
        throw new Error(`${dependency.package.name}@${dependency.version}: ${ids}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
