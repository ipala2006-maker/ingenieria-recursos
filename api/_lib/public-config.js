function isPublicSupabaseKey(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{20,512}$/.test(value)) return true;
  // Legacy anon JWTs are public; service_role JWTs must never reach the browser.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "anon";
  } catch (_) {
    return false;
  }
}

module.exports = { isPublicSupabaseKey };
