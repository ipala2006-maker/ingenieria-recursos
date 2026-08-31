const { enforceRateLimit, setSecurityHeaders } = require("./_lib/request-security");

module.exports = async function handler(request, response) {
  setSecurityHeaders(response);
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ message: "Método no permitido." });
  }
  if (!(await enforceRateLimit(request, response, { route: "account-config", limit: 120, windowSeconds: 60 }))) return;

  const url = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const firebase = {
    apiKey: process.env.FIREBASE_ANDROID_API_KEY || "",
    applicationId: process.env.FIREBASE_ANDROID_APP_ID || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    senderId: process.env.FIREBASE_SENDER_ID || ""
  };

  if (!url || !publishableKey) {
    return response.status(503).json({
      enabled: false,
      message: "La sincronizacion de cuentas todavia no esta configurada."
    });
  }

  const firebaseEnabled = Object.values(firebase).every(Boolean);
  return response.status(200).json({
    enabled: true,
    url,
    publishableKey,
    firebase: firebaseEnabled ? firebase : null
  });
};
