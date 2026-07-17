(function () {
  if (window.__estudiemosSmoothNavInstalled) return;
  window.__estudiemosSmoothNavInstalled = true;

  const cache = new Map();
  const pending = new Map();
  const MAX_IDLE_PREFETCH = 12;
  const MAIN_SELECTOR = "main.container";
  let navigating = false;

  saveCurrentHistoryState();
  bindNavigationHints();
  prefetchVisibleLinksSoon();

  function bindNavigationHints() {
    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent);
    document.addEventListener("touchstart", handleIntent, { passive: true });
    document.addEventListener("mousedown", handleIntent, { passive: true });
    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("keydown", handleBackspaceNavigation);

    window.addEventListener("popstate", (event) => {
      const url = event.state?.url || location.href;
      if (canSwapUrl(url)) {
        swapTo(url, { push: false, restoreScroll: true });
        return;
      }

      if (event.state?.url && url === location.href) location.reload();
    });

    window.addEventListener("pageshow", () => {
      document.documentElement.classList.remove("is-navigating");
      prefetchVisibleLinksSoon();
    });
  }

  function handleIntent(event) {
    const link = event.target.closest?.("a[href]");
    const url = getInternalPageUrl(link);
    if (url) prefetchPage(url);
  }

  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest?.("a[href]");
    const url = getInternalPageUrl(link);
    if (!url) return;

    saveScroll();
    prefetchPage(url);

    if (!canSwapUrl(url)) return;

    event.preventDefault();
    swapTo(url, { push: true, restoreScroll: false }).catch(() => {
      location.href = url;
    });
  }

  function handleBackspaceNavigation(event) {
    if (event.key !== "Backspace") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    const url = getBackDestination();
    if (!url) return;

    event.preventDefault();
    if (url === "__handled__") return;
    saveScroll();
    location.href = url;
  }

  function isEditableTarget(target) {
    const element = target?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']");
    if (!element) return false;
    if (element.matches("input, textarea")) {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(type);
    }
    return true;
  }

  function getBackDestination() {
    const path = location.pathname;

    if (path.includes("/pages/tema/")) {
      const categories = document.getElementById("categoriesView");
      if (categories && getComputedStyle(categories).display === "none" && typeof window.showCategories === "function") {
        window.showCategories(false);
        return "__handled__";
      }

      const topicSlug = getCurrentSlug();
      const materia = findMateriaByTopic(topicSlug);
      if (materia) return new URL(`../materia/${materia.slug}.html`, location.href).href;
    }

    if (path.includes("/pages/materia/")) {
      const materiaSlug = getCurrentSlug();
      const carrera = findCarreraByMateria(materiaSlug);
      if (carrera) return new URL(`../carrera/${carrera.slug}.html`, location.href).href;
    }

    if (path.includes("/pages/carrera/")) return getAppRootPath();
    return "";
  }

  function getCurrentSlug() {
    const parts = location.pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] || "").replace(".html", "");
  }

  function findMateriaByTopic(topicSlug) {
    if (!window.DATA?.carreras) return null;
    for (const carrera of DATA.carreras) {
      for (const materia of carrera.materias || []) {
        if ((materia.temas || []).some((tema) => tema.slug === topicSlug)) return materia;
      }
    }
    return null;
  }

  function findCarreraByMateria(materiaSlug) {
    if (!window.DATA?.carreras) return null;
    return DATA.carreras.find((carrera) => (carrera.materias || []).some((materia) => materia.slug === materiaSlug)) || null;
  }

  async function swapTo(url, options) {
    if (navigating) return;
    navigating = true;
    document.documentElement.classList.add("is-navigating");

    try {
      const html = await getPageHtml(url);
      const next = parsePage(html);
      if (!next.main) throw new Error("Pagina sin contenido principal");

      const currentMain = document.querySelector(MAIN_SELECTOR);
      if (!currentMain) throw new Error("Pagina sin main");

      document.title = next.title || document.title;
      currentMain.replaceWith(next.main);

      if (options.push) history.pushState({ url, scroll: 0 }, "", url);
      else saveCurrentHistoryState();

      if (options.restoreScroll) {
        requestAnimationFrame(() => scrollTo(0, Number(history.state?.scroll || 0)));
      } else {
        scrollTo(0, 0);
      }

      afterSwap();
      prefetchVisibleLinksSoon();
    } finally {
      navigating = false;
      document.documentElement.classList.remove("is-navigating");
    }
  }

  function afterSwap() {
    refreshPersistentShell();
    window.EstudiemosTheme?.sync?.();
    document.dispatchEvent(new CustomEvent("estudiemos:navigation"));
  }

  function refreshPersistentShell() {
    document.querySelector(".brand")?.setAttribute("href", getAppRootPath());
  }

  function parsePage(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return {
      title: doc.querySelector("title")?.textContent || "",
      main: doc.querySelector(MAIN_SELECTOR)
    };
  }

  function prefetchVisibleLinksSoon() {
    const run = () => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      let count = 0;

      for (const link of links) {
        const url = getInternalPageUrl(link);
        if (!url) continue;
        prefetchPage(url);
        count += 1;
        if (count >= MAX_IDLE_PREFETCH) break;
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(run, { timeout: 1200 });
      return;
    }

    setTimeout(run, 500);
  }

  function prefetchPage(url) {
    if (cache.has(url) || pending.has(url)) return;
    if (navigator.connection?.saveData) return;

    const request = fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache"
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo precargar");
        return response.text();
      })
      .then((html) => {
        cache.set(url, html);
      })
      .catch(() => {})
      .finally(() => pending.delete(url));

    pending.set(url, request);
  }

  async function getPageHtml(url) {
    if (cache.has(url)) return cache.get(url);
    if (pending.has(url)) {
      await pending.get(url);
      if (cache.has(url)) return cache.get(url);
    }

    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache"
    });
    if (!response.ok) throw new Error("No se pudo cargar");
    const html = await response.text();
    cache.set(url, html);
    return html;
  }

  function saveScroll() {
    try {
      sessionStorage.setItem(`estudiemos_scroll:${location.pathname}`, String(scrollY));
    } catch (error) {}

    saveCurrentHistoryState();
  }

  function saveCurrentHistoryState() {
    const state = {
      ...(history.state || {}),
      url: location.href,
      scroll: scrollY
    };
    history.replaceState(state, "", location.href);
  }

  function getInternalPageUrl(link) {
    if (!link) return "";
    if (link.target && link.target !== "_self") return "";
    if (link.hasAttribute("download")) return "";

    const rawHref = link.getAttribute("href") || "";
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return "";

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch (error) {
      return "";
    }

    if (url.origin !== location.origin) return "";
    if (url.href === location.href) return "";
    if (url.hash && url.pathname === location.pathname) return "";
    if (!url.pathname.endsWith("/") && !url.pathname.endsWith(".html")) return "";

    return url.href;
  }

  function canSwapUrl(url) {
    try {
      const path = new URL(url, location.href).pathname;
      return path.includes("/pages/carrera/") || path.includes("/pages/materia/");
    } catch (error) {
      return false;
    }
  }

  function getRootPath() {
    if (location.pathname.includes("/pages/tema/")) return "../../";
    if (location.pathname.includes("/pages/materia/")) return "../../";
    if (location.pathname.includes("/pages/carrera/")) return "../../";
    if (location.pathname.includes("/pages/")) return "../";
    return "./";
  }

  function getAppRootPath() {
    if (window.EstudiemosRoot) return window.EstudiemosRoot;

    const script = document.querySelector('script[src*="scripts/theme-init.js"], script[src*="scripts/smooth-nav.js"]');
    const src = script?.getAttribute("src") || "";
    const root = src.replace(/scripts\/(?:theme-init|smooth-nav)\.js(?:\?.*)?$/, "");
    return root || getRootPath();
  }
})();
