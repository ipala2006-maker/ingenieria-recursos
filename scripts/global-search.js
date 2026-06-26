(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar || document.querySelector(".global-search")) return;

  const rootPath = getRootPath();
  let resources = null;

  applySavedTheme();
  loadProfessionalStyle();
  addLightTrayButton();
  addThemeSwitcher();

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

  document.addEventListener("click", (event) => {
    if (!search.contains(event.target)) results.hidden = true;
  });

  function getResources() {
    if (!resources) resources = buildResources();
    return resources;
  }

  function buildResources() {
    const items = [];

    DATA.carreras.forEach((carrera) => {
      (carrera.materias || []).forEach((materia) => {
        (materia.temas || []).forEach((tema) => {
          const topicUrl = `${rootPath}pages/tema/${tema.slug}.html`;

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
    if (document.querySelector('link[href$="styles/professional.css"]')) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${rootPath}styles/professional.css?v=20260626-3`;
    document.head.appendChild(link);
  }

  function addLightTrayButton() {
    if (topbar.querySelector("[data-bandeja-trigger]")) return;

    const button = document.createElement("button");
    button.className = "topbar__link tray-trigger";
    button.type = "button";
    button.dataset.bandejaTrigger = "true";
    button.setAttribute("aria-label", "Abrir recursos");
    button.innerHTML = '<span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span>';

    const brand = topbar.querySelector(".brand");
    topbar.insertBefore(button, brand || topbar.firstChild);

    button.addEventListener("click", () => {
      try { localStorage.setItem("bandeja_abierta", "true"); } catch (error) {}
      loadBandejaScript();
    }, { once: true });
  }

  function addThemeSwitcher() {
    if (document.querySelector(".theme-switcher")) return;

    const switcher = document.createElement("div");
    switcher.className = "theme-switcher";
    switcher.setAttribute("aria-label", "Cambiar tema");
    switcher.innerHTML = `
      <button class="theme-switcher__btn" type="button" data-theme-choice="light" aria-label="Tema claro" title="Tema claro">${icon("sun")}</button>
      <button class="theme-switcher__btn" type="button" data-theme-choice="dark" aria-label="Tema oscuro" title="Tema oscuro">${icon("moon")}</button>
    `;
    document.body.appendChild(switcher);

    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-choice]");
      if (!button) return;
      setTheme(button.dataset.themeChoice, true);
    });

    markActiveTheme();
  }

  function applySavedTheme() {
    let theme = "light";
    try { theme = localStorage.getItem("estudiemos_theme") || "light"; } catch (error) {}
    setTheme(theme, false);
  }

  function setTheme(theme, save) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("theme-dark", next === "dark");
    document.documentElement.classList.toggle("theme-light", next === "light");
    if (save) {
      try { localStorage.setItem("estudiemos_theme", next); } catch (error) {}
    }
    markActiveTheme();
  }

  function markActiveTheme() {
    const isDark = document.documentElement.classList.contains("theme-dark");
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.themeChoice === (isDark ? "dark" : "light"));
    });
  }

  function loadBandejaScript() {
    if (document.querySelector('script[src*="scripts/bandeja.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/bandeja.js?v=20260626-3`;
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
      <a class="topic-card global-search__card" href="${escapeAttr(item.url)}" target="${item.target}" rel="noopener">
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
    if (url.startsWith("../../")) return rootPath + url.replace(/^(\.\.\/)+/, "");
    if (url.startsWith("./")) return rootPath + url.replace("./", "");
    return rootPath + url;
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

  function icon(name) {
    const icons = {
      sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.2a1 1 0 0 1-1-1V2.8a1 1 0 1 1 2 0v1.4a1 1 0 0 1-1 1Zm0 16a1 1 0 0 1-1-1v-1.4a1 1 0 1 1 2 0v1.4a1 1 0 0 1-1 1Zm6.8-8.2a1 1 0 1 1 0-2h1.4a1 1 0 1 1 0 2h-1.4ZM3.8 13a1 1 0 1 1 0-2h1.4a1 1 0 1 1 0 2H3.8Zm13-5.8a1 1 0 0 1 0-1.4l1-1a1 1 0 1 1 1.4 1.4l-1 1a1 1 0 0 1-1.4 0ZM4.8 19.2a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 1.4l-1 1a1 1 0 0 1-1.4 0Zm13 0-1-1a1 1 0 0 1 1.4-1.4l1 1a1 1 0 1 1-1.4 1.4ZM5.8 7.2l-1-1a1 1 0 1 1 1.4-1.4l1 1a1 1 0 0 1-1.4 1.4ZM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"/></svg>',
      moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 14.7a8.3 8.3 0 0 1-11-11 1 1 0 0 0-1.1-1.4A10.2 10.2 0 1 0 21.7 15.8a1 1 0 0 0-1.4-1.1ZM12 20.1a8.2 8.2 0 0 1-5.6-14.2 10.3 10.3 0 0 0 11.7 11.7 8.1 8.1 0 0 1-6.1 2.5Z"/></svg>'
    };
    return icons[name] || "";
  }

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }
})();