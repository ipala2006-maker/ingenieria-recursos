const vault = require('./drive-vault');
const { adminRequest } = require('./supabase-admin');
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const adapters = {
  listPage: (after, limit) => adminRequest('/rest/v1/drive_connections?select=user_id,credentials&order=user_id.asc&limit=' + limit + (after ? '&user_id=gt.' + after : '')),
  schema: () => adminRequest('/rest/v1/', { headers: { Accept: 'application/openapi+json' } })
};

// Inventory only. No write adapter, Google request, token output or public route.
async function auditDriveConnections(io = adapters, now = Date.now()) {
  const expires = Date.parse(process.env.DRIVE_AUDIT_EXPIRES_AT || '');
  if (process.env.DRIVE_AUDIT_ENABLED !== 'true' || !Number.isFinite(now) ||
      !Number.isFinite(expires) || expires <= now || expires - now > 3600000) return { ok: false, code: 'CHECK_DISABLED' };
  let schemaAvailable = false, casRegistered = null;
  try {
    const schema = await io.schema();
    if (schema && typeof schema.paths === 'object' && schema.paths && !Array.isArray(schema.paths)) {
      schemaAvailable = true;
      casRegistered = Object.hasOwn(schema.paths, '/rpc/recipher_drive_connection');
    }
  } catch {}
  let after = '', checked = 0, legacy = 0, versioned = 0, unreadable = 0, complete = false;
  try {
    for (let page = 0; page < 40; page++) {
      const rows = await io.listPage(after, 26);
      if (!Array.isArray(rows) || rows.length > 26) throw new Error('INVALID_PAGE');
      let previous = after;
      for (const row of rows) {
        if (!row || !UUID.test(row.user_id) || row.user_id <= previous || typeof row.credentials !== 'string') throw new Error('INVALID_PAGE');
        previous = row.user_id;
      }
      for (const row of rows.slice(0, 25)) {
        checked++;
        try {
          const keyId = vault.envelopeKeyId(row.credentials);
          if (keyId) versioned++; else legacy++;
          const value = vault.unseal(row.credentials, 'user:' + row.user_id);
          if (typeof value?.refreshToken !== 'string' || !value.refreshToken) throw new Error('INVALID_GRANT');
        } catch { unreadable++; }
        after = row.user_id;
      }
      if (rows.length <= 25) { complete = true; break; }
    }
  } catch { return { ok: false, code: 'DRIVE_AUDIT_READ_FAILED' }; }
  const ok = complete && unreadable === 0;
  return { ok, code: ok ? 'DRIVE_AUDIT_COMPLETE' : 'DRIVE_AUDIT_INCOMPLETE', checked, legacy, versioned,
    unreadable, complete, schemaAvailable, casRegistered };
}
module.exports = { auditDriveConnections };
