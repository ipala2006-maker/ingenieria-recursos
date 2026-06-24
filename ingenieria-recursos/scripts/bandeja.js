(function () {
  if (!window.DATA || !Array.isArray(DATA.carreras)) return;

  const STORAGE_KEYS = {
    favorites: "bandeja_favoritos",
    saved: "bandeja_guardados",
    subjects: "bandeja_materias",
    recent: "bandeja_recientes"
  };

  const GOOGLE_FORM_URL = "PEGAR_AQUI_EL_LINK_DE_TU_GOOGLE_FORM";
  const rootPath = location.pathname.includes("/pages/") ? "../../" : "./";

  addBandejaLink();
  trackRecentTopic();
  addResourceButtons();
  renderBandejaPage();

  function addBandejaLink() {
    const topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-bandeja-link]")) return;

    let nav = topbar.querySelector(".topbar__nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "topbar__nav";
      topbar.appendChild(nav);
    }

    const link = document.createElement("a");
    link.className = "topbar__link";
    link.dataset.bandejaLink = "true";
    link.href = `${rootPath}pages/bandeja.html`;
    link.textContent = "Bandeja";
    nav.appendChild(link);
  }

  function trackRecentTopic() {
    if (!location.pathname.includes("/pages/tema/")) return;

    const current = findCurrentTopic();
    if (!current) return;

    const recent = readList(STORAGE_KEYS.recent)
      .filter((item) => item.id !== current.id);

    recent.unshift(current);
    writeList(STORAGE_KEYS.recent, recent.slice(0, 8));
  }

  function addResourceButtons() {
    if (document.body.dataset.bandejaPage === "true") return;
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
      if (card.querySelector(".bandeja-mini-actions")) return;
      const item = itemFromCard(card, currentTopic);
      if (!item) return;

      card.classList.add("bandeja-card-wrap");
      card.appendChild(createMiniActions(item));
    });
  }

  function renderBandejaPage() {
    if (document.body.dataset.bandejaPage !== "true") return;

    renderSubjects();
    renderList("favoritesList", readList(STORAGE_KEYS.favorites), "Todavia no agregaste favoritos.");
    renderList("savedList", readList(STORAGE_KEYS.saved), "Todavia no guardaste recursos para despues.");
    renderList("recentList", readList(STORAGE_KEYS.recent), "Todavia no hay temas recientes.");

    const suggestionLink = document.getElementById("suggestionLink");
    if (suggestionLink) {
      suggestionLink.href = GOOGLE_FORM_URL;
      if (GOOGLE_FORM_URL.includes("PEGAR_AQUI")) {
        suggestionLink.addEventListener("click", (event) => {
          event.preventDefault();
          alert("Todavia falta pegar el enlace de Google Form en scripts/bandeja.js");
        });
      }
    }
  }

  function renderSubjects() {
    const container = document.getElementById("subjectsList");
    const quick = document.getElementById("mySubjectsQuick");
    if (!container || !quick) return;

    const selected = readList(STORAGE_KEYS.subjects);
    const subjects = getSubjects();

    container.innerHTML = subjects.map((subject) => `
      <label class="bandeja-check">
        <input type="checkbox" value="${escapeAttr(subject.slug)}" ${selected.includes(subject.slug) ? "checked" : ""}>
        <span>${escapeHtml(subject.title)}</span>
      </label>
    `).join("");

    container.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const values = Array.from(container.querySelectorAll("input:checked")).map((item) => item.value);
        writeList(STORAGE_KEYS.subjects, values);
        renderSubjects();
      });
    });

    const selectedSubjects = subjects.filter((subject) => selected.includes(subject.slug));
    renderList("mySubjectsQuick", selectedSubjects.map((subject) => ({
      id: `materia:${subject.slug}`,
      type: "Materia",
      icon: "📚",
      title: subject.title,
      topic: "",
      subject: subject.title,
      url: `${rootPath}pages/materia/${subject.slug}.html`,
      target: "_self"
    })), "Selecciona tus materias para ver accesos rapidos.");
  }

  function renderList(elementId, items, emptyText) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p class="muted">${emptyText}</p>`;
      return;
    }

    container.innerHTML = items.map((item) => `
      <a class="topic-card bandeja-list-card" href="${escapeAttr(item.url)}" target="${item.target || "_self"}" rel="noopener">
        <div>
          <p class="topic-card__title">${item.icon || "•"} ${escapeHtml(item.title)}</p>
          ${item.topic ? `<p class="global-search__meta">Tema: ${escapeHtml(item.topic)}</p>` : ""}
          ${item.subject ? `<p class="global-search__meta">Materia: ${escapeHtml(item.subject)}</p>` : ""}
        </div>
        <span class="global-search__tag">${escapeHtml(item.type)}</span>
      </a>
    `).join("");
  }

  function createActions(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "bandeja-actions";
    wrapper.appendChild(createButton("⭐ Favorito", STORAGE_KEYS.favorites, item));
    wrapper.appendChild(createButton("📌 Guardar para despues", STORAGE_KEYS.saved, item));
    return wrapper;
  }

  function createMiniActions(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "bandeja-mini-actions";
    wrapper.appendChild(createButton("⭐", STORAGE_KEYS.favorites, item));
    wrapper.appendChild(createButton("📌", STORAGE_KEYS.saved, item));
    return wrapper;
  }

  function createButton(label, key, item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bandeja-action-btn";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleItem(key, item);
      button.classList.toggle("is-active", hasItem(key, item.id));
    });
    if (hasItem(key, item.id)) button.classList.add("is-active");
    return button;
  }

  function itemFromCard(card, currentTopic) {
    const href = card.getAttribute("href");
    if (!href) return null;

    const title = card.querySelector(".topic-card__title, .video-card__title")?.textContent?.trim();
    if (!title) return null;

    let type = "Recurso";
    let icon = "•";

    if (card.classList.contains("video-card")) {
      type = "Video";
      icon = "📹";
    } else if (title.includes("📄")) {
      type = "PDF";
      icon = "📄";
    } else if (title.includes("🛠")) {
      type = "Herramienta";
      icon = "🛠";
    } else {
      type = "Tema";
      icon = "📚";
    }

    return {
      id: `${type}:${href}`,
      type,
      icon,
      title: cleanTitle(title),
      topic: currentTopic?.topic || "",
      subject: currentTopic?.subject || "",
      url: href,
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
              id: `Tema:${tema.slug}`,
              type: "Tema",
              icon: "📚",
              title: tema.title,
              topic: tema.title,
              subject: materia.title,
              url: `${rootPath}pages/tema/${tema.slug}.html`,
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
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (error) {
      return [];
    }
  }

  function writeList(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function cleanTitle(title) {
    return title.replace("📄", "").replace("🛠", "").replace("📹", "").replace("📚", "").trim();
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
})();
