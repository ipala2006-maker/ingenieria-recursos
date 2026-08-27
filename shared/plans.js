(function (root, factory) {
  const plans = factory();
  if (typeof module === "object" && module.exports) module.exports = plans;
  else root.EstudiemosPlans = plans;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  const catalog = Object.freeze({
    initial: Object.freeze({
      id: "initial",
      name: "Plan inicial",
      shortName: "Inicial",
      priceArs: 0,
      billing: "sin costo",
      storageBytes: 250 * MB,
      monthlyAiActions: 20,
      monthlyWhatsappActions: 5,
      description: "Para organizarte manualmente y probar el asistente.",
      features: Object.freeze([
        "Inbox, calendario, Pomodoro y racha",
        "Sincronización y widgets básicos",
        "250 MB de almacenamiento",
        "20 acciones de IA por mes",
        "5 órdenes por WhatsApp por mes"
      ])
    }),
    plus: Object.freeze({
      id: "plus",
      name: "Estudiemos Plus",
      shortName: "Plus",
      priceArs: 8900,
      billing: "por mes",
      storageBytes: 5 * GB,
      monthlyAiActions: 300,
      monthlyWhatsappActions: 100,
      description: "Para que Estudiemos sostenga tu organización diaria.",
      features: Object.freeze([
        "Todo lo incluido en Inicial",
        "Organización automática con IA",
        "Indicaciones por texto o audio en WhatsApp",
        "5 GB de almacenamiento",
        "300 acciones de IA por mes",
        "100 órdenes por WhatsApp por mes"
      ])
    }),
    pro: Object.freeze({
      id: "pro",
      name: "Estudiemos Pro",
      shortName: "Pro",
      priceArs: 16900,
      billing: "por mes",
      storageBytes: 20 * GB,
      monthlyAiActions: 1000,
      monthlyWhatsappActions: 500,
      description: "Para estudiantes con muchos archivos y uso intensivo.",
      features: Object.freeze([
        "Todo lo incluido en Plus",
        "20 GB de almacenamiento",
        "1.000 acciones de IA por mes",
        "500 órdenes por WhatsApp por mes",
        "Mayor margen para un uso intensivo"
      ])
    })
  });

  function get(planId) {
    return catalog[planId] || catalog.initial;
  }

  function ids() {
    return Object.keys(catalog);
  }

  return Object.freeze({ catalog, get, ids, MB, GB });
});
