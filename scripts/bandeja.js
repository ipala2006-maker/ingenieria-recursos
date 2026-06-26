(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;
  if (document.querySelector(".tray-shell")) return;

  const STORAGE_KEYS = {
    favorites: "bandeja_favoritos",
    saved: "bandeja_guardados",
    subjects: "bandeja_materias",
    recent: "bandeja_recientes",
    open: "bandeja_abierta"
  };

  const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc8KLH9N0kcYRryZa0tNtLSRIMe0ol_wKWVUwBt9T-3m9WD1A/viewform?usp=header";
  const rootPath = getRootPath();
  let refreshQueued = false;

  addTray();
  addTrayButton();
  bindTray();
  trackRecentTopic();
  refreshPageActions();
  renderTray();
  restoreTrayState();
  observeLateCards();

  function addTray() {
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
          ${traySection("favorites", "Favoritos", "Recursos marcados para volver rápido.", "favoritesList")}
          ${traySection("subjects", "Mis materias", "Acceso rápido a tus materias elegidas.", "mySubjectsQuick")}
          ${traySection("recent", "Recientes", "Últimos temas visitados.", "recentList")}
          ${traySection("saved", "Guardados para después", "Material para revisar después.", "savedList")}
          <section class="tray-accordion" data-tray-section="suggestions">
            <button class="tray-accordion__trigger" type="button" aria-expanded="false">
              <span>Sugerencias</span>
              <span class="tray-chevron">+</span>
            </button>
            <div class="tray-accordion__body">
              <p class="tray-help">¿Encontraste un error o querés sugerir un recurso?</p>
              <a id="suggestionLink" class="btn tray-submit" href="${GOOGLE_FORM_URL}" target="_blank" rel="noopener">Enviar sugerencia</a>
            </div>
          </section>
        </div>
      </div>
    `;
    document.body.appendChild(shell);
  }

  function traySection(name, title, help, listId) {
    return `
      <section class="tray-accordion" data-tray-section="${name}">
        <button class="tray-accordion__trigger" type="button" aria-expanded="false">
          <span>${title}</span>
          <span class="tray-chevron">+</span>
        </button>
        <div class="tray-accordion__body">
          <p class="tray-help">${help}</p>
          <div id="${listId}" class="bandeja-list"></div>
        </div>
      </section>
    `;
  }

  function addTrayButton() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-bandeja-trigger]")) return;

    const button = document.createElement("button");
    button.className = "topbar__link tray-trigger";
    button.type = "button";
    button.dataset.bandejaTrigger = "true";
    button.setAttribute("aria-label", "Abrir recursos");
    button.innerHTML = '<span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span><span class="tray-trigger__bar"></span>';

    const brand = topbar.querySelector(".brand");
    topbar.insertBefore(button, brand || topbar.firstChild);
  }

  function bindTray() {
    document.querySelector("[data-bandeja-trigger]")?.addEventListener("click", () => {
      const isOpen = !document.body.classList.contains("tray-open");
      document.body.classList.add("tray-transition-enabled");
      setTrayOpen(isOpen, true);
      if (isOpen) renderTray();
    });

    document.querySelector(".tray-close")?.addEventListener("click", () => {
      document.body.classList.add("tray-transition-enabled");
      setTrayOpen(false, true);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.body.classList.add("tray-transition-enabled");
        setTrayOpen(false, true);
      }
    });

    document.querySelector(".tray-shell")?.addEventListener("click", (event) => {
      const trigger = event.target.closest(".tray-accordion__trigger");
      const remove = event.target.closest("[data-bandeja-remove]");

      if (trigger) {
        const section = trigger.closest(".tray-accordion");
        const isOpen = section.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(isOpen));
        section.querySelector(".tray-chevron").textContent = isOpen ? "−" : "+";
        return;
      }

      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        removeItem(remove.dataset.bandejaRemove, remove.dataset.bandejaRemoveId);
      }
    });

    document.addEventListener("click", (event) => {
      const action = event.target.closest("[data-bandeja-action]");
      const subject = event.target.closest("[data-subject-toggle]");

      if (action) {
        event.preventDefault();
        event.stopPropagation();
        toggleItem(action.dataset.bandejaAction, action.__bandejaItem);
        syncActionButtons();
        renderTray();
      }

      if (subject) {
        event.preventDefault();
        event.stopPropagation();
        toggleSubject(subject.dataset.subjectToggle);
        syncSubjectButtons();
        renderTray();
      }
    });

    window.addEventListener("pageshow", () => {
      refreshPageActions();
      syncActionButtons();
      syncSubjectButtons();
      renderTray();
      restoreTrayState();
    });
  }

  function setTrayOpen(isOpen, shouldSave) {
    document.body.classList.toggle("tray-open", isOpen);
    document.querySelector(".tray-shell")?.setAttribute("aria-hidden", String(!isOpen));
    if (shouldSave) localStorage.setItem(STORAGE_KEYS.open, String(isOpen));
  }

  function restoreTrayState() {
    document.body.classList.remove("tray-transition-enabled");
    setTrayOpen(localStorage.getItem(STORAGE_KEYS.open) === "true", false);
  }

  function refreshPageActions() {
    addSubjectButtons();
    addResourceButtons();
    syncActionButtons();
    syncSubjectButtons();
  }

  function addSubjectButtons() {
    document.querySelectorAll('a.card[href*="/materia/"], a.card[href^="../materia/"], a.card[href^="./pages/materia/"]').forEach((card) => {
      if (card.querySelector("[data-subject-toggle]")) return;

      const slug = getSlug(card.getAttribute("href"));
      if (!slug || !getSubjects().some((subject) => subject.slug === slug)) return;

      card.classList.add("bandeja-card-wrap");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subject-toggle";
      button.dataset.subjectToggle = slug;
      card.appendChild(button);
    });
  }

  function addResourceButtons() {
    const currentTopic = findCurrentTopic();

    if (currentTopic) {
      const panel = document.querySelector(".panel");
      const desc = document.getElementById("topicDesc");
      if (panel && desc && !panel.querySelector(".bandeja-actions")) {
        desc.insertAdjacentElement("afterend", createActions(currentTopic, true));
      }
    }

    document.querySelectorAll(".topic-card, .video-card").forEach((card) => {
      if (card.closest(".tray-shell")) return;
      if (card.querySelector(".bandeja-mini-actions")) return;

      const item = itemFromCard(card, currentTopic);
      if (!item) return;

      card.classList.add("bandeja-card-wrap");
      card.appendChild(createActions(item, false));
    });
  }

  function createActions(item, showText) {
    const wrapper = document.createElement("div");
    wrapper.className = showText ? "bandeja-actions" : "bandeja-mini-actions";
    wrapper.appendChild(createActionButton("Favorito", STORAGE_KEYS.favorites, item, "star", showText));
    wrapper.appendChild(createActionButton("Guardar", STORAGE_KEYS.saved, item, "bookmark", showText));
    return wrapper;
  }

  function createActionButton(label, key, item, iconName, showText) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = showText ? "bandeja-action-btn bandeja-action-btn--text" : "bandeja-action-btn bandeja-action-btn--icon";
    button.dataset.bandejaAction = key;
    button.dataset.bandejaId = item.id;
    button.__bandejaItem = item;
    button.title = key === STORAGE_KEYS.favorites ? "Marcar como favorito" : "Guardar para después";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `${icon(iconName)}${showText ? `<span>${label}</span>` : `<span class="sr-only">${label}</span>`}`;
    return button;
  }

  function renderTray() {
    const favorites = readList(STORAGE_KEYS.favorites);
    const saved = readList(STORAGE_KEYS.saved);
    const recent = readList(STORAGE_KEYS.recent);
    const selectedSubjects = readList(STORAGE_KEYS.subjects);
    const subjects = getSubjects().filter((subject) => selectedSubjects.includes(subject.slug));

    renderList("favoritesList", favorites, "Todavía no agregaste favoritos.", STORAGE_KEYS.favorites);
    renderList("savedList", saved, "Todavía no guardaste recursos para después.", STORAGE_KEYS.saved);
    renderList("recentList", recent, "Todavía no hay temas recientes.", STORAGE_KEYS.recent);
    renderList("mySubjectsQuick", subjects.map((subject) => ({
      id: `materia:${subject.slug}`,
      type: "Materia",
      title: subject.title,
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
        <button class="bandeja-remove-btn" type="button" data-bandeja-remove="${escapeAttr(key)}" data-bandeja-remove-id="${escapeAttr(item.id)}" aria-label="Quitar ${escapeAttr(item.title)}">${icon("close")}</button>
      </a>
    `).join("");
  }

  function syncActionButtons() {
    const favorites = new Set(readList(STORAGE_KEYS.favorites).map((item) => item.id));
    const saved = new Set(readList(STORAGE_KEYS.saved).map((item) => item.id));

    document.querySelectorAll("[data-bandeja-action][data-bandeja-id]").forEach((button) => {
      const set = button.dataset.bandejaAction === STORAGE_KEYS.favorites ? favorites : saved;
      button.classList.toggle("is-active", set.has(button.dataset.bandejaId));
    });
  }

  function syncSubjectButtons() {
    const selected = new Set(readList(STORAGE_KEYS.subjects));
    document.querySelectorAll("[data-subject-toggle]").forEach((button) => {
      button.textContent = selected.has(button.dataset.subjectToggle) ? "Elegida" : "Agregar";
    });
  }

  function trackRecentTopic() {
    const current = findCurrentTopic();
    if (!current) return;

    const recent = readList(STORAGE_KEYS.recent).filter((item) => item.id !== current.id);
    recent.unshift(current);
    writeList(STORAGE_KEYS.recent, recent.slice(0, 8));
  }

  function observeLateCards() {
    const target = document.querySelector("main") || document.body;
    const observer = new MutationObserver(() => {
      if (refreshQueued) return;
      refreshQueued = true;
      requestAnimationFrame(() => {
        refreshQueued = false;
        refreshPageActions();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function itemFromCard(card, currentTopic) {
    const href = card.getAttribute("href");
    const title = card.querySelector(".topic-card__title, .video-card__title")?.textContent?.trim();
    if (!href || !title) return null;

    let type = "Tema";
    if (card.classList.contains("video-card")) type = "Video";
    else if (href.includes(".pdf") || card.closest("#pdfList")) type = "PDF";
    else if (card.closest("#toolList")) type = "Herramienta";

    const item = createStableItem(type, title, href, currentTopic);
    item.target = href.startsWith("http") || href.includes(".pdf") ? "_blank" : "_self";
    return item;
  }

  function createStableItem(type, title, href, currentTopic) {
    const url = normalizeStoredUrl(href);
    const slug = getTopicSlugFromUrl(url);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);
      return {
        id: `tema:${slug}`,
        type: "Tema",
        title: topicInfo?.tema?.title || title,
        topic: topicInfo?.tema?.title || currentTopic?.topic || "",
        subject: topicInfo?.materia?.title || currentTopic?.subject || "",
        url: createTopicUrl(slug),
        target: "_self"
      };
    }

    return {
      id: `${normalizeType(type)}:${url}`,
      type,
      title,
      topic: currentTopic?.topic || "",
      subject: currentTopic?.subject || "",
      url
    };
  }

  function findCurrentTopic() {
    if (!location.pathname.includes("/pages/tema/")) return null;
    const slug = location.pathname.split("/").pop().replace(".html", "");
    const topicInfo = findTopicBySlug(slug);
    if (!topicInfo) return null;

    return {
      id: `tema:${slug}`,
      type: "Tema",
      title: topicInfo.tema.title,
      topic: topicInfo.tema.title,
      subject: topicInfo.materia.title,
      url: createTopicUrl(slug),
      target: "_self"
    };
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

  function getSubjects() {
    return DATA.carreras.flatMap((carrera) => carrera.materias || []);
  }

  function toggleSubject(slug) {
    const selected = readList(STORAGE_KEYS.subjects);
    writeList(STORAGE_KEYS.subjects, selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug]);
  }

  function toggleItem(key, item) {
    const normalized = normalizeItem(item) || item;
    const list = readList(key);
    const exists = list.some((saved) => saved.id === normalized.id);
    writeList(key, dedupeItems(exists ? list.filter((saved) => saved.id !== normalized.id) : [normalized, ...list]));
  }

  function removeItem(key, id) {
    if (key === STORAGE_KEYS.subjects) {
      writeList(key, readList(key).filter((slug) => `materia:${slug}` !== id));
      syncSubjectButtons();
    } else {
      writeList(key, readList(key).filter((item) => item.id !== id));
      syncActionButtons();
    }
    renderTray();
  }

  function readList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(value)) return [];
      if (key === STORAGE_KEYS.subjects) return value;
      return dedupeItems(value.map(normalizeItem).filter(Boolean));
    } catch (error) {
      return [];
    }
  }

  function writeList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeItem(item) {
    if (!item || !item.id) return null;
    const type = item.type || getTypeFromId(item.id);
    const url = normalizeStoredUrl(item.url || "");
    const slug = getTopicSlugFromUrl(url) || getTopicSlugFromId(item.id);

    if (type === "Tema" && slug) {
      const topicInfo = findTopicBySlug(slug);
      return {
        ...item,
        id: `tema:${slug}`,
        type: "Tema",
        title: topicInfo?.tema?.title || item.title,
        topic: topicInfo?.tema?.title || item.topic || "",
        subject: topicInfo?.materia?.title || item.subject || "",
        url: createTopicUrl(slug),
        target: "_self"
      };
    }

    return { ...item, id: `${normalizeType(type)}:${url}`, type, url };
  }

  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function createInternalUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;
    return rootPath + normalizeStoredUrl(url);
  }

  function normalizeStoredUrl(url) {
    if (!url) return "#";
    if (isExternalUrl(url)) return url;

    const clean = String(url).replace(/\\/g, "/");
    const match = clean.match(/(?:^|\/)(pages|pdfs|tools|herramientas)\//);
    if (match) return clean.slice(match.index + (clean[match.index] === "/" ? 1 : 0));
    return clean.replace(/^(\.\/|\.\.\/)+/, "");
  }

  function isExternalUrl(url) {
    return /^https?:\/\//.test(url) || String(url).startsWith("mailto:");
  }

  function createTopicUrl(slug) {
    return `pages/tema/${slug}.html`;
  }

  function createMateriaUrl(slug) {
    return `pages/materia/${slug}.html`;
  }

  function getSlug(url) {
    return String(url || "").split("/").pop().replace(".html", "");
  }

  function getTopicSlugFromUrl(url) {
    const match = String(url || "").match(/pages\/tema\/([^/.]+)\.html/);
    return match ? match[1] : "";
  }

  function getTopicSlugFromId(id) {
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

  function icon(name) {
    const icons = {
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.9l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8L12 3.9z"/></svg>',
      bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8c0-.5.4-.8.8-.8h8.4c.4 0 .8.3.8.8v15l-5-3-5 3v-15z"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4z"/></svg>'
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