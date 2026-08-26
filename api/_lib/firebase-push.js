const crypto = require("crypto");

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function isConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_PROJECT_ID);
}

async function sendWidgetSync(tokens) {
  if (!isConfigured()) return { enabled: false, sent: 0 };
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean))).slice(0, 8);
  if (!uniqueTokens.length) return { enabled: true, sent: 0 };
  const accessToken = await getAccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const results = await Promise.allSettled(uniqueTokens.map((token) => fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          data: { type: "widget-sync" },
          android: { priority: "high", ttl: "60s" }
        }
      })
    }
  ).then(async (response) => {
    if (response.ok) return true;
    const error = new Error(`FCM ${response.status}`);
    error.status = response.status;
    throw error;
  })));
  return { enabled: true, sent: results.filter((result) => result.status === "fulfilled").length };
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) return cachedAccessToken;
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(account.private_key, {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error("FCM_AUTH_FAILED");
  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Math.max(60, Number(result.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

function signJwt(privateKey, claims) {
  const header = encode({ alg: "RS256", typ: "JWT" });
  const payload = encode(claims);
  const input = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).end().sign(privateKey);
  return `${input}.${base64Url(signature)}`;
}

function encode(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

module.exports = { isConfigured, sendWidgetSync };
