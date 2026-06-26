(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;

  const STORAGE_KEYS = {
    favorites: "bandeja_favoritos",
    saved: "bandeja_guardados",
    subjects: "bandeja_materias",
    recent: "bandeja_recientes",
    open: "bandeja_abierta"
  };

  const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc8KLH9N0kcYRryZa0tNtLSRIMe0ol_wKWVUwBt9T-3m9WD1A/viewform?usp=header";
  const rootPath = getRootPath();

  addTray();
  trackRecentTopic();
  addSubjectButtons();
  addResourceButtons();
  observeResourceCards();

  function addTray() {
    if (document.querySelector(".tray-shell")) return;

    const shell = document.createElement("aside");
    shell.className = "tray-shell";
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML = `
      <div class="tray-panel" aria-label="Recursos rápidos">
        <div class="tray-head">
          <div>
            <p class="tray-kicker">Recursos</p>
            <h2>Accesos rápidos</h2>
          </div>
          <button class="tray-close" type="button" aria-label="Cerrar">×</button>
        </div>

        <div class="tray-content">
          <section class="tray-accordion" data-tray-section="favorites">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Favoritos</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">Recursos marcados para volver rápido.</p>
              <div id="favoritesList" class="bandeja-list"></div>
            </div>
          </section>

          <section class="tray-accordion" data-tray-section="subjects">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Mis materias</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">Acceso rápido a tus materias elegidas.</p>
              <div id="mySubjectsQuick" class="bandeja-list"></div>
            </div>
          </section>

          <section class="tray-accordion" data-tray-section="recent">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Recientes</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">Últimos temas visitados.</p>
              <div id="recentList" class="bandeja-list"></div>
            </div>
          </section>

          <section class="tray-accordion" data-tray-section="saved">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Guardados para después</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">Material para revisar después.</p>
              <div id="savedList" class="bandeja-list"></div>
            </div>
          </section>

          <section class="tray-accordion" data-tray-section="suggestions">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Sugerencias</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">¿Encontraste un error o querés sugerir un recurso?</p>
              <a id="suggestionLink" class="btn tray-submit" href="#" target="_blank" rel="noopener">Enviar sugerencia</a>
            </div>
          </section>
        </div>
      </div>
    `;

    document.body.appendChild(shell);
    addTrayButton();
    bindTray(shell);
    renderTray();
    restoreTrayState();
  }

  function addTrayButton() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-bandeja-trigger]")) return;

    let nav = topbar.querySelector(".topbar__nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "topbar__nav";
      topbar.appendChild(nav);
    }

    const button = document.createElement("button");
    button.className = "topbar__link tray-trigger";
    button.type = "button";
    button.dataset.bandejaTrigger = "true";
    button.setAttribute("aria-label", "Abrir recursos");
    button.innerHTML = '<span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span>';
    const brand = topbar.querySelector(".brand");
    if (brand) topbar.insertBefore(button, brand);
    else topbar.insertBefore(button, nav);
  }

  function bindTray(shell) {
    document.querySelector("[data-bandeja-trigger]")?.addEventListener("click", toggleTray);
    shell.querySelector(".tray-close")?.addEventListener("click", closeTray);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeTray();
    });

    shell.querySelectorAll(".tray-accordion__trigger").forEach((button) => {
      button.addEventListener("click", () => {
        const section = button.closest(".tray-accordion");
        const isOpen = section.classList.toggle("is-open");
        button.setAttribute("aria-expanded", String(isOpen));
        section.querySelector(".tray-chevron").textContent = isOpen ? "-" : "+";
      });
    });

    const suggestionLink = shell.querySelector("#suggestionLink");
    suggestionLink?.addEventListener("click", (event) => {
      if (GOOGLE_FORM_URL.includes("PEGAR_URL")) {
        event.preventDefault();
        alert("Todavía falta pegar el enlace de Google Form en scripts/bandeja.js");
      }
    });
  }

  function toggleTray() {
    if (document.body.classList.contains("tray-open")) closeTray();
    else openTray();
  }

  function openTray() {
    enableTrayTransitionForManualAction();
    setTrayOpen(true, true);
  }

  function closeTray() {
    enableTrayTransitionForManualAction();
    setTrayOpen(false, true);
  }

  function restoreTrayState() {
    document.body.classList.remove("tray-transition-enabled");
    setTrayOpen(localStorage.getItem(STORAGE_KEYS.open) === "true", false);
  }

  function setTrayOpen(isOpen, shouldSave) {
    if (isOpen && shouldSave) renderTray();

    document.body.classList.toggle("tray-open", isOpen);
    document.querySelector(".tray-shell")?.setAttribute("aria-hidden", String(!isOpen));

    if (shouldSave) {
      localStorage.setItem(STORAGE_KEYS.open, String(isOpen));
    }
  }

  function enableTrayTransitionForManualAction() {
    document.body.classList.add("tray-transition-enabled");
  }

  function renderTray() {
    renderSubjects();
    renderList("favoritesList", readList(STORAGE_KEYS.favorites), "Todavía no agregaste favoritos.", STORAGE_KEYS.favorites);
    renderList("savedList", readList(STORAGE_KEYS.saved), "Todavía no guardaste recursos para después.", STORAGE_KEYS.saved);
    renderList("recentList", readList(STORAGE_KEYS.recent), "Todavía no hay temas recientes.", STORAGE_KEYS.recent);
    updateSuggestionLink();
  }

  function updateSuggestionLink() {
    const suggestionLink = document.getElementById("suggestionLink");
    if (!suggestionLink) return;
    suggestionLink.href = GOOGLE_FORM_URL;
  }

  function trackRecentTopic() {
    if (!location.pathname.includes("/pages/tema/")) return;

    const current = findCurrentTopic();
    if (!current) return;

    const recent = readList(STORAGE_KEYS.recent).filter((item) => item.id !== current.id);
    recent.unshift(current);
    writeList(STORAGE_KEYS.recent, recent.slice(0, 8));
  }

  function addResourceButtons() {
    const currentTopic = findCurrentTopic();

    if (currentTopic) {
      const panel = document.querySelector(".panel");
      if (panel && !panel.querySelector(".bandeja-actions")) {
        const actions = createActions(currentTopic);
        const desc = document.getElementById("topicDesc");
        if (desc) desc.insertAdjacentElement("afterend", actions);
      }
    }

    document.querySelectorAll(".topic-card, .video-card").forEach((card) => {
      if (card.closest(".tray-shell")) return;
      if (card.querySelector(".bandeja-mini-actions")) return;
      const item = itemFromCard(card, currentTopic);
      if (!item) return;
      card.classList.add("bandeja-card-wrap");
      card.appendChild(createMiniActions(item));
    });
  }

  function observeResourceCards() {
    const observer = new MutationObserver(() => {
      addSubjectButtons();
      addResourceButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function addSubjectButtons() {
    document.querySelectorAll('a.card[href*="/materia/"], a.card[href^="../materia/"], a.card[href^="./pages/materia/"]').forEach((card) => {
      if (card.querySelector(".subject-toggle")) return;

      const href = card.getAttribute("href") || "";
      const slug = href.split("/").pop().replace(".html", "");
      const subject = getSubjects().find((item) => item.slug === slug);
      if (!subject) return;

      card.classList.add("bandeja-card-wrap");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-toggle";
      button.textContent = isSubjectSelected(slug) ? "Elegida" : "Agregar";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSubject(slug);
        button.textContent = isSubjectSelected(slug) ? "Elegida" : "Agregar";
        renderTray();
      });
      card.appendChild(button);
    });
  }

  function renderSubjects() {
    const selected = readList(STORAGE_KEYS.subjects);
    const subjects = getSubjects();
    const selectedSubjects = subjects.filter((subject) => selected.includes(subject.slug));

    renderList("mySubjectsQuick", selectedSubjects.map((subject) => ({
      id: `materia:${subject.slug}`,
      type: "Materia",
      title: subject.title,
      topic: "",
      subject: subject.title,
      url: createMateriaUrl(subject.slug),
      target: "_self"
    })), "Todavía no seleccionaste materias.", STORAGE_KEYS.subjects);
  }

  function renderList(elementId, items, emptyText, key) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="tray-empty">${emptyText}</p>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <a class="topic-card bandeja-list-card" href="${escapeAttr(createInternalUrl(item.url))}" target="${item.target || "_self"}" rel="noopener">
        <div>
          <p class="topic-card__title">${escapeHtml(item.title)}</p>
          ${item.topic ? `<p class="global-search__meta">Tema: ${escapeHtml(item.topic)}</p>` : ""}
          ${item.subject ? `<p class="global-search__meta">Materia: ${escapeHtml(item.subject)}</p>` : ""}
        </div>
        <span class="global-search__tag">${escapeHtml(item.type)}</span>
        ${key ? `<button class="bandeja-remove-btn" type="button" data-bandeja-remove="${escapeAttr(key)}" data-bandeja-remove-id="${escapeAttr(item.id)}" aria-label="Quitar ${escapeAttr(item.title)}">×</button>` : ""}
      </a>
    `).join("");

    container.querySelectorAll("[data-bandeja-remove]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeItem(button.dataset.bandejaRemove, button.dataset.bandejaRemoveId);
      });
    });
  }

  function createActions(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "bandeja-actions";
    wrapper.appendChild(createButton("Favorito", STORAGE_KEYS.favorites, item));
    wrapper.appendChild(createButton("Guardar", STORAGE_KEYS.saved, item));
    return wrapper;
  }

  function createMiniActions(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "bandeja-mini-actions";
    wrapper.appendChild(createButton("*", STORAGE_KEYS.favorites, item, "Marcar favorito"));
    wrapper.appendChild(createButton("+", STORAGE_KEYS.saved, item, "Guardar para después"));
    return wrapper;
  }

  function createButton(label, key, item, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bandeja-action-btn";
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleItem(key, item);
      updateButtonsForItem(key, item.id);
      renderTray();
    });
    if (hasItem(key, item.id)) button.classList.add("is-active");
    button.dataset.bandejaKey = key;
    button.dataset.bandejaId = item.id;
    return button;
  }

  function itemFromCard(card, currentTopic) {
    const href = card.getAttribute("href");
    if (!href) return null;

    const title = card.querySelector(".topic-card__title, .video-card__title")?.textContent?.trim();
    if (!title) return null;

    let type = "Tema";
    if (card.classList.contains("video-card")) type = "Video";
    else if (href.includes(".pdf") || card.closest("#pdfList")) type = "PDF";
    else if (card.closest("#toolList")) type = "Herramienta";

    const stable = createStableItem(type, title, href, currentTopic);

    return {
      ...stable,
      target: href.startsWith("http") || href.includes(".pdf") ? "_blank" : "_self"
    };
  }

  function findCurrentTopic() {
    if (!location.pathname.includes("/pages/tema/")) return null;

    const slug = location.pathname.split("/").pop().replace(".html", "");

    for (const carrera of DATA.carreras) {
      for (const materia of carrera.materias || []) {
        for (const tema of materia.temas || []) {
          if (tema.slug === slug) {
            return {
              id: `tema:${tema.slug}`,
              type: "Tema",
              title: tema.title,
              topic: tema.title,
              subject: materia.title,
              url: createTopicUrl(tema.slug),
              target: "_self"
            };
          }
        }
      }
    }

    return null;
  }

  function getSubjects() {
    return DATA.carreras.flatMap((carrera) => carrera.materias || []);
  }

  function isSubjectSelected(slug) {
    return readList(STORAGE_KEYS.subjects).includes(slug);
  }

  function toggleSubject(slug) {
    const selected = readList(STORAGE_KEYS.subjects);
    const next = selected.includes(slug)
      ? selected.filter((item) => item !== slug)
      : [...selected, slug];
    writeList(STORAGE_KEYS.subjects, next);
  }

  function removeItem(key, id) {
    if (key === STORAGE_KEYS.subjects) {
      writeList(key, readList(key).filter((slug) => `materia:${slug}` !== id));
    } else {
      writeList(key, readList(key).filter((item) => item.id !== id));
    }

    updateButtonsForItem(key, id);
    renderTray();
  }

  function toggleItem(key, item) {
    const list = readList(key);
    const exists = list.some((saved) => saved.id === item.id);
    const next = exists ? list.filter((saved) => saved.id !== item.id) : [item, ...list];
    writeList(key, next);
  }

  function hasItem(key, id) {
    return readList(key).some((item) => item.id === id);
  }

  function readList(key) {
    try {
      const list = JSON.parse(localStorage.getItem(key)) || [];

      if (key === STORAGE_KEYS.subjects) return list;

      const normalized = dedupeItems(list.map(normalizeItem).filter(Boolean));

      if (key === STORAGE_KEYS.favorites || key === STORAGE_KEYS.saved || key === STORAGE_KEYS.recent) {
        writeList(key, normalized);
      }

      return normalized;
    } catch (error) {
      return [];
    }
  }

  function writeList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function cleanTitle(title) {
    return String(title || "").trim();
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

  function createTopicUrl(slug) {
    return `pages/tema/${slug}.html`;
  }

  function createMateriaUrl(slug) {
    return `pages/materia/${slug}.html`;
  }

  function createStableItem(type, title, href, currentTopic) {
    const url = normalizeStoredUrl(href);
    const slug = getSlugFromUrl(url);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);

      return {
        id: `tema:${slug}`,
        type: "Tema",
        title: cleanTitle(topicInfo?.tema?.title || title),
        topic: topicInfo?.tema?.title || currentTopic?.topic || "",
        subject: topicInfo?.materia?.title || currentTopic?.subject || "",
        url: createTopicUrl(slug)
      };
    }

    return {
      id: `${normalizeType(type)}:${url}`,
      type,
      title: cleanTitle(title),
      topic: currentTopic?.topic || "",
      subject: currentTopic?.subject || "",
      url
    };
  }

  function normalizeItem(item) {
    if (!item || !item.id) return null;

    const type = item.type || getTypeFromId(item.id);
    const url = normalizeStoredUrl(item.url || "");
    const slug = getSlugFromUrl(url) || getSlugFromId(item.id);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);

      return {
        ...item,
        id: `tema:${slug}`,
        type: "Tema",
        title: cleanTitle(topicInfo?.tema?.title || item.title),
        topic: topicInfo?.tema?.title || item.topic || "",
        subject: topicInfo?.materia?.title || item.subject || "",
        url: createTopicUrl(slug),
        target: "_self"
      };
    }

    return {
      ...item,
      id: `${normalizeType(type)}:${url}`,
      type,
      url
    };
  }

  function dedupeItems(items) {
    const seen = new Set();

    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function updateButtonsForItem(key, id) {
    document.querySelectorAll(`[data-bandeja-key="${key}"]`).forEach((button) => {
      if (button.dataset.bandejaId === id) {
        button.classList.toggle("is-active", hasItem(key, id));
      }
    });
  }

  function findTopicBySlug(slug) {
    for (const carrera of DATA.carreras) {
      for (const materia of carrera.materias || []) {
        for (const tema of materia.temas || []) {
          if (tema.slug === slug) return { materia, tema };
        }
      }
    }

    return null;
  }

  function getSlugFromUrl(url) {
    const match = String(url || "").match(/pages\/tema\/([^/.]+)\.html/);
    return match ? match[1] : "";
  }

  function getSlugFromId(id) {
    const match = String(id || "").match(/tema:([^/]+)$/i);
    return match ? match[1].replace(".html", "") : "";
  }

  function getTypeFromId(id) {
    const type = String(id || "").split(":")[0].toLowerCase();
    if (type === "tema") return "Tema";
    if (type === "video") return "Video";
    if (type === "pdf") return "PDF";
    if (type === "herramienta") return "Herramienta";
    return "Recurso";
  }

  function normalizeType(type) {
    return String(type || "recurso").toLowerCase();
  }

  function createInternalUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;

    const internalPath = normalizeStoredUrl(url);
    if (isExternalUrl(internalPath)) return internalPath;

    return getBasePath() + internalPath;
  }

  function normalizeStoredUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;

    const cleanUrl = String(url).replace(/\\/g, "/");
    const internalMatch = cleanUrl.match(/(?:^|\/)(pages|pdfs|tools|herramientas)\//);

    if (internalMatch) {
      return cleanUrl.slice(internalMatch.index + (cleanUrl[internalMatch.index] === "/" ? 1 : 0));
    }

    try {
      const parsed = new URL(cleanUrl, location.href);
      const parsedMatch = parsed.pathname.match(/\/(pages|pdfs|tools|herramientas)\//);
      if (parsedMatch) return parsed.pathname.slice(parsedMatch.index + 1);
    } catch (error) {
      return cleanUrl.replace(/^(\.\/|\.\.\/)+/, "");
    }

    return cleanUrl.replace(/^(\.\/|\.\.\/)+/, "");
  }

  function isExternalUrl(url) {
    if (url.startsWith("mailto:")) return true;
    if (!/^https?:\/\//.test(url)) return false;

    try {
      return new URL(url).origin !== location.origin;
    } catch (error) {
      return true;
    }
  }

  function getBasePath() {
    return rootPath;
  }

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }
})();
