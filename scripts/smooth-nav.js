(function () {
  if (window.__estudiemosSmoothNavInstalled) return;
  window.__estudiemosSmoothNavInstalled = true;

  const cache = new Map();
  const pending = new Map();
  const MAX_IDLE_PREFETCH = 12;
  const MAIN_SELECTOR = "main.container";
  let currentStateSaved = false;
  let navigating = false;

  bindNavigationHints();
  prefetchVisibleLinksSoon();

  function bindNavigationHints() {
    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent);
    document.addEventListener("touchstart", handleIntent, { passive: true });
    document.addEventListener("mousedown", handleIntent, { passive: true });
    document.addEventListener("click", handleClick, { capture: true });

    window.addEventListener("popstate", (event) => {
      const url = event.state?.url || location.href;
      if (canSwapUrl(url)) {
        swapTo(url, { push: false, restoreScroll: true });
      }
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

  async function swapTo(url, options) {
    if (navigating) return;
    navigating = true;
    document.documentElement.classList.add("is-navigating");

    try {
      const html = await getPageHtml(url);
      const next = parsePage(html);
      if (!next.main) throw new Error("Pagina sin contenido principal");

      if (!currentStateSaved) {
        history.replaceState({ url: location.href, scroll: scrollY }, "", location.href);
        currentStateSaved = true;
      }

      const currentMain = document.querySelector(MAIN_SELECTOR);
      if (!currentMain) throw new Error("Pagina sin main");

      document.title = next.title || document.title;
      currentMain.replaceWith(next.main);

      if (options.push) history.pushState({ url, scroll: 0 }, "", url);

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
    const rootPath = getRootPath();
    document.querySelector(".brand")?.setAttribute("href", rootPath);
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

    if (history.state?.url) {
      history.replaceState({ ...history.state, scroll: scrollY }, "", location.href);
    }
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
})();
