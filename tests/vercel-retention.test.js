const test=require('node:test'),assert=require('node:assert/strict');
const {plan}=require('../scripts/prune-vercel-deployments.cjs');
const project={name:'app',targets:{production:{id:'dpl_current',createdAt:100,readyState:'READY'}}};
const row=(uid,created,target='production',state='READY',name='app')=>({uid,created,target,state,name});
test('retention preserves active production and the most recent earlier ready production, not a newer preview',()=>{
  const all=[row('dpl_preview',110,null),row('dpl_current',100),row('dpl_failed',95,'production','ERROR'),row('dpl_backup',90),row('dpl_old',80)];
  assert.deepEqual(plan(project,all),{keep:['dpl_current','dpl_backup'],remove:['dpl_preview','dpl_failed','dpl_old']});
});
test('retention fails closed without a backup, on foreign projects, invalid IDs or in-flight builds',()=>{
  const current=row('dpl_current',100),backup=row('dpl_backup',90);
  for(const all of [[current],[backup],[current,backup,row('dpl_foreign',70,'production','READY','other')],[current,backup,row('project-name',70)],[current,backup,row('dpl_build',110,null,'BUILDING')]])assert.throws(()=>plan(project,all));
});
