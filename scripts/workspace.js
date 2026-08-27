(function () {
  if (!document.body.classList.contains("workspace-home")) return;

  const BUCKET = "workspace-files";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const VIEW_KEY = "estudiemos_workspace_view";
  const WORKSPACE_CHANGE_KEY = "estudiemos_workspace_changed";
  const PLANS = window.EstudiemosPlans;
  const state = {
    client: null,
    user: null,
    items: [],
    currentFolderId: null,
    query: "",
    sort: "updated",
    view: readView(),
    busy: false,
    aiPlan: null,
    planStatus: initialPlanStatus()
  };
  let lastWorkspaceMarker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || "0";
  let workspaceRefreshTimer = 0;

  const elements = {
    items: document.querySelector("[data-workspace-items]"),
    state: document.querySelector("[data-workspace-state]"),
    status: document.querySelector("[data-workspace-status]"),
    breadcrumbs: document.querySelector("[data-workspace-breadcrumbs]"),
    search: document.querySelector("[data-workspace-search]"),
    sort: document.querySelector("[data-workspace-sort]"),
    dropzone: document.querySelector("[data-workspace-dropzone]"),
    fileInput: document.querySelector("[data-workspace-file-input]"),
    planName: document.querySelector("[data-workspace-plan-name]"),
    planUsage: document.querySelector("[data-workspace-plan-usage]")
  };

  addModal();
  initializeWorkspaceHistory();
  bindEvents();
  initialize();

  async function initialize() {
    const account = await waitForAccount();
    if (!account) return showUnavailable();
    await account.whenReady();
    state.client = account.getClient();
    state.user = account.getUser();
    if (!state.client) return showUnavailable();
    if (!state.user) return showSignedOut();
    await loadPlanStatus();
    await loadItems();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const upload = event.target.closest("[data-workspace-upload]");
      const folder = event.target.closest("[data-workspace-new-folder]");
      const add = event.target.closest("[data-workspace-add]");
      const addAction = event.target.closest("[data-workspace-add-action]");
      const ai = event.target.closest("[data-workspace-ai]");
      const view = event.target.closest("[data-workspace-view]");
      const breadcrumb = event.target.closest("[data-workspace-folder]");
      const open = event.target.closest("[data-workspace-open]");
      const menu = event.target.closest("[data-workspace-menu]");
      const signIn = event.target.closest("[data-workspace-signin]");
      const plans = event.target.closest("[data-workspace-plans]");
      const planSelect = event.target.closest("[data-workspace-plan-select]");

      if (upload) runAuthenticated(() => elements.fileInput?.click());
      if (folder) runAuthenticated(openNewFolderModal);
      if (add) runAuthenticated(openAddModal);
      if (addAction) {
        closeModal();
        if (addAction.dataset.workspaceAddAction === "folder") runAuthenticated(openNewFolderModal);
        if (addAction.dataset.workspaceAddAction === "upload") runAuthenticated(() => elements.fileInput?.click());
      }
      if (ai) runAuthenticated(openAiModal);
      if (signIn) window.EstudiemosAccount?.open();
      if (plans) openPlansModal();
      if (planSelect) selectPlanPreview(planSelect.dataset.workspacePlanSelect);
      if (view) setView(view.dataset.workspaceView);
      if (breadcrumb) openFolder(breadcrumb.dataset.workspaceFolder || null);
      if (open) openItem(open.dataset.workspaceOpen);
      if (menu) openItemMenu(menu.dataset.workspaceMenu);
      if (event.target.closest("[data-workspace-modal-close]") || event.target.matches(".workspace-modal-shell")) closeModal();
    });

    elements.search?.addEventListener("input", () => {
      state.query = elements.search.value.trim();
      renderItems();
    });
    elements.sort?.addEventListener("change", () => {
      state.sort = elements.sort.value;
      renderItems();
    });
    elements.fileInput?.addEventListener("change", async () => {
      await uploadFiles(Array.from(elements.fileInput.files || []));
      elements.fileInput.value = "";
    });

    let dragDepth = 0;
    elements.dropzone?.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      elements.dropzone.classList.add("is-dragging");
    });
    elements.dropzone?.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    });
    elements.dropzone?.addEventListener("dragleave", (event) => {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) elements.dropzone.classList.remove("is-dragging");
    });
    elements.dropzone?.addEventListener("drop", async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      elements.dropzone.classList.remove("is-dragging");
      await runAuthenticated(() => uploadFiles(Array.from(event.dataTransfer.files || [])));
    });

    window.addEventListener("estudiemos:account-change", async (event) => {
      const nextUser = event.detail?.user || null;
      const previousId = state.user?.id || "";
      state.client = window.EstudiemosAccount?.getClient() || state.client;
      state.user = nextUser;
      if (!nextUser) {
        state.items = [];
        state.currentFolderId = null;
        state.planStatus = initialPlanStatus();
        showSignedOut();
        return;
      }
      if (nextUser.id !== previousId) {
        lastWorkspaceMarker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || "0";
        await loadPlanStatus();
        await loadItems();
      }
    });
    window.addEventListener("estudiemos:cloud-restored", () => {
      const marker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || "0";
      if (!state.user || marker === lastWorkspaceMarker) return;
      lastWorkspaceMarker = marker;
      window.clearTimeout(workspaceRefreshTimer);
      workspaceRefreshTimer = window.setTimeout(() => loadItems({ quiet: true }), 80);
    });
    window.addEventListener("estudiemos-android-ready", syncWorkspaceWithAndroid);
    window.addEventListener("estudiemos:open-workspace-item", (event) => {
      const item = getItem(event.detail?.id);
      if (!item) return;
      if (item.kind === "folder") openFolder(item.id);
      else openItem(item.id);
    });

    window.addEventListener("popstate", (event) => {
      const folderId = typeof event.state?.workspaceFolderId === "string"
        ? event.state.workspaceFolderId
        : null;
      const nextFolderId = folderId && getItem(folderId)?.kind === "folder" ? folderId : null;
      if (nextFolderId === state.currentFolderId) return;
      state.currentFolderId = nextFolderId;
      state.query = "";
      if (elements.search) elements.search.value = "";
      render();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  async function waitForAccount() {
    const started = Date.now();
    while (!window.EstudiemosAccount && Date.now() - started < 12000) {
      await delay(50);
    }
    return window.EstudiemosAccount || null;
  }

  async function loadItems(options = {}) {
    const quiet = Boolean(options.quiet);
    if (!state.client || !state.user) return;
    if (!quiet) setBusy(true, "Cargando tu espacio...");
    const result = await state.client
      .from("workspace_items")
      .select("id,parent_id,kind,name,storage_path,mime_type,size_bytes,created_at,updated_at")
      .eq("user_id", state.user.id)
      .order("updated_at", { ascending: false });
    setBusy(false);

    if (result.error) {
      console.error("Workspace load failed", result.error);
      if (quiet) return;
      return showState(
        "Tu espacio todavía no está disponible",
        "No pudimos abrir el almacenamiento personal. Probá recargar la página en unos minutos.",
        "error"
      );
    }

    state.items = result.data || [];
    lastWorkspaceMarker = localStorage.getItem(WORKSPACE_CHANGE_KEY) || lastWorkspaceMarker;
    const historyFolderId = typeof history.state?.workspaceFolderId === "string"
      ? history.state.workspaceFolderId
      : null;
    if (historyFolderId && getItem(historyFolderId)?.kind === "folder") {
      state.currentFolderId = historyFolderId;
    }
    if (state.currentFolderId && !getItem(state.currentFolderId)) state.currentFolderId = null;
    render();
    notifyWorkspaceUpdate();
    openRequestedWorkspaceItem();
  }

  async function loadPlanStatus() {
    state.planStatus = initialPlanStatus();
    if (!state.user) return;
    const accessToken = window.EstudiemosAccount?.getSession()?.access_token || "";
    if (!accessToken) return;
    try {
      const response = await fetch("/api/plan-status", {
        headers: { "Authorization": `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Plan unavailable");
      state.planStatus = normalizePlanStatus(result);
    } catch (error) {
      console.warn("Plan status unavailable", error);
    }
  }

  function render() {
    renderBreadcrumbs();
    renderItems();
    renderViewButtons();
    renderPlanSummary();
  }

  function renderItems() {
    if (!state.user) return showSignedOut();
    const visible = getVisibleItems();
    const searching = Boolean(state.query);
    elements.items.classList.toggle("is-list", state.view === "list");

    if (!visible.length && searching) {
      return showState(
        "No encontramos coincidencias",
        "Probá con otro nombre o borrá la búsqueda.",
        "empty",
        ""
      );
    }

    elements.state.hidden = true;
    elements.items.hidden = false;
    elements.items.innerHTML = `${visible.map(renderItem).join("")}${searching ? "" : renderAddTile()}`;
  }

  function renderAddTile() {
    return `
      <button class="workspace-add-tile" type="button" data-workspace-add aria-label="Agregar carpeta o archivo">
        <span class="workspace-add-tile__icon">${icon("plus")}</span>
        <span class="workspace-add-tile__copy"><strong>Agregar</strong><small>Carpeta o archivo</small></span>
      </button>`;
  }

  function getVisibleItems() {
    const query = normalize(state.query);
    const items = state.items.filter((item) => {
      if (query) return normalize(item.name).includes(query);
      return (item.parent_id || null) === state.currentFolderId;
    });

    return items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      if (state.sort === "name") return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (state.sort === "type") return fileLabel(a).localeCompare(fileLabel(b), "es");
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
  }

  function renderItem(item) {
    const visual = itemVisual(item);
    return `
      <article class="workspace-item" style="--item-color:${visual.color}">
        <button class="workspace-item__open" type="button" data-workspace-open="${item.id}" aria-label="Abrir ${escapeAttr(item.name)}">
          <span class="workspace-item__icon">${icon(visual.icon)}</span>
          <span class="workspace-item__copy">
            <span class="workspace-item__name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
            <span class="workspace-item__meta">${escapeHtml(item.kind === "folder" ? folderMeta(item.id) : `${fileLabel(item)} · ${formatSize(item.size_bytes)}`)}</span>
          </span>
        </button>
        <button class="workspace-item__menu" type="button" data-workspace-menu="${item.id}" aria-label="Opciones de ${escapeAttr(item.name)}" title="Opciones">${icon("more")}</button>
      </article>`;
  }

  function renderBreadcrumbs() {
    const crumbs = [{ id: "", name: "Mi espacio" }];
    let cursor = state.currentFolderId ? getItem(state.currentFolderId) : null;
    const chain = [];
    const visited = new Set();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      chain.unshift({ id: cursor.id, name: cursor.name });
      cursor = cursor.parent_id ? getItem(cursor.parent_id) : null;
    }
    crumbs.push(...chain);
    elements.breadcrumbs.innerHTML = crumbs.map((crumb, index) => `
      ${index ? "<span aria-hidden=\"true\">/</span>" : ""}
      <button type="button" data-workspace-folder="${crumb.id}" ${index === crumbs.length - 1 ? 'aria-current="page"' : ""}>${escapeHtml(crumb.name)}</button>
    `).join("");
  }

  function renderViewButtons() {
    document.querySelectorAll("[data-workspace-view]").forEach((button) => {
      const active = button.dataset.workspaceView === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function showSignedOut() {
    notifyWorkspaceUpdate();
    renderPlanSummary();
    renderBreadcrumbs();
    showState(
      "Ingresá para abrir tu espacio",
      "Tus carpetas y archivos quedan privados y sincronizados en todos tus dispositivos.",
      "account",
      `<button class="workspace-btn workspace-btn--primary" type="button" data-workspace-signin>${icon("user")}<span>Ingresar o crear cuenta</span></button>`
    );
  }

  function showUnavailable() {
    renderPlanSummary();
    showState("No pudimos preparar tu espacio", "Revisá tu conexión y recargá la página.", "error");
  }

  function renderPlanSummary() {
    const plan = PLANS.get(state.planStatus.planId);
    const used = workspaceUsedBytes();
    if (elements.planName) elements.planName.textContent = plan.name;
    if (elements.planUsage) elements.planUsage.textContent = `${formatSize(used)} de ${formatSize(plan.storageBytes)}`;
  }

  function renderCurrentUsage() {
    const ai = state.planStatus.ai;
    const whatsapp = state.planStatus.whatsapp;
    return `<section class="workspace-plan-usage" aria-label="Uso del plan este mes">
      <span><small>IA este mes</small><strong>${ai.used} de ${ai.limit}</strong></span>
      <span><small>WhatsApp este mes</small><strong>${whatsapp.used} de ${whatsapp.limit}</strong></span>
      <span><small>Almacenamiento</small><strong>${formatSize(workspaceUsedBytes())} de ${formatSize(state.planStatus.storageBytes)}</strong></span>
    </section>`;
  }

  async function openPlansModal() {
    if (state.user) await loadPlanStatus();
    const selected = state.planStatus.planId;
    const planCard = (id, featured = false, badge = "") => {
      const plan = PLANS.get(id);
      return `
      <article class="workspace-plan-card ${featured ? "workspace-plan-card--featured" : ""} ${selected === id ? "is-selected" : ""}">
        ${badge ? `<span class="workspace-plan-badge">${badge}</span>` : ""}
        <header>
          <div><small>${selected === id ? "Plan de prueba activo" : id === "initial" ? "Organización manual" : id === "pro" ? "Uso intensivo" : "Organización activa"}</small><h3>${plan.shortName}</h3></div>
          <strong>$${new Intl.NumberFormat("es-AR").format(plan.priceArs)} ARS <span>${plan.billing}</span></strong>
        </header>
        <p>${escapeHtml(plan.description)}</p>
        <ul class="workspace-plan-features">${plan.features.map((feature) => `<li>${icon("check")}<span>${feature}</span></li>`).join("")}</ul>
        <button class="workspace-btn ${featured && selected !== id ? "workspace-btn--primary" : ""}" type="button" data-workspace-plan-select="${id}" ${selected === id ? "disabled" : ""}>${selected === id ? "Plan de prueba activo" : `Probar ${plan.shortName}`}</button>
      </article>`;
    };
    openModal({
      eyebrow: "Modo de prueba",
      title: "Planes de Estudiemos",
      wide: true,
      body: `<div class="workspace-modal__body workspace-plans-preview">
        <p class="workspace-plans-preview__notice"><strong>Sin cobros todavía.</strong> El plan que elijas sí aplicará sus límites para que podamos probar la experiencia completa antes del lanzamiento.</p>
        ${renderCurrentUsage()}
        <div class="workspace-plan-grid">
          ${planCard("initial", false, "Gratis")}
          ${planCard("plus", true, "Recomendado")}
          ${planCard("pro")}
        </div>
        <p class="workspace-plans-preview__foot"><strong>Al lanzamiento:</strong> habrá prueba de Plus y opciones mensual y por cuatrimestre. Los precios son referencias y todavía no existe contratación ni renovación automática.</p>
        <p class="workspace-plans-preview__foot">WhatsApp se habilitará cuando esté conectado el número oficial. El almacenamiento y la IA ya respetan el plan de prueba elegido.</p>
      </div>`,
      actions: '<button class="workspace-btn" type="button" data-workspace-modal-close>Cerrar</button>'
    });
  }

  async function selectPlanPreview(planId) {
    if (!PLANS.ids().includes(planId)) return;
    if (!state.user) return window.EstudiemosAccount?.open();
    const accessToken = window.EstudiemosAccount?.getSession()?.access_token || "";
    if (!accessToken) return window.EstudiemosAccount?.open();
    const button = document.querySelector(`[data-workspace-plan-select="${planId}"]`);
    if (button) button.disabled = true;
    try {
      const response = await fetch("/api/plan-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify({ planId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No pudimos cambiar el plan de prueba.");
      state.planStatus = normalizePlanStatus(result);
      renderPlanSummary();
      closeModal();
      setStatus(`Ahora estás probando ${PLANS.get(planId).name}. No se realizó ningún cobro.`, "success");
    } catch (error) {
      if (button) button.disabled = false;
      setModalError(error.message || "No pudimos cambiar el plan de prueba.");
    }
  }

  function showState(title, message, type, action = "") {
    elements.items.hidden = true;
    elements.state.hidden = false;
    elements.state.dataset.type = type;
    elements.state.innerHTML = `${type === "loading" ? '<span class="workspace-spinner" aria-hidden="true"></span>' : icon(type === "error" ? "alert" : type === "account" ? "lock" : "folder")}
      <h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${action}`;
  }

  function setBusy(busy, message = "") {
    state.busy = busy;
    document.querySelectorAll("[data-workspace-upload],[data-workspace-new-folder],[data-workspace-ai]").forEach((button) => {
      button.disabled = busy;
    });
    if (busy) showState(message, "", "loading");
  }

  function setStatus(message = "", type = "") {
    elements.status.textContent = message;
    elements.status.dataset.type = type;
  }

  function runAuthenticated(callback) {
    if (!state.user) {
      window.EstudiemosAccount?.open();
      return Promise.resolve();
    }
    return Promise.resolve(callback());
  }

  function initializeWorkspaceHistory() {
    const current = history.state && typeof history.state === "object" ? history.state : {};
    if (Object.prototype.hasOwnProperty.call(current, "workspaceFolderId")) return;
    history.replaceState({ ...current, estudiemosUi: current.estudiemosUi || "home", workspaceFolderId: null }, "", location.href);
  }

  function openFolder(id, options = {}) {
    if (id && getItem(id)?.kind !== "folder") return;
    const nextFolderId = id || null;
    if (nextFolderId === state.currentFolderId) return;
    state.currentFolderId = nextFolderId;
    state.query = "";
    if (elements.search) elements.search.value = "";
    if (options.history !== false) {
      history.pushState({
        ...(history.state || {}),
        estudiemosUi: nextFolderId ? "workspace-folder" : "home",
        workspaceFolderId: nextFolderId
      }, "", location.href);
    }
    render();
  }

  function notifyWorkspaceUpdate() {
    const folders = state.items.filter((item) => item.kind === "folder").length;
    const files = state.items.filter((item) => item.kind === "file").length;
    window.dispatchEvent(new CustomEvent("estudiemos:workspace-update", {
      detail: { user: Boolean(state.user), folders, files }
    }));
    syncWorkspaceWithAndroid();
  }

  function syncWorkspaceWithAndroid() {
    try {
      if (!window.EstudiemosAndroid || typeof window.EstudiemosAndroid.postMessage !== "function") return;
      window.EstudiemosAndroid.postMessage(JSON.stringify({
        type: "workspace-sync",
        items: state.items.map((item) => ({
          id: item.id,
          parentId: item.parent_id || null,
          kind: item.kind,
          name: item.name,
          mimeType: item.mime_type || "",
          sizeBytes: Math.max(0, Number(item.size_bytes) || 0),
          updatedAt: item.updated_at || ""
        }))
      }));
    } catch (_) {}
  }

  function openRequestedWorkspaceItem() {
    const url = new URL(location.href);
    const itemId = url.searchParams.get("workspaceItem") || "";
    if (!itemId) return;
    const item = getItem(itemId);
    url.searchParams.delete("workspaceItem");
    url.searchParams.delete("workspaceKind");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (!item) return setStatus("Ese elemento ya no está disponible.", "error");
    if (item.kind === "folder") openFolder(item.id, { history: false });
    else openItem(item.id);
  }

  async function openItem(id) {
    const item = getItem(id);
    if (!item) return;
    if (item.kind === "folder") return openFolder(item.id);
    setStatus("Abriendo archivo...");
    const result = await state.client.storage.from(BUCKET).createSignedUrl(item.storage_path, 120);
    if (result.error || !result.data?.signedUrl) return setStatus("No pudimos abrir este archivo.", "error");
    if (window.EstudiemosAndroid) location.href = result.data.signedUrl;
    else window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    setStatus("");
  }

  async function uploadFiles(files) {
    if (!files.length || state.busy) return;
    const accepted = files.filter((file) => {
      if (file.size <= MAX_FILE_SIZE) return true;
      setStatus(`${file.name} supera el máximo de 50 MB.`, "error");
      return false;
    });
    if (!accepted.length) return;

    const requiredBytes = accepted.reduce((total, file) => total + Math.max(0, Number(file.size) || 0), 0);
    const availableBytes = Math.max(0, state.planStatus.storageBytes - workspaceUsedBytes());
    if (requiredBytes > availableBytes) {
      setStatus(`No hay espacio suficiente en ${PLANS.get(state.planStatus.planId).name}. Te quedan ${formatSize(availableBytes)} disponibles.`, "error");
      return;
    }

    setBusy(true, `Subiendo ${accepted.length === 1 ? accepted[0].name : `${accepted.length} archivos`}...`);
    let completed = 0;
    const failures = [];

    for (const file of accepted) {
      const id = crypto.randomUUID();
      const path = `${state.user.id}/${id}/${safeStorageName(file.name)}`;
      const upload = await state.client.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });
      if (upload.error) {
        failures.push(file.name);
        continue;
      }
      const insert = await state.client.from("workspace_items").insert({
        id,
        user_id: state.user.id,
        parent_id: state.currentFolderId,
        kind: "file",
        name: cleanName(file.name),
        storage_path: path,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size
      });
      if (insert.error) {
        await state.client.storage.from(BUCKET).remove([path]);
        failures.push(insert.error.message?.includes("PLAN_STORAGE_LIMIT_REACHED") ? `${file.name} (sin espacio disponible)` : file.name);
        continue;
      }
      completed += 1;
    }

    if (completed) markWorkspaceChanged();
    await loadItems({ quiet: true });
    if (failures.length) return setStatus(`Se subieron ${completed}. No se pudieron subir: ${failures.join(", ")}.`, "error");
    setStatus(`${completed === 1 ? "Archivo subido" : `${completed} archivos subidos`} correctamente.`, "success");
  }

  function openNewFolderModal() {
    openModal({
      eyebrow: "Mi espacio",
      title: "Nueva carpeta",
      body: `<form class="workspace-modal__body" data-workspace-folder-form>
        <label class="workspace-field">Nombre<input name="name" maxlength="120" autocomplete="off" required autofocus placeholder="Ej: Proyecto final" /></label>
      </form>`,
      actions: `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn workspace-btn--primary" type="submit" form="workspace-folder-form">Crear carpeta</button>`
    });
    const form = document.querySelector("[data-workspace-folder-form]");
    form.id = "workspace-folder-form";
    form.addEventListener("submit", createFolder);
    form.elements.name.focus();
  }

  function openAddModal() {
    openModal({
      eyebrow: "Mi espacio",
      title: "Agregar",
      body: `<div class="workspace-modal__body"><div class="workspace-action-list">
        <button type="button" data-workspace-add-action="folder">${icon("folder")}<span><strong>Nueva carpeta</strong><small>Creá un espacio para ordenar tus archivos.</small></span></button>
        <button type="button" data-workspace-add-action="upload">${icon("upload")}<span><strong>Subir archivos</strong><small>Elegí uno o varios archivos del dispositivo.</small></span></button>
      </div></div>`,
      actions: ""
    });
  }

  async function createFolder(event) {
    event.preventDefault();
    const name = cleanName(event.currentTarget.elements.name.value);
    if (!name) return;
    setModalBusy(true, "Creando...");
    const result = await state.client.from("workspace_items").insert({
      user_id: state.user.id,
      parent_id: state.currentFolderId,
      kind: "folder",
      name
    });
    if (result.error) return setModalError("No pudimos crear la carpeta.");
    closeModal();
    markWorkspaceChanged();
    await loadItems({ quiet: true });
    setStatus("Carpeta creada.", "success");
  }

  function openItemMenu(id) {
    const item = getItem(id);
    if (!item) return;
    openModal({
      eyebrow: item.kind === "folder" ? "Carpeta" : fileLabel(item),
      title: item.name,
      body: `<div class="workspace-modal__body"><div class="workspace-action-list">
        ${item.kind === "file" ? `<button type="button" data-workspace-action="open">${icon("external")}<span>Abrir archivo</span></button>` : ""}
        <button type="button" data-workspace-action="rename">${icon("edit")}<span>Cambiar nombre</span></button>
        <button type="button" data-workspace-action="move">${icon("move")}<span>Mover a otra carpeta</span></button>
        <button type="button" data-workspace-action="delete" data-danger>${icon("trash")}<span>Eliminar</span></button>
      </div></div>`,
      actions: ""
    });
    document.querySelector(".workspace-action-list")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-workspace-action]")?.dataset.workspaceAction;
      if (action === "open") { closeModal(); openItem(item.id); }
      if (action === "rename") openRenameModal(item);
      if (action === "move") openMoveModal(item);
      if (action === "delete") openDeleteModal(item);
    });
  }

  function openRenameModal(item) {
    openModal({
      eyebrow: "Editar",
      title: "Cambiar nombre",
      body: `<form class="workspace-modal__body" data-workspace-rename-form>
        <label class="workspace-field">Nombre<input name="name" maxlength="120" value="${escapeAttr(item.name)}" required /></label>
      </form>`,
      actions: `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn workspace-btn--primary" type="submit" form="workspace-rename-form">Guardar</button>`
    });
    const form = document.querySelector("[data-workspace-rename-form]");
    form.id = "workspace-rename-form";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = cleanName(form.elements.name.value);
      if (!name) return;
      setModalBusy(true, "Guardando...");
      const result = await updateItem(item.id, { name });
      if (result.error) return setModalError("No pudimos cambiar el nombre.");
      closeModal();
      markWorkspaceChanged();
      await loadItems({ quiet: true });
    });
    form.elements.name.select();
  }

  function openMoveModal(item) {
    const blocked = new Set(item.kind === "folder" ? [item.id, ...descendantIds(item.id)] : []);
    const folders = state.items.filter((candidate) => candidate.kind === "folder" && !blocked.has(candidate.id));
    openModal({
      eyebrow: "Organizar",
      title: `Mover ${item.kind === "folder" ? "carpeta" : "archivo"}`,
      body: `<form class="workspace-modal__body" data-workspace-move-form>
        <label class="workspace-field">Destino<select name="parent"><option value="">Mi espacio</option>${folders.map((folder) => `<option value="${folder.id}" ${folder.id === item.parent_id ? "selected" : ""}>${escapeHtml(folderPath(folder))}</option>`).join("")}</select></label>
      </form>`,
      actions: `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn workspace-btn--primary" type="submit" form="workspace-move-form">Mover</button>`
    });
    const form = document.querySelector("[data-workspace-move-form]");
    form.id = "workspace-move-form";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const parentId = form.elements.parent.value || null;
      setModalBusy(true, "Moviendo...");
      const result = await updateItem(item.id, { parent_id: parentId });
      if (result.error) return setModalError("No pudimos mover este elemento.");
      closeModal();
      markWorkspaceChanged();
      await loadItems({ quiet: true });
    });
  }

  function openDeleteModal(item) {
    const childCount = item.kind === "folder" ? descendantIds(item.id).length : 0;
    openModal({
      eyebrow: "Confirmar",
      title: `Eliminar ${item.name}`,
      body: `<div class="workspace-modal__body"><p class="workspace-ai-intro">${childCount ? `También se eliminarán los ${childCount} elementos que contiene.` : "Esta acción no se puede deshacer."}</p><p data-workspace-modal-error></p></div>`,
      actions: `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn" type="button" data-workspace-confirm-delete style="color:var(--danger)">Eliminar</button>`
    });
    document.querySelector("[data-workspace-confirm-delete]")?.addEventListener("click", () => deleteItem(item));
  }

  async function deleteItem(item) {
    setModalBusy(true, "Eliminando...");
    const ids = [item.id, ...descendantIds(item.id)];
    const files = state.items.filter((candidate) => ids.includes(candidate.id) && candidate.storage_path);
    if (files.length) {
      const removed = await state.client.storage.from(BUCKET).remove(files.map((file) => file.storage_path));
      if (removed.error) return setModalError("No pudimos eliminar los archivos almacenados.");
    }
    const result = await state.client.from("workspace_items").delete().in("id", ids);
    if (result.error) return setModalError("No pudimos eliminar este elemento.");
    closeModal();
    markWorkspaceChanged();
    await loadItems({ quiet: true });
    setStatus("Elemento eliminado.", "success");
  }

  function openAiModal() {
    state.aiPlan = null;
    openModal({
      wide: true,
      eyebrow: "Asistente inteligente",
      title: "Organizar mi espacio",
      body: `<form class="workspace-modal__body" data-workspace-ai-form>
        <p class="workspace-ai-intro">Decile cómo querés ordenar tus archivos. La IA preparará una vista previa y no borrará nada.</p>
        <label class="workspace-field">Tu indicación<textarea name="instruction" maxlength="1000" required placeholder="Ej: Creá carpetas para proyectos, apuntes y documentos, y ordená cada archivo donde corresponda."></textarea></label>
        <p class="workspace-ai-intro" data-workspace-ai-status>Solo se envían los nombres, tipos y ubicación de los elementos.</p>
        <div data-workspace-ai-preview></div>
      </form>`,
      actions: `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn workspace-btn--ai" type="submit" form="workspace-ai-form">${icon("sparkles")}<span>Preparar organización</span></button>`
    });
    const form = document.querySelector("[data-workspace-ai-form]");
    form.id = "workspace-ai-form";
    form.addEventListener("submit", requestAiPlan);
    form.elements.instruction.focus();
  }

  async function requestAiPlan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const instruction = form.elements.instruction.value.trim();
    if (!instruction) return;
    setModalBusy(true, "Analizando tu espacio...");
    const payload = {
      instruction,
      items: state.items.slice(0, 400).map((item) => ({
        id: item.id,
        parentId: item.parent_id || "",
        kind: item.kind,
        name: item.name,
        mimeType: item.mime_type || "",
        sizeBytes: Number(item.size_bytes) || 0
      }))
    };

    try {
      const accessToken = window.EstudiemosAccount?.getSession()?.access_token || "";
      const response = await fetch("/api/workspace-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No pudimos interpretar la indicación.");
      state.aiPlan = result.plan;
      renderAiPlan();
    } catch (error) {
      setModalError(error.message || "La IA no respondió. Probá nuevamente.");
    }
  }

  function renderAiPlan() {
    const preview = document.querySelector("[data-workspace-ai-preview]");
    const plan = state.aiPlan || {};
    const actions = [
      ...(plan.createFolders || []).map((folder) => `<li>${icon("folder")}<span>Crear carpeta <strong>${escapeHtml(folder.name)}</strong></span></li>`),
      ...(plan.changes || []).map((change) => {
        const item = getItem(change.itemId);
        const destination = change.destinationFolderId ? getItem(change.destinationFolderId)?.name : change.destinationFolderKey ? "una carpeta nueva" : "Mi espacio";
        const rename = change.newName && change.newName !== item?.name ? ` y renombrar como <strong>${escapeHtml(change.newName)}</strong>` : "";
        return `<li>${icon("move")}<span>Mover <strong>${escapeHtml(item?.name || "elemento")}</strong> a ${escapeHtml(destination || "Mi espacio")}${rename}</span></li>`;
      })
    ];
    const clarification = plan.clarification || "";
    preview.innerHTML = clarification
      ? `<p class="workspace-ai-intro">${escapeHtml(clarification)}</p>`
      : actions.length
        ? `<p class="workspace-ai-intro"><strong>${escapeHtml(plan.summary || "Plan listo")}</strong></p><ul class="workspace-ai-plan">${actions.join("")}</ul>`
        : `<p class="workspace-ai-intro">No hay cambios necesarios para aplicar.</p>`;
    setModalBusy(false);
    const actionsBox = document.querySelector(".workspace-modal__actions");
    if (actions.length && !clarification) {
      actionsBox.innerHTML = `<button class="workspace-btn" type="button" data-workspace-modal-close>Cancelar</button><button class="workspace-btn workspace-btn--primary" type="button" data-workspace-apply-ai>Aplicar organización</button>`;
      actionsBox.querySelector("[data-workspace-apply-ai]").addEventListener("click", applyAiPlan);
    }
  }

  async function applyAiPlan() {
    const plan = state.aiPlan;
    if (!plan) return;
    setModalBusy(true, "Aplicando organización...");
    const created = new Map();
    let pending = [...(plan.createFolders || [])];

    for (let pass = 0; pass < 20 && pending.length; pass += 1) {
      const next = [];
      for (const folder of pending) {
        const parentId = folder.parentKey ? created.get(folder.parentKey) : folder.parentId || null;
        if (folder.parentKey && !parentId) { next.push(folder); continue; }
        const result = await state.client.from("workspace_items").insert({
          user_id: state.user.id,
          parent_id: parentId,
          kind: "folder",
          name: cleanName(folder.name)
        }).select("id").single();
        if (result.error) return setModalError("No pudimos crear una de las carpetas del plan.");
        created.set(folder.key, result.data.id);
      }
      if (next.length === pending.length) return setModalError("El plan contiene una ubicación que no pudimos resolver.");
      pending = next;
    }

    for (const change of plan.changes || []) {
      const item = getItem(change.itemId);
      if (!item) continue;
      const parentId = change.destinationFolderKey
        ? created.get(change.destinationFolderKey)
        : change.destinationFolderId || null;
      if (item.kind === "folder" && (parentId === item.id || descendantIds(item.id).includes(parentId))) continue;
      const patch = { parent_id: parentId };
      if (change.newName) patch.name = cleanName(change.newName);
      const result = await updateItem(item.id, patch);
      if (result.error) return setModalError("No pudimos aplicar todos los movimientos del plan.");
    }

    closeModal();
    markWorkspaceChanged();
    await loadItems({ quiet: true });
    setStatus("Organización aplicada correctamente.", "success");
  }

  function markWorkspaceChanged() {
    const marker = String(Date.now());
    lastWorkspaceMarker = marker;
    localStorage.setItem(WORKSPACE_CHANGE_KEY, marker);
    window.dispatchEvent(new CustomEvent("estudiemos:data-change", {
      detail: { key: WORKSPACE_CHANGE_KEY }
    }));
  }

  async function updateItem(id, patch) {
    return state.client.from("workspace_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  }

  function addModal() {
    if (document.querySelector(".workspace-modal-shell")) return;
    const shell = document.createElement("section");
    shell.className = "workspace-modal-shell";
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    shell.innerHTML = '<div class="workspace-modal" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(shell);
  }

  function openModal({ eyebrow, title, body, actions, wide = false }) {
    const shell = document.querySelector(".workspace-modal-shell");
    const modal = shell.querySelector(".workspace-modal");
    modal.className = `workspace-modal${wide ? " workspace-modal--wide" : ""}`;
    modal.innerHTML = `<header class="workspace-modal__head"><div><p>${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2></div><button class="workspace-modal__close" type="button" data-workspace-modal-close aria-label="Cerrar">${icon("close")}</button></header>${body}<div class="workspace-modal__actions">${actions}</div>`;
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    document.body.classList.add("workspace-modal-open");
  }

  function closeModal() {
    const shell = document.querySelector(".workspace-modal-shell");
    if (!shell || shell.hidden) return;
    shell.hidden = true;
    shell.setAttribute("aria-hidden", "true");
    document.body.classList.remove("workspace-modal-open");
    state.aiPlan = null;
  }

  function setModalBusy(busy, message = "") {
    document.querySelectorAll(".workspace-modal button,.workspace-modal input,.workspace-modal textarea,.workspace-modal select").forEach((control) => {
      control.disabled = busy;
    });
    const status = document.querySelector("[data-workspace-ai-status]");
    if (status && message) status.textContent = message;
  }

  function setModalError(message) {
    setModalBusy(false);
    const target = document.querySelector("[data-workspace-ai-status], [data-workspace-modal-error]");
    if (target) {
      target.textContent = message;
      target.style.color = "var(--danger)";
    }
  }

  function setView(view) {
    if (!['grid', 'list'].includes(view)) return;
    state.view = view;
    try { localStorage.setItem(VIEW_KEY, view); } catch (error) {}
    renderItems();
    renderViewButtons();
  }

  function readView() {
    try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch (error) { return "grid"; }
  }

  function initialPlanStatus() {
    const plan = PLANS?.get?.("initial") || {
      id: "initial",
      storageBytes: 250 * 1024 * 1024,
      monthlyAiActions: 20,
      monthlyWhatsappActions: 5
    };
    return {
      planId: plan.id,
      mode: "test",
      billingEnabled: false,
      storageBytes: plan.storageBytes,
      ai: { used: 0, limit: plan.monthlyAiActions },
      whatsapp: { used: 0, limit: plan.monthlyWhatsappActions }
    };
  }

  function normalizePlanStatus(value) {
    const plan = PLANS.get(value?.planId);
    return {
      planId: plan.id,
      mode: value?.mode === "active" ? "active" : "test",
      billingEnabled: Boolean(value?.billingEnabled),
      storageBytes: plan.storageBytes,
      ai: normalizeUsage(value?.ai, plan.monthlyAiActions),
      whatsapp: normalizeUsage(value?.whatsapp, plan.monthlyWhatsappActions)
    };
  }

  function normalizeUsage(value, limit) {
    return {
      used: Math.max(0, Math.min(limit, Number(value?.used) || 0)),
      limit
    };
  }

  function workspaceUsedBytes() {
    return state.items
      .filter((item) => item.kind === "file")
      .reduce((total, item) => total + Math.max(0, Number(item.size_bytes) || 0), 0);
  }

  function getItem(id) {
    return state.items.find((item) => item.id === id) || null;
  }

  function descendantIds(parentId) {
    const ids = [];
    const queue = [parentId];
    while (queue.length) {
      const parent = queue.shift();
      state.items.filter((item) => item.parent_id === parent).forEach((item) => {
        if (!ids.includes(item.id)) { ids.push(item.id); queue.push(item.id); }
      });
    }
    return ids;
  }

  function folderMeta(id) {
    const count = state.items.filter((item) => item.parent_id === id).length;
    return `${count} ${count === 1 ? "elemento" : "elementos"}`;
  }

  function folderPath(folder) {
    const names = [folder.name];
    let cursor = folder.parent_id ? getItem(folder.parent_id) : null;
    while (cursor && names.length < 8) { names.unshift(cursor.name); cursor = cursor.parent_id ? getItem(cursor.parent_id) : null; }
    return names.join(" / ");
  }

  function itemVisual(item) {
    if (item.kind === "folder") return { icon: "folder", color: "#82adff" };
    const type = item.mime_type || "";
    const extension = item.name.split(".").pop().toLowerCase();
    if (type.includes("pdf") || extension === "pdf") return { icon: "file", color: "#ef8b8b" };
    if (type.startsWith("image/")) return { icon: "image", color: "#69c69f" };
    if (type.includes("spreadsheet") || ["xls", "xlsx", "csv"].includes(extension)) return { icon: "sheet", color: "#66c7ba" };
    if (type.includes("zip") || ["zip", "rar", "7z"].includes(extension)) return { icon: "archive", color: "#d6ad65" };
    if (type.includes("word") || ["doc", "docx", "txt"].includes(extension)) return { icon: "file", color: "#76a9fa" };
    return { icon: "file", color: "#a5afc5" };
  }

  function fileLabel(item) {
    if (item.kind === "folder") return "Carpeta";
    const extension = item.name.includes(".") ? item.name.split(".").pop().toUpperCase() : "Archivo";
    return extension.length <= 6 ? extension : "Archivo";
  }

  function formatSize(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GB`;
  }

  function cleanName(value) {
    return String(value || "").replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function safeStorageName(value) {
    const clean = cleanName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
    return clean || "archivo";
  }

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function hasFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function icon(name) {
    const paths = {
      folder: '<path d="M3 6.5h6l2 2h10v10H3v-12Z"/>',
      file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 4"/>',
      sheet: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 9h16M10 9v12M4 15h16"/>',
      archive: '<path d="M5 5h14v16H5V5Zm2-2h10v2H7V3Zm4 5h2m-2 3h2m-2 3h2m-2 3h2"/>',
      upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      close: '<path d="m7 7 10 10M17 7 7 17"/>',
      external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
      edit: '<path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9.5-13 3.5 3.5"/>',
      move: '<path d="M5 7h8m0 0-3-3m3 3-3 3M19 17h-8m0 0 3-3m-3 3 3 3"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
      sparkles: '<path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Zm6 11 .7 2.3L21 17.5l-2.3 1.2L18 21l-.7-2.3-2.3-1.2 2.3-1.2L18 14Z"/>',
      check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
      plus: '<path d="M12 5v14M5 12h14"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
  }
})();
