const crypto = require("crypto");

function hasValidAdminToken(request) {
  const expected = String(process.env.USER_REGISTRY_EXPORT_TOKEN || "");
  const authorization = String(request.headers?.authorization || "");
  const received = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (expected.length < 32 || expected.length > 1024 || received.length !== expected.length) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  if (receivedBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

module.exports = { hasValidAdminToken };
