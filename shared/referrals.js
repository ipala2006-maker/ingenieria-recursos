(function (root, factory) {
  const referrals = factory();
  if (typeof module === "object" && module.exports) module.exports = referrals;
  else root.EstudiemosReferrals = referrals;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DISCOUNTS = Object.freeze({ verifiedInvite: 35, threeVerified: 45 });

  function discountFor({ wasReferred = false, qualifiedDirectCount = 0 } = {}) {
    const count = Math.max(0, Math.floor(Number(qualifiedDirectCount) || 0));
    if (count >= 3) return DISCOUNTS.threeVerified;
    if (wasReferred || count >= 1) return DISCOUNTS.verifiedInvite;
    return 0;
  }

  function priceAfterDiscount(priceArs, discountPercent) {
    const price = Math.max(0, Number(priceArs) || 0);
    const discount = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    return Math.round(price * (1 - discount / 100));
  }

  function normalizeCode(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }

  return Object.freeze({ DISCOUNTS, discountFor, normalizeCode, priceAfterDiscount });
});
