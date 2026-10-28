const test=require('node:test'),assert=require('node:assert/strict');
const {cleanup,PROJECT,TEAM}=require('../scripts/cleanup-vercel-after-deploy.cjs');
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
