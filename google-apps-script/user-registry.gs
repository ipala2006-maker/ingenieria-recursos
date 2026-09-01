const ESTUDIEMOS_REGISTRY_ENDPOINT = "https://estudiemos-app.vercel.app/api/user-registry";
const ESTUDIEMOS_REGISTRY_SHEET = "Usuarios";
const ESTUDIEMOS_TOKEN_PROPERTY = "ESTUDIEMOS_USER_REGISTRY_TOKEN";

function sincronizarUsuarios() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    const token = PropertiesService.getScriptProperties().getProperty(ESTUDIEMOS_TOKEN_PROPERTY);
    if (!token) throw new Error("Falta configurar el token privado de Estudiemos.");

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

function configurarSincronizacion() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "sincronizarUsuarios")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("sincronizarUsuarios").timeBased().everyMinutes(15).create();
  sincronizarUsuarios();
}
