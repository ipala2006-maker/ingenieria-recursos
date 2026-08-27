const test = require("node:test");
const assert = require("node:assert/strict");
const plans = require("../shared/plans");

test("the public plan catalog exposes the three supported plans", () => {
  assert.deepEqual(plans.ids(), ["initial", "plus", "pro"]);
});

test("each plan has the enforced storage and monthly usage limits", () => {
  assert.deepEqual(
    plans.ids().map((id) => {
      const plan = plans.get(id);
      return [id, plan.storageBytes, plan.monthlyAiActions, plan.monthlyWhatsappActions];
    }),
    [
      ["initial", 250 * plans.MB, 20, 5],
      ["plus", 5 * plans.GB, 300, 100],
      ["pro", 20 * plans.GB, 1000, 500]
    ]
  );
});

test("unknown plans safely fall back to Initial", () => {
  assert.equal(plans.get("unknown").id, "initial");
});
