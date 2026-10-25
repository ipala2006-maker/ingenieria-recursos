(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EstudiemosDriveFiles = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BASE = 'https://www.googleapis.com/drive/v3/';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const FOLDER = 'application/vnd.google-apps.folder';
  const FIELDS = 'id,name,mimeType,size,modifiedTime,parents,webViewLink,appProperties,trashed';
  const MAX_FILE = 50 * 1024 * 1024;
  const extensions = new Set('pdf doc docx xls xlsx csv txt md rtf ppt pptx jpg jpeg png gif webp heic zip rar 7z json xml mp3 m4a wav mp4 mov webm'.split(' '));
  const quote = value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{5,200}$/.test(value)) throw new Error('Archivo no v\u00e1lido.'); return value; };
  const name = value => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Us\u00e1 un nombre de 1 a 120 caracteres.');
    return value.trim();
  };
  function fileCheck(file) {
    name(file?.name);
    if (!extensions.has(file.name.split('.').pop().toLowerCase())) throw new Error('Ese tipo de archivo no est\u00e1 permitido.');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE) throw new Error('El archivo debe ocupar entre 1 byte y 50 MB.');
  }
  function openUrl(item) {
    id(item.id);
    if (item.webViewLink) {
      try { const url = new URL(item.webViewLink); if (url.protocol === 'https:' && ['drive.google.com','docs.google.com'].includes(url.hostname) && !url.username && !url.password) return url.href; } catch (_) {}
    }
    return 'https://drive.google.com/file/d/' + item.id + '/view';
  }
  class DriveFiles {
    constructor({userId, getToken, fetchImpl = (...args) => fetch(...args), isCurrent = () => true, browse = false}) {
      if (typeof userId !== 'string' || !userId || userId.length > 100) throw new Error('Cuenta no v\u00e1lida.');
      Object.assign(this, {userId, getToken, fetchImpl, isCurrent, rootId:'', about:null, browse:browse === true});
    }
    check() { if (!this.isCurrent()) throw new Error('La cuenta cambi\u00f3. Volv\u00e9 a abrir Mi espacio.'); }
    async request(url, options = {}, raw = false, attempt = 0, force = false) {
      this.check();
      const {retry = true, ...fetchOptions} = options;
      const target = new URL(url);
      if (target.origin !== 'https://www.googleapis.com' || !['/drive/v3/','/upload/drive/v3/files'].some(prefix => target.pathname.startsWith(prefix))) throw new Error('Destino no permitido.');
      const token = await this.getToken(force); this.check();
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), options.body instanceof Blob ? 120000 : 15000);
      let response;
      try { response = await this.fetchImpl(url, {...fetchOptions, headers:{...options.headers, Authorization:'Bearer ' + token}, credentials:'omit', redirect:'error', referrerPolicy:'no-referrer', signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      this.check();
      if (response.status === 401 && !force) return this.request(url, options, raw, attempt, true);
      if (retry && (response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        return this.request(url, options, raw, attempt + 1, force);
      }
      if (raw && (response.ok || response.status === 308)) return response;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = data.error?.errors?.[0]?.reason;
        const error = new Error(reason === 'storageQuotaExceeded' ? 'Tu Drive no tiene espacio disponible. Liber\u00e1 espacio y volv\u00e9 a intentar.' : response.status === 401 ? 'Google pide que vuelvas a conectar tu cuenta.' : response.status === 404 ? 'El archivo ya no est\u00e1 disponible en Drive.' : response.status === 403 ? 'Google no permiti\u00f3 esta operaci\u00f3n. Revis\u00e1 el espacio y los permisos de tu Drive.' : response.status === 429 ? 'Drive est\u00e1 ocupado. Esper\u00e1 un momento.' : 'No pudimos completar la operaci\u00f3n en Drive.');
        error.status = response.status; throw error;
      }
      return data;
    }
    async pages(query, fields = FIELDS) {
      const result = []; let pageToken = '';
      do {
        const params = new URLSearchParams({q:query, spaces:'drive', pageSize:'100', fields:'nextPageToken,files(' + fields + ')', orderBy:'folder,name', ...(pageToken ? {pageToken} : {})});
        const data = await this.request(BASE + 'files?' + params);
        result.push(...(data.files || [])); pageToken = data.nextPageToken || '';
        if (pageToken && result.length >= 2000) throw new Error('Hay demasiados elementos para esta vista. Abr\u00ed una carpeta m\u00e1s espec\u00edfica.');
      } while (pageToken);
      return result;
    }
    async initialize() {
      const roots = await this.pages("trashed = false and mimeType = '" + FOLDER + "' and appProperties has { key='estudiemosRoot' and value='v1' } and appProperties has { key='estudiemosOwner' and value='" + quote(this.userId) + "' }");
      const root = roots[0] || await this.request(BASE + 'files?fields=' + encodeURIComponent(FIELDS), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Estudiemos', mimeType:FOLDER, appProperties:{estudiemosRoot:'v1', estudiemosOwner:this.userId}})});
      this.rootId = id(root.id);
      this.about = await this.request(BASE + 'about?fields=user(displayName,emailAddress),storageQuota(limit,usage)');
      return this.about;
    }
    scope() { return "trashed = false and appProperties has { key='estudiemosSpace' and value='" + quote(id(this.rootId)) + "' } and appProperties has { key='estudiemosOwner' and value='" + quote(this.userId) + "' }"; }
    owned(item) { return item?.id === this.rootId || (item?.appProperties?.estudiemosOwner === this.userId && item?.appProperties?.estudiemosSpace === this.rootId); }
    async readableFolder(parentId) {
      if (parentId === this.rootId || (this.browse && parentId === 'root')) return;
      if (!this.browse) return this.parent(parentId);
      const item = await this.request(BASE + 'files/' + id(parentId) + '?fields=' + encodeURIComponent(FIELDS));
      if (item.trashed || item.mimeType !== FOLDER) throw new Error('La carpeta ya no est\u00e1 disponible.');
    }
    async managed(fileId) {
      const item = await this.request(BASE + 'files/' + id(fileId) + '?fields=' + encodeURIComponent(FIELDS));
      if (item.trashed || item.appProperties?.estudiemosOwner !== this.userId || item.appProperties?.estudiemosSpace !== this.rootId) throw new Error('Ese archivo no pertenece a este espacio.');
      return item;
    }
    async parent(parentId) {
      if (parentId === this.rootId) return;
      const folder = await this.managed(parentId);
      if (folder.mimeType !== FOLDER) throw new Error('El destino no es una carpeta.');
    }
    async list(parentId = this.rootId, query = '') {
      await this.readableFolder(parentId);
      const parent = this.browse && parentId === 'root' ? 'root' : id(parentId);
      if (this.browse) return this.pages("trashed = false and '" + parent + "' in parents" + (query ? " and name contains '" + quote(String(query).slice(0,120)) + "'" : ''));
      return this.pages(this.scope() + (query ? " and name contains '" + quote(String(query).slice(0,120)) + "'" : " and '" + parent + "' in parents"));
    }
    async folders() { return this.pages(this.scope() + " and mimeType = '" + FOLDER + "'"); }
    metadata(title, parentId) { return {name:name(title), parents:[id(parentId)], appProperties:{estudiemosSpace:this.rootId, estudiemosOwner:this.userId}}; }
    async createFolder(title, parentId = this.rootId) {
      await this.parent(parentId);
      return this.request(BASE + 'files?fields=' + encodeURIComponent(FIELDS), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...this.metadata(title,parentId), mimeType:FOLDER})});
    }
    async shareCoursePdf(fileId, courseId, consent = false) {
      if (consent !== true || !/^[a-f0-9-]{36}$/i.test(courseId)) throw new Error('Confirm\u00e1 el permiso de lectura por enlace para este PDF.');
      const item = await this.managed(fileId);
      if (item.mimeType !== 'application/pdf' || item.appProperties?.estudiemosCourse !== courseId) throw new Error('Solo pod\u00e9s compartir un PDF subido para esta materia.');
      return this.request(BASE + 'files/' + id(fileId) + '/permissions?fields=id', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'anyone',role:'reader',allowFileDiscovery:false})});
    }
    async saveCourseMaterial(source, mode, parentId = this.rootId, title) {
      if (!['copy','shortcut'].includes(mode)) throw new Error('Eleg\u00ed copia o acceso directo.');
      let fileId = id(source?.id), key = source.resourceKey || '';
      if (typeof key !== 'string' || key && !/^[A-Za-z0-9_-]{1,200}$/.test(key)) throw new Error('Enlace de Drive no v\u00e1lido.');
      const safeTitle = name(title);
      await this.parent(parentId);
      const seen = new Set(); let item, headers;
      // Resolve existing shortcuts without ever fetching document contents.
      for (;;) {
        if (seen.has(fileId) || seen.size >= 5) throw new Error('El acceso directo no tiene un destino v\u00e1lido.');
        seen.add(fileId);
        headers = key ? {'X-Goog-Drive-Resource-Keys':fileId + '/' + key} : {};
        item = await this.request(BASE + 'files/' + fileId + '?fields=' + encodeURIComponent('id,mimeType,trashed,capabilities(canCopy),shortcutDetails(targetId,targetResourceKey)'), {headers});
        if (item.trashed) throw new Error('El archivo ya no est\u00e1 disponible en Drive.');
        if (item.mimeType !== 'application/vnd.google-apps.shortcut') break;
        fileId = id(item.shortcutDetails?.targetId); key = item.shortcutDetails?.targetResourceKey || '';
        if (typeof key !== 'string' || key && !/^[A-Za-z0-9_-]{1,200}$/.test(key)) throw new Error('Enlace de Drive no v\u00e1lido.');
      }
      if (mode === 'copy' && (item.mimeType === FOLDER || item.capabilities?.canCopy !== true)) throw new Error(item.mimeType === FOLDER ? 'Para una carpeta, eleg\u00ed acceso directo.' : 'Google no permite copiar este archivo con tu cuenta. Pod\u00e9s abrir el original o crear un acceso directo.');
      const metadata = this.metadata(safeTitle, parentId);
      const body = mode === 'copy' ? metadata : {...metadata, mimeType:'application/vnd.google-apps.shortcut', shortcutDetails:{targetId:fileId}};
      // Creation is not idempotent: a failed response must not create multiple copies.
      return this.request(BASE + (mode === 'copy' ? 'files/' + fileId + '/copy' : 'files') + '?fields=' + encodeURIComponent(FIELDS), {method:'POST', retry:false, headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify(body)});
    }
    async rename(fileId, title) { await this.managed(fileId); return this.patch(fileId, {name:name(title)}); }
    async trash(fileId) { await this.managed(fileId); return this.patch(fileId, {trashed:true}); }
    async move(fileId, parentId) {
      const item = await this.managed(fileId); await this.parent(parentId);
      let cursor = parentId; const visited = new Set([fileId]);
      while (cursor !== this.rootId) {
        if (visited.has(cursor) || visited.size > 50) throw new Error('No pod\u00e9s mover una carpeta dentro de s\u00ed misma.');
        visited.add(cursor); const ancestor = await this.managed(cursor); cursor = ancestor.parents?.[0];
        if (!cursor) throw new Error('No se pudo comprobar la carpeta de destino.');
      }
      if (item.parents?.includes(parentId)) return item;
      const query = new URLSearchParams({addParents:parentId, removeParents:(item.parents || []).join(','), fields:FIELDS});
      return this.request(BASE + 'files/' + id(fileId) + '?' + query, {method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
    }
    patch(fileId, values) { return this.request(BASE + 'files/' + id(fileId) + '?fields=' + encodeURIComponent(FIELDS), {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}); }
    async upload(file, parentId = this.rootId, progress = () => {}) {
      fileCheck(file); await this.parent(parentId);
      const type = file.type || 'application/octet-stream';
      const started = await this.request(UPLOAD + '?uploadType=resumable&fields=' + encodeURIComponent(FIELDS), {method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':type,'X-Upload-Content-Length':String(file.size)},body:JSON.stringify(this.metadata(file.name,parentId))}, true);
      const session = started.headers.get('Location');
      if (!session || new URL(session).origin !== 'https://www.googleapis.com' || new URL(session).pathname !== '/upload/drive/v3/files') throw new Error('Drive no prepar\u00f3 la subida.');
      const chunk = 8 * 1024 * 1024;
      for (let offset = 0; offset < file.size;) {
        const end = Math.min(file.size, offset + chunk);
        const response = await this.request(session, {method:'PUT',headers:{'Content-Type':type,'Content-Range':`bytes ${offset}-${end-1}/${file.size}`},body:file.slice(offset,end)}, true);
        if (response.status !== 308) { progress(100); return response.json(); }
        const match = /^bytes=0-(\d+)$/.exec(response.headers.get('Range') || '');
        const next = match ? Number(match[1]) + 1 : 0;
        if (next <= offset || next > end) throw new Error('La subida se interrumpi\u00f3. Volv\u00e9 a intentar.');
        offset = next; progress(Math.round(offset/file.size*100));
      }
      throw new Error('Drive no confirm\u00f3 que el archivo se haya guardado.');
    }
  }
  return Object.freeze({DriveFiles, FOLDER, MAX_FILE, fileCheck, openUrl, name});
});
