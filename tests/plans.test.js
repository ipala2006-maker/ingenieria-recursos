const test = require("node:test");
const assert = require("node:assert/strict");
const plans = require("../shared/plans");
const referrals = require("../shared/referrals");

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

test("referral discounts apply to both people after verification and do not stack", () => {
  assert.equal(referrals.discountFor({ wasReferred: false, qualifiedDirectCount: 0 }), 0);
  assert.equal(referrals.discountFor({ wasReferred: true, qualifiedDirectCount: 0 }), 35);
  assert.equal(referrals.discountFor({ wasReferred: false, qualifiedDirectCount: 1 }), 35);
  assert.equal(referrals.discountFor({ wasReferred: true, qualifiedDirectCount: 3 }), 45);
  assert.equal(referrals.discountFor({ wasReferred: false, qualifiedDirectCount: 3 }), 45);
});

test("referral prices and codes are normalized defensively", () => {
  assert.equal(referrals.priceAfterDiscount(8900, 35), 5785);
  assert.equal(referrals.priceAfterDiscount(16900, 45), 9295);
  assert.equal(referrals.normalizeCode(" ab-12 cd_34 "), "AB12CD34");
});
