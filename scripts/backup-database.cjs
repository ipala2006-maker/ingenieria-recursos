// A consistent PostgreSQL dump is encrypted by age before touching disk.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const SCHEMAS = ['public', 'auth', 'private'];
const REQUIRED = ['auth.users', 'auth.identities', 'public.user_states', 'public.classrooms',
  'public.classroom_members', 'public.classroom_events', 'public.classroom_materials'];
const OMIT_DATA = ['private.api_rate_limits', 'public.mobile_push_jobs', 'public.mobile_push_health',
  'public.mobile_push_schedule', 'public.mobile_push_alarm_tasks', 'public.mobile_push_subscriptions',
  'auth.sessions', 'auth.refresh_tokens', 'auth.audit_log_entries', 'auth.flow_state',
  'auth.one_time_tokens', 'auth.mfa_challenges', 'auth.mfa_amr_claims'];

function config(env = process.env) {
  const project = env.BACKUP_PROJECT_REF || '';
  if (!/^[a-z]{20}$/.test(project)) throw Error('Falta BACKUP_PROJECT_REF valido.');
  let url;
  try { url = new URL(env.BACKUP_DATABASE_URL); } catch (_) { throw Error('Falta BACKUP_DATABASE_URL valida.'); }
  const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
  const local = env.BACKUP_LOCAL_TEST === 'true' && project === 'a'.repeat(20)
    && ['localhost', '127.0.0.1', 'postgres'].includes(url.hostname);
  const direct = url.hostname === `db.${project}.supabase.co`;
  const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) && user.endsWith('.' + project);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!local && !direct && !pooler)
    || !user || !password || url.hash || (url.port && !['5432', '6543'].includes(url.port))) {
    throw Error('La conexion no corresponde al proyecto de respaldo.');
  }
  if (url.port === '6543') throw Error('Usa conexion directa o pooler de sesion (5432), no transaccion.');
  if (!/^age1[0-9a-z]{58}$/.test(env.BACKUP_AGE_RECIPIENT || '')) throw Error('Falta el destinatario PUBLICO de age.');
  const maxBytes = Number(env.BACKUP_MAX_BYTES || 32 * 1024 * 1024);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 32 * 1024 * 1024) throw Error('Limite de respaldo no valido (maximo 32 MiB).');
  const toolEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'TEMP', 'TMP']) if (env[key]) toolEnv[key] = env[key];
  const childEnv = { ...toolEnv,
    PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: user, PGPASSWORD: password,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || 'postgres',
    PGSSLMODE: local ? 'disable' : 'verify-full', PGSSLROOTCERT: env.BACKUP_SSL_ROOT_CERT || 'system',
    PGCONNECT_TIMEOUT: '15', PGAPPNAME: 'estudiemos-encrypted-backup',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=240000 -c lock_timeout=5000'
  };
  if (local) delete childEnv.PGSSLROOTCERT;
  return { project, childEnv, toolEnv, recipient: env.BACKUP_AGE_RECIPIENT, maxBytes,
    directory: path.resolve(env.BACKUP_OUTPUT_DIR || '.backups/database'),
    pgDump: env.BACKUP_PG_DUMP || 'pg_dump', psql: env.BACKUP_PSQL || 'psql', age: env.BACKUP_AGE || 'age' };
}

function exitOf(child, label) {
  // Tool errors may include credentials or personal data: never forward stderr.
  child.stderr.resume();
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(Error(`No se pudo iniciar ${label}.`)));
    child.once('close', code => code === 0 ? resolve() : reject(Error(`Fallo ${label}; no se publico el respaldo.`)));
  });
}

async function preflight(options, signal) {
  const query = `select count(*) from unnest(array[${REQUIRED.map(table => `'${table}'`).join(',')}]) t where to_regclass(t) is null;`;
  const child = spawn(options.psql, ['--no-password', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query],
    { env: options.childEnv, stdio: ['ignore', 'pipe', 'pipe'], signal });
  let result = '';
  child.stdout.on('data', chunk => { if (result.length < 100) result += chunk.toString(); });
  await exitOf(child, 'la comprobacion de tablas');
  if (result.trim() !== '0') throw Error('Faltan tablas clave; se cancelo el respaldo incompleto.');
}

async function backup(options, { spawnTool = spawn, check = preflight, timeoutMs = 300000 } = {}) {
  const controller = new AbortController(), children = [];
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  process.once('SIGTERM', abort); process.once('SIGINT', abort);
  let partial, filename, manifestPath, published = false;
  try {
    await check(options, controller.signal);
    await fsp.mkdir(options.directory, { recursive: true, mode: 0o700 });
    const name = `estudiemos-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.dump.age`;
    filename = path.join(options.directory, name); partial = filename + '.partial'; manifestPath = filename + '.json';
    const args = ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', '--no-password',
      '--lock-wait-timeout=5000', ...SCHEMAS.map(schema => '--schema=' + schema),
      ...OMIT_DATA.map(table => '--exclude-table-data=' + table)];
    const dump = spawnTool(options.pgDump, args, { env: options.childEnv, stdio: ['ignore', 'pipe', 'pipe'], signal: controller.signal });
    children.push(dump);
    const encrypt = spawnTool(options.age, ['--encrypt', '--recipient', options.recipient],
      { env: options.toolEnv, stdio: ['pipe', 'pipe', 'pipe'], signal: controller.signal });
    children.push(encrypt);
    const hash = createHash('sha256'), ageHeader = Buffer.from('age-encryption.org/v1\n');
    let bytes = 0, prefix = Buffer.alloc(0), encryptedPrefix = Buffer.alloc(0);
    const archiveCheck = new Transform({ transform(chunk, _encoding, callback) {
      if (prefix.length < 5) {
        prefix = Buffer.concat([prefix, chunk]).subarray(0, 5);
        if (prefix.length === 5 && prefix.toString() !== 'PGDMP') return callback(Error('pg_dump no genero un archivo PostgreSQL valido.'));
      }
      callback(null, chunk);
    } });
    const sizeCheck = new Transform({ transform(chunk, _encoding, callback) {
      if (encryptedPrefix.length < ageHeader.length) {
        encryptedPrefix = Buffer.concat([encryptedPrefix, chunk]).subarray(0, ageHeader.length);
        if (encryptedPrefix.length === ageHeader.length && !encryptedPrefix.equals(ageHeader)) return callback(Error('age no genero un archivo cifrado valido.'));
      }
      bytes += chunk.length;
      if (bytes > options.maxBytes) return callback(Error('El respaldo excede 32 MiB o su limite configurado; revisar capacidad.'));
      hash.update(chunk); callback(null, chunk);
    } });
    await Promise.all([
      exitOf(dump, 'pg_dump'), exitOf(encrypt, 'age'),
      pipeline(dump.stdout, archiveCheck, encrypt.stdin, { signal: controller.signal }),
      pipeline(encrypt.stdout, sizeCheck, fs.createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal: controller.signal })
    ]);
    if (prefix.toString() !== 'PGDMP' || !encryptedPrefix.equals(ageHeader) || !bytes) throw Error('El respaldo esta vacio.');
    await fsp.rename(partial, filename);
    const manifest = { version: 1, createdAt: new Date().toISOString(), project: options.project, file: name,
      format: 'pg_dump-custom+age', schemas: SCHEMAS, omittedData: OMIT_DATA, bytes, sha256: hash.digest('hex') };
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    published = true;
    return manifest;
  } finally {
    controller.abort(); clearTimeout(timeout);
    process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort);
    for (const child of children) if (child.exitCode === null) child.kill();
    if (partial) await fsp.rm(partial, { force: true });
    if (!published) for (const file of [filename, manifestPath].filter(Boolean)) await fsp.rm(file, { force: true });
  }
}

if (require.main === module) {
  Promise.resolve().then(() => backup(config())).then(manifest => {
    console.log(JSON.stringify({ ok: true, file: manifest.file, encryptedBytes: manifest.bytes, sha256: manifest.sha256 }));
  }).catch(error => {
    console.error(error.name === 'AbortError' ? 'Respaldo cancelado o fuera de tiempo; no se publico un archivo parcial.' : error.message);
    process.exitCode = 1;
  });
}
module.exports = { config, backup, SCHEMAS, REQUIRED, OMIT_DATA };
