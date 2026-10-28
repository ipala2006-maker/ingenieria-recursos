const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),vault=require('../api/_lib/drive-vault'),{recipherBatch}=require('../api/_lib/drive-rekey');
const vars=['DRIVE_TOKEN_ENCRYPTION_KEY','DRIVE_TOKEN_KEYRING','DRIVE_TOKEN_ACTIVE_KEY_ID','DRIVE_REKEY_ENABLED'];
const ids=[1,2,3,4].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'));
async function fixture(run){
  const before=Object.fromEntries(vars.map(key=>[key,process.env[key]]));
  for(const key of vars)delete process.env[key];
  const old=crypto.randomBytes(32).toString('hex'),next=crypto.randomBytes(32).toString('hex');
  process.env.DRIVE_TOKEN_ENCRYPTION_KEY=old;
  try{return await run({old,next});}finally{for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
}
function legacy(value,key,purpose){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from('estudiemos.drive.v1:'+purpose));const body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');}
function dual(next,active=true){process.env.DRIVE_TOKEN_KEYRING=JSON.stringify({next:next});if(active)process.env.DRIVE_TOKEN_ACTIVE_KEY_ID='next';}

test('without new variables the vault keeps the exact legacy wire format and AAD',()=>fixture(async({old})=>{
  const value={refreshToken:'fixture-only-refresh'},purpose='user:'+ids[0],existing=legacy(value,old,purpose);
  assert.equal(vault.configured(),true);assert.equal(vault.activeKeyId(),'');assert.deepEqual(vault.unseal(existing,purpose),value);
  const sealed=vault.seal(value,purpose);assert.match(sealed,/^[A-Za-z0-9_-]+$/);const bytes=Buffer.from(sealed,'base64url'),cipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(old,'hex'),bytes.subarray(0,12));cipher.setAAD(Buffer.from('estudiemos.drive.v1:'+purpose));cipher.setAuthTag(bytes.subarray(12,28));assert.deepEqual(JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()])),value);
}));

test('dual read accepts legacy grants/cookies and v2, while writes need an explicit active key',()=>fixture(async({old,next})=>{
  const grant={refreshToken:'test-refresh'},purpose='user:'+ids[0],v1=legacy(grant,old,purpose),cookie=vault.seal({state:'test-state'},'oauth');
  dual(next,false);assert.equal(vault.activeKeyId(),'');assert.match(vault.seal(grant,purpose),/^[A-Za-z0-9_-]+$/);
  process.env.DRIVE_TOKEN_ACTIVE_KEY_ID='next';const v2=vault.seal(grant,purpose);assert.match(v2,/^v2\.next\./);assert.equal(vault.envelopeKeyId(v2),'next');assert.notEqual(vault.seal(grant,purpose),v2);
  const bytes=Buffer.from(v2.split('.')[2],'base64url'),reader=crypto.createDecipheriv('aes-256-gcm',Buffer.from(next,'hex'),bytes.subarray(0,12));reader.setAAD(Buffer.from('estudiemos.drive.v2:next:'+purpose));reader.setAuthTag(bytes.subarray(12,28));assert.deepEqual(JSON.parse(Buffer.concat([reader.update(bytes.subarray(28)),reader.final()])),grant);
  assert.deepEqual(vault.unseal(v1,purpose),grant);assert.deepEqual(vault.unseal(v2,purpose),grant);assert.equal(vault.unseal(cookie,'oauth').state,'test-state');
  delete process.env.DRIVE_TOKEN_ENCRYPTION_KEY;assert.equal(vault.configured(),true);assert.deepEqual(vault.unseal(v2,purpose),grant);assert.throws(()=>vault.unseal(v1,purpose));
}));

test('v2 binds purpose, user, key ID and ciphertext and does not guess missing keys',()=>fixture(async({next})=>{
  dual(next);const purpose='user:'+ids[0],sealed=vault.seal({refreshToken:'test-only'},purpose);
  for(const other of ['oauth','user:'+ids[1]])assert.throws(()=>vault.unseal(sealed,other),/INVALID_DRIVE_CREDENTIAL/);
  const parts=sealed.split('.'),bytes=Buffer.from(parts[2],'base64url');bytes[30]^=1;assert.throws(()=>vault.unseal(parts.slice(0,2).join('.')+'.'+bytes.toString('base64url'),purpose));
  process.env.DRIVE_TOKEN_KEYRING=JSON.stringify({next,alias:next});assert.throws(()=>vault.unseal(sealed.replace('v2.next.','v2.alias.'),purpose),/INVALID_DRIVE_CREDENTIAL/);
  process.env.DRIVE_TOKEN_KEYRING=JSON.stringify({alias:next});assert.throws(()=>vault.unseal(sealed,purpose),/DRIVE_KEY_UNAVAILABLE/);
  for(const value of ['v3.next.abc','v2.next.abc.def','v2.__proto__.aaaa','v2.next.!',null,'x'.repeat(24001)])assert.throws(()=>vault.unseal(value,purpose));
  for(const value of ['[]','null','{bad',JSON.stringify({next:'invalid'}),JSON.stringify(Object.fromEntries(['a','b','c','d','e'].map(key=>[key,next])))]){process.env.DRIVE_TOKEN_KEYRING=value;assert.equal(vault.configured(),false);assert.throws(()=>vault.seal({},purpose),/DRIVE_NOT_CONFIGURED/);}
}));

test('batch dry-run is default, bounded, verified and idempotent after conditional writes',()=>fixture(async({old,next})=>{
  const rows=ids.slice(0,3).map((id,index)=>({user_id:id,updated_at:'2026-10-28T18:00:00.123456Z',credentials:legacy({refreshToken:'token-'+index},old,'user:'+id)}));dual(next);let writes=0,requested;
  const io={listPage:async(after,limit)=>{requested=limit;return rows.filter(row=>row.user_id>after).slice(0,limit);},compareAndSwap:async args=>{writes++;const row=rows.find(row=>row.user_id===args.p_user);assert.equal(row.credentials,args.p_expected_credentials);assert.equal(args.p_expected_updated_at,row.updated_at);row.credentials=args.p_credentials;return true;}};
  const dry=await recipherBatch({limit:2},io);assert.equal(dry.dryRun,true);assert.equal(requested,3);assert.equal(dry.wouldChange,2);assert.equal(dry.changed,0);assert.equal(writes,0);assert.equal(dry.hasMore,true);
  await assert.rejects(recipherBatch({commit:true},io),/DRIVE_REKEY_DISABLED/);process.env.DRIVE_REKEY_ENABLED='true';
  const page=await recipherBatch({limit:2,commit:true},io);assert.equal(page.changed,2);assert.equal(writes,2);assert.equal(page.nextCursor,ids[1]);
  const repeat=await recipherBatch({limit:2,commit:true},io);assert.equal(repeat.current,2);assert.equal(repeat.changed,0);assert.equal(writes,2);
  const tail=await recipherBatch({after:page.nextCursor,commit:true},io);assert.equal(tail.changed,1);assert.equal(tail.hasMore,false);
  assert.ok(rows.every(row=>vault.envelopeKeyId(row.credentials)==='next'));assert.doesNotMatch(JSON.stringify(tail),/refreshToken|credentials|token-/);
}));

test('conflicts and unreadable grants cannot advance the checkpoint or trigger deletion',()=>fixture(async({old,next})=>{
  const rows=ids.slice(0,3).map(id=>({user_id:id,updated_at:'2026-10-28T18:00:00Z',credentials:legacy({refreshToken:'test-only'},old,'user:'+id)}));dual(next);process.env.DRIVE_REKEY_ENABLED='true';
  const io={listPage:async()=>rows,compareAndSwap:async args=>args.p_user!==ids[1]};
  const result=await recipherBatch({commit:true},io);assert.equal(result.conflicts,1);assert.equal(result.retryRequired,true);assert.equal(result.nextCursor,ids[0]);assert.equal(result.changed,2);
  rows[0].credentials='not-valid';const failed=await recipherBatch({},io);assert.equal(failed.failed,1);assert.equal(failed.nextCursor,'');assert.equal(failed.changed,0);
  for(const options of [{limit:26},{after:'not-a-user'},{commit:'true'}])await assert.rejects(recipherBatch(options,io),/DRIVE_REKEY_INVALID_OPTIONS/);
  await assert.rejects(recipherBatch({}, {...io,listPage:async()=>[rows[1],rows[0]]}),/DRIVE_REKEY_INVALID_PAGE/);
}));

test('SQL CAS is service-only, non-destructive, preserves precise timestamps and concurrent refreshes',async()=>{
  const db=new PGlite();try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/google-drive.sql'),'utf8'));await db.query('insert into auth.users values($1)',[ids[0]]);
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/drive-recipher.sql'),'utf8');await db.exec(sql);
    const original='a'.repeat(64),target='v2.next.'+'b'.repeat(64),stamp='2026-10-28T18:00:00.123456Z';await db.query('insert into drive_connections values($1,$2,$3)',[ids[0],original,stamp]);
    const call=(role,credentials=original,time=stamp)=>db.transaction(async tx=>{await tx.exec('set local role '+role);return(await tx.query('select recipher_drive_connection($1,$2,$3,$4) ok',[ids[0],credentials,time,target])).rows[0].ok;});
    for(const role of ['anon','authenticated'])await assert.rejects(call(role),/permission denied/);
    assert.equal(await call('service_role',original,'2026-10-28T18:00:00.123000Z'),false);assert.equal(await call('service_role'),true);assert.equal(await call('service_role'),false);
    await db.query('update drive_connections set credentials=$1',[original+'c']);assert.equal(await call('service_role'),false);assert.equal((await db.query('select credentials from drive_connections')).rows[0].credentials,original+'c');
    await db.exec(sql);assert.equal((await db.query('select count(*)::int n from drive_connections')).rows[0].n,1);
    await db.exec('delete from drive_connections');assert.equal(await call('service_role'),false);assert.equal((await db.query('select count(*)::int n from drive_connections')).rows[0].n,0,'An account disconnected during the batch is never recreated');
  }finally{await db.close();}
});
