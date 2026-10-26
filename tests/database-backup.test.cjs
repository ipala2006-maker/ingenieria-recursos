const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {config,backup,REQUIRED,OMIT_DATA}=require('../scripts/backup-database.cjs');
const project='a'.repeat(20),recipient='age1'+'q'.repeat(58);
const environment={BACKUP_PROJECT_REF:project,BACKUP_DATABASE_URL:`postgres://postgres:fixture-only@db.${project}.supabase.co:5432/postgres`,BACKUP_AGE_RECIPIENT:recipient};

test('backup connects only to its project over verified TLS, without secrets in arguments or encryption environment',()=>{
  const options=config({...environment,PGSSLMODE:'disable',PGOPTIONS:'malicious',UNRELATED_SECRET:'must-not-be-inherited'});
  assert.equal(options.childEnv.PGSSLMODE,'verify-full');assert.equal(options.childEnv.PGSSLROOTCERT,'system');
  assert.match(options.childEnv.PGOPTIONS,/default_transaction_read_only=on/);
  assert.equal(options.childEnv.PGPASSWORD,'fixture-only');assert.equal(options.toolEnv.PGPASSWORD,undefined);
  assert.equal(options.childEnv.UNRELATED_SECRET,undefined);
  for(const url of ['https://example.test',environment.BACKUP_DATABASE_URL.replace(project,'b'.repeat(20)),
    'postgres://postgres:fixture-only@localhost:5432/postgres','postgres://postgres:fixture-only@aws-0.pooler.supabase.com:5432/postgres',
    `postgres://postgres.${project}:fixture-only@aws-0.pooler.supabase.com:6543/postgres`]){
    assert.throws(()=>config({...environment,BACKUP_DATABASE_URL:url}));
  }
  assert.equal(config({...environment,BACKUP_DATABASE_URL:`postgres://postgres.${project}:fixture-only@aws-0.pooler.supabase.com:5432/postgres`}).childEnv.PGPORT,'5432');
  assert.throws(()=>config({...environment,BACKUP_MAX_BYTES:'33554433'}));
  assert.throws(()=>config({...environment,BACKUP_AGE_RECIPIENT:'not-a-public-key'}));
});

function fakeTools({fail='',content=Buffer.from('PGDMP-fixture-records'),hang=false}={}){
  const calls=[];
  function spawnTool(command,args,options){
    calls.push({command,args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
    const close=code=>{if(child.exitCode!==null)return;child.exitCode=code;child.emit('close',code);};
    child.kill=()=>{child.stdout.destroy();child.stdin.destroy();close(1);};
    options.signal.addEventListener('abort',()=>child.kill(),{once:true});
    if(command==='pg_dump')queueMicrotask(()=>{if(hang)return;child.stdout.end(content);child.stderr.end('sensitive database diagnostic');close(fail==='dump'?1:0);});
    else{child.stdout.write('age-encryption.org/v1\n');child.stdin.on('data',chunk=>child.stdout.write(Buffer.from(chunk).toString('base64')));child.stdin.on('end',()=>{child.stdout.end();close(fail==='age'?1:0);});}
    return child;
  }
  return {spawnTool,calls};
}

test('stream orchestration publishes only encrypted output and a content-free checksum manifest',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'estudiemos-backup-test-'));
  try{
    const tools=fakeTools(),options={...config(environment),directory};
    const manifest=await backup(options,{...tools,check:async()=>{}});
    const files=await fs.readdir(directory);assert.equal(files.length,2);
    const stored=await fs.readFile(path.join(directory,manifest.file));
    assert.equal(manifest.sha256,crypto.createHash('sha256').update(stored).digest('hex'));
    assert.doesNotMatch(JSON.stringify(manifest),/fixture-only|fixture-records/);
    const dump=tools.calls[0];assert.ok(dump.args.includes('--format=custom'));assert.ok(dump.args.includes('--schema=auth'));
    assert.doesNotMatch(dump.args.join(' '),/fixture-only|postgres:\/\//);
    assert.equal(tools.calls[1].options.env.PGPASSWORD,undefined);
    for(const table of OMIT_DATA)assert.ok(dump.args.includes('--exclude-table-data='+table));
    assert.ok(REQUIRED.includes('auth.users'));assert.ok(!OMIT_DATA.includes('auth.users'));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

for(const mode of ['dump','age','invalid','empty','size','timeout','preflight'])test(`a ${mode} failure never leaves a publishable backup`,async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'estudiemos-backup-test-'));
  try{
    const tools=fakeTools({fail:mode,hang:mode==='timeout',content:mode==='invalid'?Buffer.from('not an archive'):mode==='empty'?Buffer.alloc(0):Buffer.from('PGDMP'+'x'.repeat(mode==='size'?2000:20))});
    const options={...config(environment),directory,maxBytes:mode==='size'?1024:33554432};
    await assert.rejects(backup(options,{...tools,timeoutMs:mode==='timeout'?25:1000,check:async()=>{if(mode==='preflight')throw Error('Missing tables');}}));
    assert.deepEqual(await fs.readdir(directory),[]);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
