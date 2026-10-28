const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {connection,verifyArchive,restoreTest,sql}=require('../scripts/restore-database-test.cjs');

test('restore targets only local isolated databases, never a Supabase or inherited remote host',()=>{
  for(const host of ['db.gxilgicgxhkdjmmyhrdd.supabase.co','example.com','postgres','localhost.evil'])assert.throws(()=>connection({PGHOST:host}));
  const env=connection({PGHOST:'127.0.0.1',PGHOSTADDR:'remote',PGSERVICE:'production',PGDATABASE:'production',PGOPTIONS:'malicious',PGPASSWORD:'local-only'});
  assert.equal(env.PGDATABASE,'postgres');assert.equal(env.PGHOSTADDR,undefined);assert.equal(env.PGSERVICE,undefined);assert.doesNotMatch(env.PGOPTIONS,/malicious/);
  assert.throws(()=>sql('production','drop table users',env));
  assert.equal(connection({PGHOST:'postgres',CI:'true',BACKUP_INTEGRATION:'true'}).PGHOST,'postgres');
});

test('restore verifies manifest and encrypted bytes before creating any database',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'restore-validation-'));
  try{
    const file=path.join(dir,'fixture.dump.age'),body=Buffer.from('encrypted fixture only');await fs.writeFile(file,body);
    const manifest={version:1,file:path.basename(file),format:'pg_dump-custom+age',project:'a'.repeat(20),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
    await fs.writeFile(file+'.json',JSON.stringify(manifest));assert.equal((await verifyArchive(file,file+'.json')).bytes,body.length);
    await fs.writeFile(file,'corrupt');await assert.rejects(verifyArchive(file,file+'.json'),/tamano/);
    await assert.rejects(restoreTest({backupPath:file,identityPath:'none',env:{PGHOST:'production.supabase.co'}}),/solo se permite/);
    const source=await fs.readFile(require.resolve('../scripts/restore-database-test.cjs'),'utf8');
    assert.doesNotMatch(source,/--clean|--if-exists/);assert.match(source,/--single-transaction/);assert.match(source,/pipeline\(decrypt.stdout/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
