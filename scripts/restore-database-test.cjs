const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process'),{pipeline}=require('node:stream/promises'),{Transform}=require('node:stream');
const {createHash,randomBytes}=require('node:crypto');
const {REQUIRED}=require('./backup-database.cjs');

function connection(env=process.env){
  const host=env.PGHOST||'127.0.0.1',port=env.PGPORT||'5432';
  if(!['localhost','127.0.0.1','::1'].includes(host)&&!(host==='postgres'&&env.CI==='true'&&env.BACKUP_INTEGRATION==='true'))throw Error('Restore test: solo se permite PostgreSQL local o el servicio aislado de CI.');
  if(!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('Puerto local invalido.');
  const childEnv={};for(const key of ['PATH','Path','SystemRoot','WINDIR','HOME','TEMP','TMP'])if(env[key])childEnv[key]=env[key];
  return {...childEnv,PGHOST:host,PGPORT:port,PGUSER:env.PGUSER||'postgres',PGPASSWORD:env.PGPASSWORD||'',PGDATABASE:'postgres',
    PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGAPPNAME:'estudiemos-isolated-restore-test',PGOPTIONS:'-c statement_timeout=300000 -c lock_timeout=5000'};
}

function sql(database,query,env,psql='psql'){
  if(database!=='postgres'&&!/^estudiemos_restore_[a-f0-9]{24}$/.test(database))throw Error('Base de restauracion no permitida.');
  try{return execFileSync(psql,['--no-password','-X','-A','-t','-v','ON_ERROR_STOP=1','-d',database,'-c',query],{
    env,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
  catch(_){throw Error('No se pudo completar la consulta en PostgreSQL aislado; verifica herramientas, permisos y roles locales.');}
}

async function verifyArchive(backupPath,manifestPath){
  const manifest=JSON.parse(await fsp.readFile(manifestPath,'utf8')),stat=await fsp.stat(backupPath);
  if(manifest.version!==1||manifest.format!=='pg_dump-custom+age'||manifest.file!==path.basename(backupPath)||!(/^[a-z]{20}$/).test(manifest.project||'')
    ||!stat.isFile()||!Number.isSafeInteger(manifest.bytes)||manifest.bytes!==stat.size||!(/^[a-f0-9]{64}$/).test(manifest.sha256||''))throw Error('Manifiesto de respaldo invalido o tamano diferente.');
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(backupPath))hash.update(chunk);
  if(hash.digest('hex')!==manifest.sha256)throw Error('La huella del respaldo no coincide; no se intentara restaurar.');
  return manifest;
}

function exited(child,label,onDiagnostic){
  let diagnostic='';
  if(onDiagnostic)child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(0,4096);});else child.stderr.resume();
  return new Promise((resolve,reject)=>{child.once('error',()=>reject(Error(`No se pudo iniciar ${label}.`)));child.once('close',code=>{
    if(code===0)return resolve();if(onDiagnostic)onDiagnostic(label,diagnostic);reject(Error(`Fallo ${label}; se descartara la base temporal.`));
  });});
}

async function restoreTest({backupPath,identityPath,manifestPath=backupPath+'.json',env=process.env,validate,onDiagnostic,psql='psql',age='age',pgRestore='pg_restore',timeoutMs=600000}){
  const local=connection(env),manifest=await verifyArchive(backupPath,manifestPath);
  if(env.BACKUP_PROJECT_REF&&manifest.project!==env.BACKUP_PROJECT_REF)throw Error('El respaldo no corresponde al proyecto esperado.');
  await fsp.access(identityPath,fs.constants.R_OK);
  const database='estudiemos_restore_'+randomBytes(12).toString('hex'),controller=new AbortController(),children=[];
  let created=false;
  const timer=setTimeout(()=>controller.abort(),timeoutMs),abort=()=>controller.abort();
  process.once('SIGINT',abort);process.once('SIGTERM',abort);
  try{
    sql('postgres',`create database ${database}`,local,psql);created=true;
    // A fresh database contains an empty public schema; the archive recreates it.
    sql(database,'drop schema public',local,psql);
    const toolEnv={...local};delete toolEnv.PGPASSWORD;
    const decrypt=spawn(age,['--decrypt','--identity',path.resolve(identityPath),path.resolve(backupPath)],{env:toolEnv,windowsHide:true,stdio:['ignore','pipe','pipe'],signal:controller.signal});children.push(decrypt);
    const restore=spawn(pgRestore,['--no-owner','--no-privileges','--exit-on-error','--single-transaction','--dbname='+database],{env:local,windowsHide:true,stdio:['pipe','ignore','pipe'],signal:controller.signal});children.push(restore);
    let prefix=Buffer.alloc(0);
    const check=new Transform({transform(chunk,_encoding,callback){
      if(prefix.length<5){prefix=Buffer.concat([prefix,chunk]).subarray(0,5);if(prefix.length===5&&prefix.toString()!=='PGDMP')return callback(Error('El archivo descifrado no es un dump PostgreSQL.'));}
      callback(null,chunk);
    }});
    await Promise.all([exited(decrypt,'age',onDiagnostic),exited(restore,'pg_restore',onDiagnostic),pipeline(decrypt.stdout,check,restore.stdin,{signal:controller.signal})]);
    if(prefix.toString()!=='PGDMP')throw Error('Respaldo vacio.');
    const query=text=>sql(database,text,local,psql);
    const missing=Number(query(`select count(*) from unnest(array[${REQUIRED.map(t=>`'${t}'`).join(',')}]) t where to_regclass(t) is null`));
    if(missing)throw Error('La recuperacion no contiene todas las tablas clave.');
    const rows={};for(const table of REQUIRED)rows[table]=Number(query(`select count(*) from ${table}`));
    const rls=query("select relrowsecurity from pg_class where oid='public.user_states'::regclass")==='t';
    const invalid=Number(query("select count(*) from pg_constraint where connamespace in('public'::regnamespace,'auth'::regnamespace,'private'::regnamespace) and contype='f' and not convalidated"));
    if(!rls||invalid)throw Error('La restauracion no supera la comprobacion de RLS o claves foraneas.');
    if(validate)await validate(query);
    return {ok:true,project:manifest.project,encryptedBytes:manifest.bytes,rows,rls:true,unvalidatedForeignKeys:invalid,isolated:true};
  }finally{
    controller.abort();clearTimeout(timer);process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);
    for(const child of children)if(child.exitCode===null)child.kill();
    if(children.length)await Promise.allSettled(children.map(child=>child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>child.once('close',resolve))));
    if(created)sql('postgres',`drop database ${database} with (force)`,local,psql);
  }
}

async function main(args){
  if(args.includes('--help')){console.log('npm run db:restore-test [-- --backup archivo.dump.age --identity clave.agekey]');return;}
  if(!args.length){process.env.BACKUP_INTEGRATION='true';return require('../tests/backup-restore.integration.cjs').run();}
  const value=flag=>{const at=args.indexOf(flag);if(at<0||!args[at+1]||args[at+1].startsWith('--'))throw Error('Falta '+flag);return args[at+1];};
  for(let i=0;i<args.length;i+=2)if(!['--backup','--identity','--manifest'].includes(args[i]))throw Error('Argumento no permitido.');
  const result=await restoreTest({backupPath:value('--backup'),identityPath:value('--identity'),...(args.includes('--manifest')?{manifestPath:value('--manifest')}:{})});
  console.log(JSON.stringify(result));
}
module.exports={connection,verifyArchive,restoreTest,sql,main};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.name==='AbortError'?'Prueba cancelada; no se publico ninguna restauracion.':error.message);process.exitCode=1;});
