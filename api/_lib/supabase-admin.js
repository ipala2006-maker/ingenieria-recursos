const SUPABASE_TIMEOUT_MS = 12000;

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

async function adminRequest(path, options = {}) {
  if (!isConfigured()) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    const base = process.env.SUPABASE_URL.replace(/\/$/, "");
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `Supabase ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticateBearer(authorization) {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key || !String(authorization || "").startsWith("Bearer ")) return null;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: key, Authorization: authorization }
    });
    if (!response.ok) return null;
    return response.json();
  } catch (_) {
    return null;
  }
}

function encodeFilter(value) {
  return encodeURIComponent(String(value || ""));
}

module.exports = { adminRequest, authenticateBearer, encodeFilter, isConfigured };

