const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {harness}=require('./helpers/account-sync-fixture.cjs');

test('SQL list deltas preserve content and order, with full snapshots for old or lagging clients',async t=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
    await db.exec(fs.readFileSync(require.resolve('../supabase/schema.sql'),'utf8'));await db.exec(fs.readFileSync(require.resolve('../supabase/account-sync-delta.sql'),'utf8'));
    const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';await db.query('insert into auth.users values($1),($2)',[alice,bob]);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[alice]);
    const sync=async(known={},patch=null,expected=null)=>(await db.query('select sync_account_state($1,$2,$3) as data',[known,patch,expected])).rows[0].data;
    let stamp=1;
    const write=async(list,expected)=>(await sync({}, {values:{bandeja_agenda:list},changedAt:{bandeja_agenda:++stamp}},expected));
    const notes=Array.from({length:300},(_,id)=>({id:String(id),title:'Actividad y apuntes de la materia '+id,date:'2026-10-25',color:'blue',done:false}));
    await write(notes,null);const initial=await sync();
    const noChange=await sync({...initial.versions,_listDelta:1,_compactVersions:1});
    assert.equal(noChange.versionsPartial,true);assert.deepEqual(noChange.versions,{});
    const changed=structuredClone(notes);changed[42].title='Corregido: revisión del parcial';changed[42].done=true;
    const edited=await write(changed,initial.updated_at);
    const compact=await sync({...initial.versions,_listDelta:1,_compactVersions:1});
    assert.deepEqual(Object.keys(compact.versions),['bandeja_agenda']);
    const compactClient=harness();compactClient.context.cachedCloudState=initial.state;compactClient.context.compactVersions=initial.versions;
    compactClient.context.client.rpc=async()=>({data:compact});
    const decoded=await compactClient.context.compactSync();
    assert.equal(decoded.versions.estudiemos_theme,initial.versions.estudiemos_theme);
    assert.equal(decoded.receivedJsonBytes,Buffer.byteLength(JSON.stringify(compact)));
    assert.ok(!JSON.stringify(decoded).includes('receivedJsonBytes'),'Local accounting is not a network field');
    const delta=await sync({...initial.versions,_listDelta:1});
    assert.equal(delta.state.values.bandeja_agenda,undefined);assert.equal(delta.state.lists.bandeja_agenda.put.length,1);assert.equal(delta.state.lists.bandeja_agenda.order,null);
    const h=harness();h.context.cachedCloudState=initial.state;h.context.compactVersions=initial.versions;
    assert.deepEqual(JSON.parse(JSON.stringify(h.context.mergeCompactState(delta).values.bandeja_agenda)),changed);
    const legacy=await sync(initial.versions);assert.deepEqual(legacy.state.values.bandeja_agenda,changed);assert.deepEqual(legacy.state.lists,{});
    assert.ok(JSON.stringify(delta).length<JSON.stringify(legacy).length*.1);
    t.diagnostic(JSON.stringify({case:'one edit among 300 notes',beforeJsonBytes:Buffer.byteLength(JSON.stringify(legacy)),afterJsonBytes:Buffer.byteLength(JSON.stringify(delta))}));
    // Unrelated minute progress must not evict the latest agenda delta.
    const progress=await sync({}, {values:{estudiemos_pomodoro_streak:'{"days":{"2026-10-25":60}}'},changedAt:{estudiemos_pomodoro_streak:3}},edited.updated_at);
    assert.equal((await sync({...initial.versions,_listDelta:1})).state.lists.bandeja_agenda.put.length,1);
    // Move, remove and add all in one edit, keeping the complete order.
    const reordered=[{id:'new',title:'Nueva entrega'},...changed.slice(1).reverse()];
    await write(reordered,progress.updated_at);const orderDelta=await sync({...delta.versions,_listDelta:1});
    h.context.cachedCloudState={...initial.state,values:{bandeja_agenda:changed}};h.context.compactVersions=delta.versions;
    assert.deepEqual(JSON.parse(JSON.stringify(h.context.mergeCompactState(orderDelta).values.bandeja_agenda)),reordered);
    assert.deepEqual(orderDelta.state.lists.bandeja_agenda.remove,['0']);assert.equal(orderDelta.state.lists.bandeja_agenda.order[0],'new');
    // More than one missed list edit cannot be patched against the wrong base.
    const behind=await sync({...initial.versions,_listDelta:1});assert.deepEqual(behind.state.values.bandeja_agenda,reordered);assert.equal(behind.state.lists.bandeja_agenda,undefined);
    await write([],orderDelta.updated_at);const empty=await sync({...orderDelta.versions,_listDelta:1});assert.deepEqual(empty.state.values.bandeja_agenda,[]);
    // Legacy lists without IDs, duplicate IDs and large replacements stay valid.
    let row=empty;
    for(const list of [[{title:'Legacy note'}],[{id:'same',title:'A'},{id:'same',title:'B'}],notes,notes.map(n=>({...n,title:'Replace all '+n.id}))]){
      await write(list,row.updated_at);const next=await sync({...row.versions,_listDelta:1});assert.deepEqual(next.state.values.bandeja_agenda,list);assert.equal(next.state.lists.bandeja_agenda,undefined);row=next;
    }
    const metadata=(await db.query("select octet_length(coalesce(state->'_listDelta','{}')::text) as size from user_states")).rows[0].size;assert.ok(metadata<=4096);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[bob]);assert.equal((await sync({...row.versions,_listDelta:1})).missing,true);
  }finally{await db.close();}
});

test('client rejects a mismatched delta base without changing the local agenda',()=>{
  const h=harness();h.context.cachedCloudState={values:{bandeja_agenda:[{id:'one',title:'Keep'}]},changedAt:{}};h.context.compactVersions={bandeja_agenda:'known'};
  const delta={versions:{bandeja_agenda:'new'},state:{values:{},changedAt:{},lists:{bandeja_agenda:{base:'wrong',target:'new',put:[],remove:[],order:null}}}};
  assert.throws(()=>h.context.mergeCompactState(delta),/inválido/);assert.equal(h.context.cachedCloudState.values.bandeja_agenda[0].title,'Keep');
  assert.equal(h.context.compactVersions,null,'Next read must request a full snapshot');
});
