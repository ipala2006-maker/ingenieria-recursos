const assert = require("node:assert/strict");
const { test } = require("node:test");
const { chromium } = require("../tmp/ui-check/node_modules/playwright");

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:8137";

test("shared WhatsApp text opens Inbox and creates a pending task", async () => {
  const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem("estudiemos_theme", "dark");
      localStorage.setItem("bandeja_agenda", "[]");
    });
    const text = "Preparar resumen de Quimica para manana";
    await page.goto(`${baseUrl}/?shared=1&title=${encodeURIComponent(text)}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);

    const result = await page.evaluate(() => ({
      url: location.href,
      items: JSON.parse(localStorage.getItem("bandeja_agenda") || "[]"),
      boardOpen: document.body.classList.contains("agenda-open"),
      visible: document.body.innerText.includes("Preparar resumen de Quimica"),
      activeFilter: [...document.querySelectorAll("[data-agenda-filter]")]
        .find((button) => button.classList.contains("is-active"))?.dataset.agendaFilter
    }));

    assert.equal(result.url.includes("shared=1"), false, "share params should be removed after import");
    assert.equal(result.boardOpen, true, "Inbox should open after import");
    assert.equal(result.visible, true, "imported task should be visible");
    assert.equal(result.activeFilter, "pending", "Inbox should show pending tasks");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].title, text);
    assert.equal(result.items[0].date, "");
    assert.equal(result.items[0].note, "Importado desde WhatsApp.");
  } finally {
    await browser.close();
  }
});
