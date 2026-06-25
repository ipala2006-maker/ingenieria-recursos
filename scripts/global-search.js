(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar || document.querySelector(".global-search")) return;

  const rootPath = getRootPath();
  const resources = buildResources();
  applyInitialBandejaState();
  loadBandejaScript();

  const search = document.createElement("div");
  search.className = "global-search";
  search.innerHTML = `
    <label class="global-search__label" for="globalSearchInput">Buscar</label>
    <input id="globalSearchInput" class="global-search__input" type="search" placeholder="Buscar recursos..." autocomplete="off" />
    <div id="globalSearchResults" class="global-search__results" hidden></div>
  `;

  const nav = topbar.querySelector(".topbar__nav");
  if (nav) {
    topbar.insertBefore(search, nav);
  } else {
    topbar.appendChild(search);
  }

  const input = search.querySelector("#globalSearchInput");
  const results = search.querySelector("#globalSearchResults");

  input.addEventListener("input", () => renderResults(input.value));
  input.addEventListener("focus", () => renderResults(input.value));
  loadMissingVideoTitles();

  document.addEventListener("click", (event) => {
    if (!search.contains(event.target)) results.hidden = true;
  });

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
              target: "_blank",
              needsTitle: !video.title
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

  function loadBandejaScript() {
    if (document.querySelector('script[src$="scripts/bandeja.js"]')) return;

    const script = document.createElement("script");
    script.src = `${rootPath}scripts/bandeja.js`;
    document.head.appendChild(script);
  }

  function applyInitialBandejaState() {
    try {
      document.body.classList.toggle("tray-open", localStorage.getItem("bandeja_abierta") === "true");
      document.body.classList.remove("tray-transition-enabled");
    } catch (error) {
      document.body.classList.remove("tray-open", "tray-transition-enabled");
    }
  }

  function renderResults(value) {
    const query = normalize(value);

    if (query.length < 1) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }

    const matches = resources
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

  function loadMissingVideoTitles() {
    const videosWithoutTitle = resources.filter((item) => item.type === "Video" && item.needsTitle);

    videosWithoutTitle.forEach(async (item) => {
      try {
        const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(item.url)}`);
        const data = await response.json();

        if (!data.title) return;

        item.title = data.title;
        item.searchable = [data.title, item.topic];
        item.needsTitle = false;

        if (input.value.trim()) renderResults(input.value);
      } catch (error) {
        item.needsTitle = false;
      }
    });
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

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }
})();
