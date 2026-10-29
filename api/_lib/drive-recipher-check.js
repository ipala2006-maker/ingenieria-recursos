const vault = require('./drive-vault');
const { recipherBatch } = require('./drive-rekey');
const COUNT_KEYS = ['scanned', 'current', 'wouldChange', 'changed', 'conflicts', 'failed'];

// Build-only operator: expires, previews by default, and never returns cursors or grants.
async function verifyRecipher({ now = Date.now(), execute = recipherBatch } = {}) {
  const expires = Date.parse(process.env.DRIVE_RECIPHER_EXPIRES_AT || '');
  if (process.env.DRIVE_RECIPHER_ENABLED !== 'true' || !Number.isFinite(now) ||
      !Number.isFinite(expires) || expires <= now || expires - now > 3600000) return { ok: false, code: 'CHECK_DISABLED' };
  const mode = process.env.DRIVE_RECIPHER_MODE || 'preview';
  const target = process.env.DRIVE_RECIPHER_TARGET_KEY_ID || '';
  if (!['preview', 'commit'].includes(mode) || !/^[a-z][a-z0-9_-]{0,31}$/.test(target)) return { ok: false, code: 'CHECK_NOT_CONFIGURED' };
  const commit = mode === 'commit';
  if (commit && process.env.DRIVE_REKEY_ENABLED !== 'true') return { ok: false, code: 'CHECK_DISABLED' };
  let result;
  try {
    if (vault.activeKeyId() !== target) return { ok: false, code: 'CHECK_NOT_CONFIGURED' };
    result = await execute({ limit: 25, commit });
  } catch { return { ok: false, code: 'DRIVE_RECIPHER_FAILED' }; }
  if (!result || result.target !== target || result.dryRun !== !commit ||
      COUNT_KEYS.some(key => !Number.isInteger(result[key]) || result[key] < 0 || result[key] > 25) ||
      typeof result.hasMore !== 'boolean' || typeof result.retryRequired !== 'boolean' ||
      result.current + result.wouldChange > result.scanned || result.changed > result.wouldChange ||
      result.conflicts > result.wouldChange || result.failed > result.scanned ||
      (!commit && (result.changed || result.conflicts)) ||
      result.retryRequired !== (result.conflicts > 0 || result.failed > 0)) return { ok: false, code: 'DRIVE_RECIPHER_FAILED' };
  const ok = !result.hasMore && !result.retryRequired && result.current + result.wouldChange === result.scanned &&
    (!commit || result.changed === result.wouldChange);
  return { ok, code: ok ? (commit ? 'DRIVE_RECIPHER_COMMITTED' : 'DRIVE_RECIPHER_PREVIEW_VERIFIED') : 'DRIVE_RECIPHER_INCOMPLETE',
    dryRun: result.dryRun, ...Object.fromEntries(COUNT_KEYS.map(key => [key, result[key]])), hasMore: result.hasMore, retryRequired: result.retryRequired };
}
module.exports = { verifyRecipher };
