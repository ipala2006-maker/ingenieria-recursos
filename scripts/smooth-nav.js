(function () {
  const prefetched = new Set();
  const pending = new Map();
  const MAX_IDLE_PREFETCH = 10;

  installStyles();
  bindNavigationHints();
  prefetchVisibleLinksSoon();

  function bindNavigationHints() {
    document.addEventListener("pointerover", handleIntent, { passive: true });
    document.addEventListener("focusin", handleIntent);
    document.addEventListener("touchstart", handleIntent, { passive: true });
    document.addEventListener("click", handleClick, { capture: true });
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

    try {
      sessionStorage.setItem(`estudiemos_scroll:${location.pathname}`, String(scrollY));
    } catch (error) {}

    prefetchPage(url);
    document.documentElement.classList.add("is-navigating");
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
    if (prefetched.has(url) || pending.has(url)) return;
    if (navigator.connection?.saveData) return;

    const request = fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache"
    })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo precargar");
        prefetched.add(url);
      })
      .catch(() => {})
      .finally(() => pending.delete(url));

    pending.set(url, request);
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

  function installStyles() {
    if (document.getElementById("smoothNavStyles")) return;

    const style = document.createElement("style");
    style.id = "smoothNavStyles";
    style.textContent = `
      html::before{
        content:"";
        position:fixed;
        left:0;
        top:0;
        width:100%;
        height:2px;
        z-index:9999;
        pointer-events:none;
        background:var(--accent,#1a73e8);
        transform:scaleX(0);
        transform-origin:left center;
        opacity:0;
      }

      html.is-navigating::before{
        opacity:1;
        animation:estudiemosNavProgress .42s ease-out forwards;
      }

      html.is-navigating body{
        cursor:progress;
      }

      @keyframes estudiemosNavProgress{
        from{ transform:scaleX(0); }
        to{ transform:scaleX(.82); }
      }
    `;
    document.head.appendChild(style);
  }
})();