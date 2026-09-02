const ESTUDIEMOS_REGISTRY_ENDPOINT = "https://estudiemos-app.vercel.app/api/user-registry";
const ESTUDIEMOS_MONITORING_ENDPOINT = "https://estudiemos-app.vercel.app/api/admin-monitoring";
const ESTUDIEMOS_REGISTRY_SHEET = "Usuarios";
const ESTUDIEMOS_MONITORING_SHEET = "Monitoreo";
const ESTUDIEMOS_TOKEN_PROPERTY = "ESTUDIEMOS_USER_REGISTRY_TOKEN";

function sincronizarUsuarios() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    const token = getAdminToken();

    const response = UrlFetchApp.fetch(ESTUDIEMOS_REGISTRY_ENDPOINT, {
      method: "get",
      headers: { Authorization: `Bearer ${token}` },
      followRedirects: false,
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Estudiemos respondió ${response.getResponseCode()}.`);
    }

    const rows = Utilities.parseCsv(response.getContentText().replace(/^\uFEFF/, ""));
    const expectedHeader = ["Correo", "Fecha de registro", "Correo confirmado", "Ultimo acceso"];
    if (
      !rows.length ||
      rows.length > 10001 ||
      rows[0].length !== expectedHeader.length ||
      !expectedHeader.every((value, index) => rows[0][index] === value) ||
      rows.some((row) => row.length !== expectedHeader.length)
    ) throw new Error("El registro recibido no es válido.");

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(ESTUDIEMOS_REGISTRY_SHEET)
      || spreadsheet.insertSheet(ESTUDIEMOS_REGISTRY_SHEET);
    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, rows[0].length);
    PropertiesService.getScriptProperties().setProperty("ESTUDIEMOS_LAST_SYNC", new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function actualizarMonitoreo() {
  const response = UrlFetchApp.fetch(ESTUDIEMOS_MONITORING_ENDPOINT, {
    method: "get",
    headers: { Authorization: `Bearer ${getAdminToken()}` },
    followRedirects: false,
    muteHttpExceptions: true
  });
  const payload = JSON.parse(response.getContentText() || "{}");
  if (![200, 503].includes(response.getResponseCode()) || !payload.services) {
    throw new Error(`El monitor respondió ${response.getResponseCode()}.`);
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(ESTUDIEMOS_MONITORING_SHEET)
    || spreadsheet.insertSheet(ESTUDIEMOS_MONITORING_SHEET);
  const checkedAt = new Date(payload.checkedAt || Date.now());
  const serviceRows = [
    ["Web", payload.services.web],
    ["Base de datos", payload.services.database],
    ["Inteligencia artificial", payload.services.ai],
    ["WhatsApp", payload.services.whatsapp],
    ["Sincronización Android", payload.services.androidPush],
    ["CAPTCHA", payload.services.captcha]
  ];

  sheet.getRange("A1:B1").breakApart().merge().setValue("Monitoreo de Estudiemos");
  sheet.getRange("A3:B6").setValues([
    ["Estado general", payload.healthy ? "Correcto" : "Revisar"],
    ["Última comprobación", checkedAt],
    ["Versión", payload.version || "unknown"],
    ["Latencia", `${Math.max(0, Number(payload.latencyMs) || 0)} ms`]
  ]);
  sheet.getRange("A8:B8").setValues([["Servicio", "Estado"]]);
  sheet.getRange(9, 1, serviceRows.length, 2).setValues(serviceRows);
  sheet.getRange("D1:J1").setValues([[
    "Fecha", "Web", "Base", "IA", "WhatsApp", "Android", "CAPTCHA"
  ]]);
  sheet.appendRow([
    "", "", "",
    checkedAt,
    payload.services.web,
    payload.services.database,
    payload.services.ai,
    payload.services.whatsapp,
    payload.services.androidPush,
    payload.services.captcha
  ]);

  const historyRows = Math.max(0, sheet.getLastRow() - 14);
  if (historyRows > 1000) sheet.deleteRows(15, historyRows - 1000);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 10);
  sheet.getRange("A1:B1").setFontWeight("bold");
  sheet.getRange("A8:B8").setFontWeight("bold");
  sheet.getRange("D1:J1").setFontWeight("bold");
}

function actualizarPanelAdministrativo() {
  sincronizarUsuarios();
  actualizarMonitoreo();
}

function configurarSincronizacion() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => [
      "sincronizarUsuarios",
      "actualizarMonitoreo",
      "actualizarPanelAdministrativo"
    ].includes(trigger.getHandlerFunction()))
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("actualizarPanelAdministrativo").timeBased().everyMinutes(15).create();
  actualizarPanelAdministrativo();
}

function getAdminToken() {
  const token = PropertiesService.getScriptProperties().getProperty(ESTUDIEMOS_TOKEN_PROPERTY);
  if (!token) throw new Error("Falta configurar el token privado de Estudiemos.");
  return token;
}
