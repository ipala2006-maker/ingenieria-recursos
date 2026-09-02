const crypto = require("crypto");

function hasValidAdminToken(request) {
  const expected = String(process.env.USER_REGISTRY_EXPORT_TOKEN || "");
  const authorization = String(request.headers?.authorization || "");
  const received = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (expected.length < 32 || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

module.exports = { hasValidAdminToken };
