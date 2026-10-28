const test=require('node:test'),assert=require('node:assert/strict');
const {cleanup,eventSha,PROJECT,TEAM}=require('../scripts/cleanup-vercel-after-deploy.cjs');
const sha='a'.repeat(40);
function fixture({changed=false,building=false}={}){
  let reads=0;const removed=[],requests=[],all=[{uid:'dpl_current',name:'estudiemos-app',created:100,target:'production',state:'READY'},{uid:'dpl_backup',name:'estudiemos-app',created:90,target:'production',state:'READY'},
    {uid:'dpl_preview',name:'estudiemos-app',created:110,target:null,state:building?'BUILDING':'READY'},{uid:'dpl_old',name:'estudiemos-app',created:80,target:'production',state:'READY'}];
  const request=async(url,options)=>{
    assert.ok(url.startsWith('https://api.vercel.com/'));assert.ok(url.includes(TEAM));requests.push([url,options.method]);
    let value;
    if(url.includes('/v9/projects/'))value={id:PROJECT,accountId:TEAM,name:'estudiemos-app',targets:{production:{id:changed&&reads++>0?'dpl_changed':'dpl_current',createdAt:100,readyState:'READY',meta:{githubCommitSha:sha}}}};
    else if(url.includes('/v6/deployments'))value={deployments:all.filter(d=>!removed.includes(d.uid)),pagination:{next:null}};
    else if(options.method==='DELETE'){const id=new URL(url).pathname.split('/').at(-1);assert.ok(!['dpl_current','dpl_backup'].includes(id));removed.push(id);value={uid:id,state:'DELETED'};}
    else value={id:'dpl_backup',projectId:PROJECT,readyState:'READY'};
    return{ok:true,json:async()=>value};
  };return{request,removed,requests};
}
test('automated retention deletes only inventoried old versions and retains a ready production rollback',async()=>{
  const h=fixture(),result=await cleanup({token:'fixture',expectedSha:sha,apply:true,request:h.request});
  assert.deepEqual(h.removed,['dpl_preview','dpl_old']);assert.deepEqual(result.remaining,['dpl_current','dpl_backup']);
});
test('dry run never deletes, and missing credentials fail before any request',async()=>{
  const h=fixture();await cleanup({token:'fixture',expectedSha:sha,request:h.request});assert.deepEqual(h.removed,[]);
  await assert.rejects(cleanup({expectedSha:sha,request:()=>assert.fail()}),/Secret/);
});
test('stale events, in-flight builds and production changes never expand a deletion scope',async()=>{
  const stale=fixture();assert.ok((await cleanup({token:'fixture',expectedSha:'b'.repeat(40),apply:true,request:stale.request})).skipped);assert.deepEqual(stale.removed,[]);
  const busy=fixture({building:true});assert.ok((await cleanup({token:'fixture',expectedSha:sha,apply:true,request:busy.request})).skipped);assert.deepEqual(busy.removed,[]);
  const changed=fixture({changed:true});await assert.rejects(cleanup({token:'fixture',expectedSha:sha,apply:true,request:changed.request}),/cambio/);assert.deepEqual(changed.removed,[]);
});

test('cleanup workflow cannot use preview/foreign dispatches or execute workflow code from deployed PRs',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'retention-event-')),file=path.join(directory,'event.json');
  try{
    const event={action:'vercel.deployment.success',client_payload:{environment:'production',project:{id:PROJECT},git:{sha}}};
    fs.writeFileSync(file,JSON.stringify(event));assert.equal(eventSha({GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_EVENT_PATH:file}),sha);
    event.client_payload.environment='preview';fs.writeFileSync(file,JSON.stringify(event));assert.throws(()=>eventSha({GITHUB_EVENT_NAME:'repository_dispatch',GITHUB_EVENT_PATH:file}));
    assert.throws(()=>eventSha({GITHUB_EVENT_NAME:'pull_request',GITHUB_SHA:sha}));
    const workflow=fs.readFileSync(require.resolve('../.github/workflows/deployment-retention.yml'),'utf8');
    assert.match(workflow,/repository_dispatch:/);assert.match(workflow,/ref: main/);assert.doesNotMatch(workflow,/pull_request_target|deployment_status:/);
  }finally{fs.rmSync(file);fs.rmdirSync(directory);}
});
