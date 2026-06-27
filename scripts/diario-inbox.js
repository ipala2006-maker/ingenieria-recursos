(function () {
  const form = document.querySelector("[data-diario-form]");
  const textInput = document.querySelector("[data-diario-text]");
  const categoryInput = document.querySelector("[data-diario-category]");
  const list = document.querySelector("[data-diario-list]");
  const status = document.querySelector("[data-diario-status]");
  const keyInput = document.querySelector("[data-diario-key]");
  const refreshButton = document.querySelector("[data-diario-refresh]");
  const filters = Array.from(document.querySelectorAll("[data-diario-filter]"));
  const storageKey = "ian_diario_key";
  let currentFilter = "inbox";
  let items = [];

  if (!form || !textInput || !list) return;

  keyInput.value = localStorage.getItem(storageKey) || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    const category = categoryInput.value;

    if (!text) {
      setStatus("Escribi una entrada antes de guardar.");
      textInput.focus();
      return;
    }

    setStatus("Guardando...");

    try {
      const item = await request("/api/diario", {
        method: "POST",
        body: { text, category, createdAt: new Date().toISOString() },
      });

      items.unshift(item.item);
      textInput.value = "";
      saveKey();
      render();
      setStatus("Entrada guardada.");
      textInput.focus();
    } catch (error) {
      saveLocalDraft({ text, category });
      setStatus("No se pudo guardar en la nube. Quedo como borrador local.");
    }
  });

  refreshButton.addEventListener("click", load);
  keyInput.addEventListener("change", saveKey);

  filters.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.diarioFilter;
      filters.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-diario-action]");
    if (!button) return;

    const number = Number(button.dataset.diarioNumber);
    const nextStatus = button.dataset.diarioAction;
    button.disabled = true;
    setStatus("Actualizando...");

    try {
      const result = await request("/api/diario", {
        method: "PATCH",
        body: { number, status: nextStatus },
      });

      items = items.map((item) => item.number === number ? result.item : item);
      render();
      setStatus("Estado actualizado.");
    } catch (error) {
      button.disabled = false;
      setStatus("No se pudo actualizar. Revisa la configuracion.");
    }
  });

  load();

  async function load() {
    setStatus("Cargando inbox...");

    try {
      const result = await request("/api/diario", { method: "GET" });
      items = result.items || [];
      render();
      setStatus(items.length ? "Inbox sincronizado." : "Inbox vacio.");
    } catch (error) {
      items = loadLocalDrafts();
      render();
      setStatus("Modo local: configura Vercel para sincronizar con GitHub.");
    }
  }

  async function request(url, options) {
    const headers = { "Content-Type": "application/json" };
    const key = keyInput.value.trim();
    if (key) headers["x-diario-key"] = key;

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Error de red");
    return data;
  }

  function render() {
    const visible = items.filter((item) => currentFilter === "todos" || item.status === currentFilter);

    if (!visible.length) {
      list.innerHTML = `<p class="diario-empty">No hay entradas en esta vista.</p>`;
      return;
    }

    list.innerHTML = visible.map((item) => `
      <article class="diario-item">
        <div class="diario-item__meta">
          <span>${escapeHtml(formatDate(item.createdAt))}</span>
          ${item.category ? `<span>${escapeHtml(item.category)}</span>` : ""}
          <span>${escapeHtml(item.status)}</span>
        </div>
        <p>${escapeHtml(item.text)}</p>
        <div class="diario-item__actions">
          ${actionButton(item, "inbox", "Inbox")}
          ${actionButton(item, "procesado", "Procesado")}
          ${actionButton(item, "descartado", "Descartar")}
          ${item.url ? `<a class="btn diario-item__link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">GitHub</a>` : ""}
        </div>
      </article>
    `).join("");
  }

  function actionButton(item, action, label) {
    const active = item.status === action ? " is-active" : "";
    return `<button class="diario-action${active}" type="button" data-diario-action="${action}" data-diario-number="${item.number}">${label}</button>`;
  }

  function saveKey() {
    localStorage.setItem(storageKey, keyInput.value.trim());
  }

  function saveLocalDraft(entry) {
    const drafts = loadLocalDrafts();
    drafts.unshift({
      number: Date.now(),
      text: entry.text,
      category: entry.category,
      status: "inbox",
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("ian_diario_drafts", JSON.stringify(drafts.slice(0, 50)));
  }

  function loadLocalDrafts() {
    try {
      return JSON.parse(localStorage.getItem("ian_diario_drafts") || "[]");
    } catch (error) {
      return [];
    }
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
