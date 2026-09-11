const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("commercial launch surfaces stay hidden until plans are reactivated", () => {
  const index = read("index.html");
  const workspace = read("scripts/workspace.js");
  const account = read("scripts/account.js");

  assert.match(index, /data-workspace-plans[^>]*hidden/);
  assert.match(workspace, /const COMMERCIAL_LAUNCH_ENABLED = false;/);
  assert.match(workspace, /if \(!COMMERCIAL_LAUNCH_ENABLED\) \{[\s\S]{0,160}summary\.hidden = true;/);
  assert.match(workspace, /if \(plans && COMMERCIAL_LAUNCH_ENABLED\) openPlansModal\(\);/);

  assert.match(account, /const COMMERCIAL_LAUNCH_ENABLED = false;/);
  assert.match(account, /const WHATSAPP_BOT_ENABLED = false;/);
  assert.match(account, /<section class="account-referrals" data-account-referrals hidden>/);
  assert.match(account, /if \(session && COMMERCIAL_LAUNCH_ENABLED && !referralStatusLoaded\)/);
  assert.match(account, /section\.hidden = !WHATSAPP_BOT_ENABLED \|\| state\.configured === false \|\| !session;/);
});
