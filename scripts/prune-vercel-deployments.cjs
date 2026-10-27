const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');

function plan(project,deployments){
  const production=project.targets?.production;
  assert.ok(production&&/^dpl_[A-Za-z0-9]+$/.test(production.id),'Production must be identified by the project API');
  assert.equal(production.readyState,'READY','Production must be ready');
  const unique=[...new Map(deployments.map(d=>[d.uid,d])).values()];
  assert.ok(unique.some(d=>d.uid===production.id),'Incomplete deployment inventory');
  assert.ok(unique.every(d=>/^dpl_[A-Za-z0-9]+$/.test(d.uid)&&d.name===project.name),'Inventory contains an unexpected project or ID');
  assert.ok(!unique.some(d=>['BUILDING','INITIALIZING','QUEUED'].includes(d.state)),'Wait for in-flight deployments before pruning');
  const backup=unique.filter(d=>d.uid!==production.id&&d.target==='production'&&d.state==='READY'&&d.created<production.createdAt)
    .sort((a,b)=>b.created-a.created)[0];
  assert.ok(backup,'A previous ready production backup is required');
  const keep=[production.id,backup.uid];
  return {keep,remove:unique.filter(d=>!keep.includes(d.uid)).map(d=>d.uid)};
}

function run(args){
  const value=name=>args[args.indexOf(name)+1];
  for(const flag of ['--cli','--project','--team','--expected-production','--report'])assert.ok(args.includes(flag),flag+' is required');
  const cli=value('--cli'),projectId=value('--project'),teamId=value('--team'),expected=value('--expected-production');
  assert.match(projectId,/^prj_[A-Za-z0-9]+$/);assert.match(teamId,/^team_[A-Za-z0-9]+$/);assert.match(expected,/^dpl_[A-Za-z0-9]+$/);
  const api=(path,method='GET')=>JSON.parse(execFileSync(process.execPath,[cli,'--scope',teamId,'api',path,'--method',method,...(method==='DELETE'?['--dangerously-skip-permissions']:[])],{
    encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']
  }));
  const readProject=()=>{
    const p=api(`/v9/projects/${projectId}?teamId=${teamId}`);
    assert.equal(p.id,projectId);assert.equal(p.accountId,teamId);assert.equal(p.targets?.production?.id,expected,'Production changed; stop and build a new plan');return p;
  };
  const inventory=()=>{
    const all=[];let until;
    do {
      const r=api(`/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100${until?'&until='+until:''}`);
      assert.ok(Array.isArray(r.deployments));all.push(...r.deployments);
      const next=r.pagination?.next;assert.ok(!next||!until||next<until,'Pagination did not advance');until=next;
      assert.ok(all.length<=5000,'Unexpected inventory size');
    } while(until);
    return all;
  };
  const project=readProject(),all=inventory(),selected=plan(project,all);
  const backup=api(`/v13/deployments/${selected.keep[1]}?teamId=${teamId}`);
  assert.equal(backup.projectId,projectId);assert.equal(backup.readyState,'READY');
  const report={projectId,teamId,createdAt:new Date().toISOString(),keep:selected.keep.map(id=>{
    const d=all.find(d=>d.uid===id);return {id,url:d.url,sha:d.meta?.githubCommitSha,created:d.created};
  }),candidates:selected.remove,removed:[],applied:args.includes('--apply')};
  fs.writeFileSync(value('--report'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({keep:report.keep,candidates:report.candidates.length,apply:report.applied}));
  if(!report.applied)return;
  for(const id of selected.remove){
    readProject();assert.ok(!selected.keep.includes(id));
    const result=api(`/v13/deployments/${id}?teamId=${teamId}`,'DELETE');
    assert.equal(result.uid,id);assert.equal(result.state,'DELETED');
    report.removed.push(id);fs.writeFileSync(value('--report'),JSON.stringify(report,null,2));
    if(report.removed.length%10===0)console.log(`Removed ${report.removed.length}/${selected.remove.length}; production and backup retained.`);
  }
  readProject();
  const remaining=inventory();assert.deepEqual(remaining.map(d=>d.uid).sort(),selected.keep.slice().sort(),'Unexpected remaining deployments');
  for(const id of selected.keep){const d=api(`/v13/deployments/${id}?teamId=${teamId}`);assert.equal(d.readyState,'READY');}
  report.finishedAt=new Date().toISOString();report.remaining=selected.keep;
  fs.writeFileSync(value('--report'),JSON.stringify(report,null,2));console.log('Verified: only production and one ready previous production backup remain.');
}
if(require.main===module){try{run(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={plan};
