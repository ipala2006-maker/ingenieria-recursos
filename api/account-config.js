module.exports = function handler(_request, response) {
  const url = process.env.SUPABASE_URL || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const firebase = {
    apiKey: process.env.FIREBASE_ANDROID_API_KEY || "",
    applicationId: process.env.FIREBASE_ANDROID_APP_ID || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    senderId: process.env.FIREBASE_SENDER_ID || ""
  };

  response.setHeader("Cache-Control", "no-store, max-age=0");

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
