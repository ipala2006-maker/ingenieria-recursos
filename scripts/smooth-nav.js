(function () {
  if (window.__estudiemosSmoothNavInstalled) return;
  window.__estudiemosSmoothNavInstalled = true;

  const pageCache = new Map();
  const pending = new Map();
  const MAX_IDLE_PREFETCH = 10;
  let navigating = false;

  bindNavigation();
  prefetchVisibleLinksSoon();

  function bindNavigation() {
    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent);
    document.addEventListener("touchstart", handleIntent, { passive: true });
    document.addEventListener("click", handleClick, { capture: true });

    window.addEventListener("popstate", () => {
      navigateTo(location.href, false);
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

    event.preventDefault();
    navigateTo(url, true);
  }

  async function navigateTo(url, shouldPush) {
    if (navigating || url === location.href) return;
    navigating = true;
    saveCurrentScroll();
    document.documentElement.classList.add("is-navigating");

    try {
      const html = await getPage(url);
      await swapPage(html, url, shouldPush);
    } catch (error) {
      location.href = url;
    } finally {
      navigating = false;
      document.documentElement.classList.remove("is-navigating");
    }
  }

  async function getPage(url) {
    if (pageCache.has(url)) return pageCache.get(url);
    if (pending.has(url)) return pending.get(url);

    const request = fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache"
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar la pagina");
        return response.text();
      })
      .then((html) => {
        pageCache.set(url, html);
        return html;
      })
      .finally(() => pending.delete(url));

    pending.set(url, request);
    return request;
  }

  async function swapPage(html, url, shouldPush) {
    const parser = new DOMParser();
    const nextDocument = parser.parseFromString(html, "text/html");
    const nextBody = nextDocument.body;

    if (!nextBody) throw new Error("La pagina no tiene body");

    document.title = nextDocument.title || document.title;
    document.body.replaceWith(nextBody);

    if (shouldPush) history.pushState({ smoothNav: true }, "", url);

    window.EstudiemosTheme?.sync?.();
    await runPageScripts();
    restoreScrollForCurrentPage(shouldPush);
    prefetchVisibleLinksSoon();
  }

  async function runPageScripts() {
    const scripts = Array.from(document.body.querySelectorAll("script"));

    for (const oldScript of scripts) {
      const src = oldScript.getAttribute("src") || "";

      if (src.includes("scripts/theme-init.js") || src.includes("scripts/smooth-nav.js")) {
        oldScript.remove();
        continue;
      }

      if (src.includes("data/data.js") && window.DATA) {
        oldScript.remove();
        continue;
      }

      if (src.includes("scripts/global-search.js")) {
        document.querySelectorAll('script[src*="scripts/bandeja.js"]').forEach((script) => script.remove());
      }

      await executeScript(oldScript);
    }
  }

  function executeScript(oldScript) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");

      Array.from(oldScript.attributes).forEach((attr) => {
        script.setAttribute(attr.name, attr.value);
      });

      if (oldScript.src) {
        script.async = false;
        script.onload = resolve;
        script.onerror = reject;
      } else {
        script.textContent = makeInlineScriptRepeatable(oldScript.textContent || "");
      }

      oldScript.replaceWith(script);
      if (!oldScript.src) resolve();
    });
  }

  function makeInlineScriptRepeatable(code) {
    return code
      .replace(/\bconst\b/g, "var")
      .replace(/\blet\b/g, "var");
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
    if (pageCache.has(url) || pending.has(url)) return;
    if (navigator.connection?.saveData) return;
    getPage(url).catch(() => {});
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

  function saveCurrentScroll() {
    try {
      sessionStorage.setItem(`estudiemos_scroll:${location.pathname}`, String(scrollY));
    } catch (error) {}
  }

  function restoreScrollForCurrentPage(shouldPush) {
    if (shouldPush) {
      scrollTo(0, 0);
      return;
    }

    try {
      const saved = sessionStorage.getItem(`estudiemos_scroll:${location.pathname}`);
      const y = Number(saved || 0);
      requestAnimationFrame(() => scrollTo(0, Number.isFinite(y) ? y : 0));
    } catch (error) {
      scrollTo(0, 0);
    }
  }
})();