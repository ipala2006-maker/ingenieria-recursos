const assert = require("node:assert/strict");
const { test } = require("node:test");
const { chromium } = require("../tmp/ui-check/node_modules/playwright");

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:8136";

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

test("desktop calendar widget keeps weekly events aligned and readable", async () => {
  const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
  try {
    const start = startOfWeek(new Date());
    const monday = dateValue(start);
    const thursday = dateValue(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3));
    const fixtures = [
      { id: "1", title: "Clase de Computacion", subject: "Computacion", date: monday, horaInicio: "08:00", horaFin: "11:00", type: "Clase", createdAt: 1 },
      { id: "2", title: "Clase de Quimica", subject: "Quimica", date: monday, horaInicio: "11:30", horaFin: "14:30", type: "Clase", createdAt: 2 },
      { id: "3", title: "Parcial de Analisis Matematico 2", subject: "Analisis Matematico 2", date: thursday, type: "Examen", createdAt: 3 },
      { id: "4", title: "Consulta de Algebra lineal", subject: "Matematica", date: thursday, horaInicio: "08:00", horaFin: "09:00", type: "Clase", createdAt: 4 },
      { id: "5", title: "Practica larga de programacion funcional", subject: "Computacion", date: thursday, horaInicio: "18:00", horaFin: "20:00", type: "Tarea", createdAt: 5 }
    ];

    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 540, height: 520 } });
      await page.addInitScript(({ fixtures, theme }) => {
        localStorage.setItem("estudiemos_theme", theme);
        localStorage.setItem("estudiemos_calendar_view", "week");
        localStorage.setItem("bandeja_agenda", JSON.stringify(fixtures));
      }, { fixtures, theme });
      await page.goto(`${baseUrl}/widget.html?view=calendar`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);

      const result = await page.evaluate(() => {
        const entries = [...document.querySelectorAll(".calendar-entry")].map((entry) => ({
          text: entry.textContent.replace(/\s+/g, " ").trim(),
          rect: entry.getBoundingClientRect().toJSON(),
          timeRect: entry.querySelector(".calendar-entry__time").getBoundingClientRect().toJSON()
        }));
        const rows = [...document.querySelectorAll(".calendar-day")].map((row) => row.getBoundingClientRect().toJSON());
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
          entries,
          rows
        };
      });

      assert.equal(result.overflow, false, `${theme} widget should not overflow`);
      assert.ok(result.entries.some((entry) => entry.text.includes("08:00-11:00 Clase de Computacion")));
      assert.ok(result.entries.some((entry) => entry.text.includes("11:30-14:30 Clase de Quimica")));
      assert.ok(!result.entries.some((entry) => /Computacion.*Computacion/.test(entry.text)));
      assert.ok(result.entries.some((entry) => entry.text.includes("Todo el dia") || entry.text.includes("Todo el día")));

      const firstColumnX = result.entries[0].timeRect.x;
      for (const entry of result.entries.slice(1)) {
        assert.ok(Math.abs(entry.timeRect.x - firstColumnX) <= 2, `${theme} time column should stay aligned`);
      }
      for (const row of result.rows) {
        assert.ok(row.width <= 540, `${theme} row should fit viewport`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
