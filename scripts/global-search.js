(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar || document.querySelector(".global-search")) return;

  const rootPath = getRootPath();
  const workspaceHome = document.body.classList.contains("workspace-home") || document.body.classList.contains("productivity-page");
  let resources = null;

  ensureTopbarNav();
  preserveNavigationState();
  applySavedTheme();
  loadProfessionalStyle();
  prepareProductivityTopbar();
  configureWindowControlsOverlay();
  addThemeButton();
  loadDesktopWidgetsScript();
  loadAccountScript();
  loadPomodoroScript();
  loadInstallAppScript();
  loadBandejaScript();
  loadDashboardStyle();
  loadDashboardScript();

  if (workspaceHome) return;

  const search = document.createElement("div");
  search.className = "global-search";
  search.innerHTML = `
    <label class="global-search__label" for="globalSearchInput">Buscar</label>
    <input id="globalSearchInput" class="global-search__input" type="search" placeholder="Buscar recursos..." autocomplete="off" />
    <div id="globalSearchResults" class="global-search__results" hidden></div>
  `;

  const nav = topbar.querySelector(".topbar__nav");
  if (nav) topbar.insertBefore(search, nav);
  else topbar.appendChild(search);

  const input = search.querySelector("#globalSearchInput");
  const results = search.querySelector("#globalSearchResults");

  input.addEventListener("input", () => renderResults(input.value));
  input.addEventListener("focus", () => renderResults(input.value));
  document.addEventListener("estudiemos:navigation", () => {
    resources = null;
    results.hidden = true;
  });

  document.addEventListener("click", (event) => {
    if (!search.contains(event.target)) results.hidden = true;
  });

  function ensureTopbarNav() {
    let nav = topbar.querySelector(".topbar__nav");
    if (nav) return nav;
    nav = document.createElement("nav");
    nav.className = "topbar__nav";
    nav.setAttribute("aria-label", "Acciones rápidas");
    topbar.appendChild(nav);
    return nav;
  }

  function preserveNavigationState() {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const key = `estudiemos_scroll:${location.pathname}`;
    const restore = () => {
      const saved = sessionStorage.getItem(key);
      if (!saved) return;
      const y = Number(saved);
      if (Number.isFinite(y)) requestAnimationFrame(() => scrollTo(0, y));
    };

    addEventListener("pagehide", () => {
      sessionStorage.setItem(key, String(scrollY));
    });

    addEventListener("beforeunload", () => {
      sessionStorage.setItem(key, String(scrollY));
    });

    addEventListener("pageshow", restore);

    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin) sessionStorage.setItem(key, String(scrollY));
    }, { capture: true });
  }

  function getResources() {
    if (!resources) resources = buildResources();
    return resources;
  }

  function buildResources() {
    const items = [];

    DATA.carreras.forEach((carrera) => {
      (carrera.materias || []).forEach((materia) => {
        (materia.temas || []).forEach((tema) => {
          const topicUrl = `${getRootPath()}pages/tema/${tema.slug}.html`;

          items.push({
            type: "Tema",
            title: tema.title,
            searchable: [tema.title, tema.meta, ...(tema.tags || [])],
            topic: tema.title,
            subject: materia.title,
            url: topicUrl,
            target: "_self"
          });

          (tema.videos || []).forEach((video) => {
            items.push({
              type: "Video",
              title: video.title || `Video de ${tema.title}`,
              searchable: [video.title, tema.title, tema.meta],
              topic: tema.title,
              subject: materia.title,
              url: video.url,
              target: "_blank"
            });
          });

          (tema.pdfs || []).forEach((pdf) => {
            items.push({
              type: "PDF",
              title: pdf.title,
              searchable: [pdf.title],
              topic: tema.title,
              subject: materia.title,
              url: resolveUrl(pdf.url),
              target: "_blank"
            });
          });

          (tema.herramientas || []).forEach((tool) => {
            items.push({
              type: "Herramienta",
              title: tool.title,
              searchable: [tool.title],
              topic: tema.title,
              subject: materia.title,
              url: tool.url,
              target: "_blank"
            });
          });
        });
      });
    });

    return items;
  }

  function loadProfessionalStyle() {
    if (document.querySelector('link[href*="styles/professional.css"]')) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${rootPath}styles/professional.css?v=20260824-study-metrics`;
    document.head.appendChild(link);
  }

  function configureWindowControlsOverlay() {
    const overlay = navigator.windowControlsOverlay;
    if (!overlay) return;

    const sync = () => {
      document.documentElement.classList.toggle("has-window-controls-overlay", Boolean(overlay.visible));
    };

    overlay.addEventListener?.("geometrychange", sync);
    sync();
  }

  function loadDashboardStyle() {
    if (document.querySelector('link[href*="styles/dashboard.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${rootPath}styles/dashboard.css?v=20260824-week-pomodoro`;
    document.head.appendChild(link);
  }

  function addThemeButton() {
    const nav = topbar.querySelector(".topbar__nav");
    if (!nav || nav.querySelector("[data-theme-toggle]")) return;

    const button = document.createElement("button");
    button.className = "topbar__link topbar-icon-btn theme-top-btn";
    button.type = "button";
    button.dataset.themeToggle = "true";
    nav.appendChild(button);

    const render = () => {
      const isDark = document.documentElement.classList.contains("theme-dark");
      button.setAttribute("aria-label", isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
      button.title = isDark ? "Tema oscuro" : "Tema claro";
      button.innerHTML = isDark
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.2 8.2 0 0 1 8.8 4a8.3 8.3 0 1 0 11.2 11.2Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
    };

    button.addEventListener("click", () => {
      const next = document.documentElement.classList.contains("theme-dark") ? "light" : "dark";
      button.classList.remove("is-switching");
      void button.offsetWidth;
      button.classList.add("is-switching");
      window.EstudiemosTheme?.set(next);
      render();
      setTimeout(() => button.classList.remove("is-switching"), 260);
    });
    window.addEventListener("estudiemos:theme-change", render);
    window.addEventListener("pageshow", render);
    render();
  }

  function applySavedTheme() {
    if (window.EstudiemosTheme) {
      window.EstudiemosTheme.sync();
      return;
    }

    let theme = "dark";
    try { theme = localStorage.getItem("estudiemos_theme") || "dark"; } catch (error) {}
    const dark = theme === "dark";
    document.documentElement.classList.toggle("theme-dark", dark);
    document.documentElement.classList.toggle("theme-light", !dark);
  }

  function loadBandejaScript() {
    if (document.querySelector('script[src*="scripts/bandeja.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/bandeja.js?v=20260824-week-pomodoro`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadPomodoroScript() {
    if (document.querySelector('script[src*="scripts/pomodoro.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/pomodoro.js?v=20260824-week-pomodoro`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadDashboardScript() {
    if (document.querySelector('script[src*="scripts/dashboard.js"]')) return;
    const script = document.createElement("script");
    script.src = `${rootPath}scripts/dashboard.js?v=20260824-week-pomodoro`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function prepareProductivityTopbar() {
    const nav = topbar.querySelector(".topbar__nav");
    if (!nav) return;
    nav.querySelectorAll(".topbar__link--soon").forEach((item) => item.remove());

    if (!nav.querySelector(".suggestion-top-btn")) {
      const suggestion = document.createElement("a");
      suggestion.className = "topbar__link topbar-icon-btn suggestion-top-btn";
      suggestion.href = "https://docs.google.com/forms/d/e/1FAIpQLSc8KLH9N0kcYRryZa0tNtLSRIMe0ol_wKWVUwBt9T-3m9WD1A/viewform?usp=header";
      suggestion.target = "_blank";
      suggestion.rel = "noopener noreferrer";
      suggestion.setAttribute("aria-label", "Enviar sugerencia");
      suggestion.title = "Sugerencias";
      suggestion.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>';
      nav.appendChild(suggestion);
    }

    if (!nav.querySelector(".about-top-btn")) {
      const about = document.createElement("a");
      about.className = "topbar__link topbar-icon-btn about-top-btn";
      about.href = `${rootPath}about.html`;
      about.setAttribute("aria-label", "Acerca de Estudiemos");
      about.title = "Acerca de";
      if (location.pathname.endsWith("/about.html")) about.setAttribute("aria-current", "page");
      about.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/></svg>';
      nav.appendChild(about);
    }
  }

  function loadAccountScript() {
    if (document.querySelector('script[src*="scripts/account.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/account.js?v=20260824-week-pomodoro`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadDesktopWidgetsScript() {
    if (document.querySelector('script[src*="scripts/desktop-widgets.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/desktop-widgets.js?v=20260824-week-pomodoro`;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadInstallAppScript() {
    if (document.querySelector('script[src*="scripts/install-app.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/install-app.js?v=20260824-installed-context`;
    script.defer = true;
    document.head.appendChild(script);
  }

  function renderResults(value) {
    const query = normalize(value);

    if (query.length < 1) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    const matches = getResources()
      .map((item) => ({ item, match: scoreItem(item, query) }))
      .filter((result) => result.match.score > 0)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 8);

    if (!matches.length) {
      results.hidden = false;
      results.innerHTML = `<p class="global-search__empty">No se encontraron resultados.</p>`;
      return;
    }

    results.hidden = false;
    results.innerHTML = matches.map(({ item, match }) => `
      <a class="topic-card global-search__card" href="${escapeAttr(item.url)}" target="${item.target}" rel="noopener noreferrer">
        <div>
          <p class="topic-card__title">${highlight(item.title, value)}</p>
          ${match.text && normalize(match.text) !== normalize(item.title) ? `<p class="global-search__meta">Coincidencia: ${highlight(match.text, value)}</p>` : ""}
          <p class="global-search__meta">Tema: ${escapeHtml(item.topic)}</p>
          <p class="global-search__meta">Materia: ${escapeHtml(item.subject)}</p>
        </div>
        <span class="global-search__tag">${escapeHtml(item.type)}</span>
      </a>
    `).join("");
  }

  function scoreItem(item, query) {
    const title = normalize(item.title);

    if (title === query) return { score: 400, text: item.title };
    if (title.startsWith(query)) return { score: 300, text: item.title };
    if (title.includes(query)) return { score: 200, text: item.title };

    const found = item.searchable.find((field) => normalize(field).includes(query));
    if (found) return { score: 100, text: found };

    return { score: 0, text: "" };
  }

  function resolveUrl(url) {
    if (!url) return "#";
    if (url.startsWith("http")) return url;
    if (url.startsWith("../../")) return getRootPath() + url.replace(/^(\.\.\/)+/, "");
    if (url.startsWith("./")) return getRootPath() + url.replace("./", "");
    return getRootPath() + url;
  }

  function highlight(text, query) {
    const safeText = escapeHtml(text || "Sin título");
    const cleanQuery = escapeRegExp(query.trim());
    if (!cleanQuery) return safeText;

    return safeText.replace(new RegExp(`(${cleanQuery})`, "ig"), "<mark>$1</mark>");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }
})();
