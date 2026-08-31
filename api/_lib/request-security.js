const crypto = require("crypto");
const { adminRequest, isConfigured } = require("./supabase-admin");

const STORE_KEY = Symbol.for("estudiemos.api-rate-limit");
const MAX_LOCAL_BUCKETS = 5000;
const DEFAULT_BODY_LIMIT = 128 * 1024;

const shared = globalThis[STORE_KEY] || {
  buckets: new Map(),
  distributedRetryAt: 0,
  lastPruneAt: 0
};
globalThis[STORE_KEY] = shared;

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function isSameOriginRequest(request) {
  const origin = String(request.headers?.origin || "");
  if (!origin) return true;
  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "")
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch (_) {
    return false;
  }
}

function rejectOversizedBody(request, response, maxBytes = DEFAULT_BODY_LIMIT) {
  const limit = clampInteger(maxBytes, 1024, 1024 * 1024);
  const declared = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declared) && declared > limit) {
    response.status(413).json({ message: "La solicitud es demasiado grande." });
    return true;
  }

  if (request.body == null) return false;
  try {
    const size = Buffer.byteLength(
      typeof request.body === "string" ? request.body : JSON.stringify(request.body),
      "utf8"
    );
    if (size <= limit) return false;
  } catch (_) {
    response.status(400).json({ message: "La solicitud no tiene un formato válido." });
    return true;
  }

  response.status(413).json({ message: "La solicitud es demasiado grande." });
  return true;
}

async function enforceRateLimit(request, response, options = {}) {
  const route = normalizeRoute(options.route);
  const limit = clampInteger(options.limit || 60, 1, 1000);
  const windowSeconds = clampInteger(options.windowSeconds || 60, 1, 3600);
  const now = Date.now();
  const identity = clientIdentity(request);
  const localKeys = [identity.ipKey, identity.credentialKey].filter(Boolean);

  for (const key of localKeys) {
    const result = consumeLocal(`${route}:${key}`, limit, windowSeconds, now);
    setRateHeaders(response, result, limit);
    if (!result.allowed) {
      sendRateLimitResponse(response, result);
      return false;
    }
  }

  if (options.distributed !== false && isConfigured() && now >= shared.distributedRetryAt) {
    try {
      const result = await consumeDistributed(identity.ipKey, route, limit, windowSeconds);
      setRateHeaders(response, result, limit);
      if (!result.allowed) {
        sendRateLimitResponse(response, result);
        return false;
      }
    } catch (_) {
      // The in-memory limiter remains active while the SQL migration is unavailable.
      shared.distributedRetryAt = now + 60_000;
    }
  }

  return true;
}

function consumeLocal(key, limit, windowSeconds, now) {
  pruneLocal(now);
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const current = shared.buckets.get(key);
  const count = !current || current.windowStart !== windowStart ? 1 : current.count + 1;
  shared.buckets.set(key, { windowStart, count, resetAt });
  return { allowed: count <= limit, count, remaining: Math.max(0, limit - count), resetAt };
}

async function consumeDistributed(rateKey, route, limit, windowSeconds) {
  const result = await adminRequest("/rest/v1/rpc/consume_api_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      target_key: rateKey,
      target_route: route,
      target_limit: limit,
      target_window_seconds: windowSeconds
    })
  });
  const resetAt = Date.parse(result?.resetAt || result?.reset_at || "") || Date.now() + windowSeconds * 1000;
  const count = Math.max(0, Number(result?.count) || 0);
  return {
    allowed: Boolean(result?.allowed),
    count,
    remaining: Math.max(0, Number(result?.remaining) || limit - count),
    resetAt
  };
}

function clientIdentity(request) {
  const vercelForwarded = String(request.headers?.["x-vercel-forwarded-for"] || "").split(",")[0].trim();
  const socketAddress = String(request.socket?.remoteAddress || "").trim();
  const forwarded = String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = vercelForwarded || socketAddress || forwarded || "unknown";
  const authorization = String(request.headers?.authorization || "");
  return {
    ipKey: `ip:${secureHash(ip)}`,
    credentialKey: authorization.startsWith("Bearer ") ? `auth:${secureHash(authorization)}` : ""
  };
}

function secureHash(value) {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SECRET_KEY || "";
  return (secret
    ? crypto.createHmac("sha256", secret).update(String(value)).digest("hex")
    : crypto.createHash("sha256").update(String(value)).digest("hex")
  ).slice(0, 32);
}

function setRateHeaders(response, result, limit) {
  response.setHeader("RateLimit-Limit", String(limit));
  response.setHeader("RateLimit-Remaining", String(Math.max(0, result.remaining)));
  response.setHeader("RateLimit-Reset", String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
}

function sendRateLimitResponse(response, result) {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  response.setHeader("Retry-After", String(retryAfter));
  response.status(429).json({
    code: "RATE_LIMITED",
    message: "Hiciste demasiadas solicitudes seguidas. Esperá un momento y probá nuevamente.",
    retryAfter
  });
}

function pruneLocal(now) {
  if (shared.buckets.size < MAX_LOCAL_BUCKETS && now - shared.lastPruneAt < 60_000) return;
  shared.lastPruneAt = now;
  for (const [key, value] of shared.buckets) {
    if (value.resetAt <= now) shared.buckets.delete(key);
  }
  while (shared.buckets.size > MAX_LOCAL_BUCKETS) {
    shared.buckets.delete(shared.buckets.keys().next().value);
  }
}

function normalizeRoute(value) {
  const route = String(value || "api").toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 80);
  return route || "api";
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

module.exports = {
  enforceRateLimit,
  isSameOriginRequest,
  rejectOversizedBody,
  setSecurityHeaders
};
