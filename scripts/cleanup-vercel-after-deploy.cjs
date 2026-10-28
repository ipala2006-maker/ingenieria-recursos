const fs=require('node:fs');
const {plan}=require('./prune-vercel-deployments.cjs');
const PROJECT='prj_BDIVyIanCqTDh32fhWkloZJi9Cbp',TEAM='team_hPWQUVpRlY5E5VjE9nBQ1CL2';

async function cleanup({token,expectedSha,apply=false,request=fetch}){
  if(!token)throw Error('Falta el Secret VERCEL_CLEANUP_TOKEN; no se modifico Vercel.');
  if(!/^[a-f0-9]{40}$/.test(expectedSha||''))throw Error('Falta un commit de produccion verificado.');
  const api=async(path,method='GET')=>{
    const response=await request('https://api.vercel.com'+path,{method,headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000),redirect:'error'});
    if(!response.ok)throw Error(`Vercel rechazo la operacion (${response.status}); revisar token y permisos.`);
    return response.json();
  };
  const project=()=>api(`/v9/projects/${PROJECT}?teamId=${TEAM}`);
  const inventory=async()=>{
    const all=[];let until;
    do{
      const value=await api(`/v6/deployments?projectId=${PROJECT}&teamId=${TEAM}&limit=100${until?'&until='+until:''}`);
      if(!Array.isArray(value.deployments)||value.pagination?.next&&until&&value.pagination.next>=until)throw Error('Inventario de Vercel incompleto.');
      all.push(...value.deployments);until=value.pagination?.next;if(all.length>5000)throw Error('Inventario inesperado; revision manual necesaria.');
    }while(until);
    return all;
  };
  const first=await project();
  if(first.id!==PROJECT||first.accountId!==TEAM||first.name!=='estudiemos-app')throw Error('El proyecto no coincide; no se borra nada.');
  if(first.targets?.production?.meta?.githubCommitSha!==expectedSha)return {skipped:'Produccion avanzo o el evento no corresponde a la produccion actual.'};
  const all=await inventory();
  if(all.some(d=>['BUILDING','INITIALIZING','QUEUED'].includes(d.state)))return {skipped:'Hay despliegues en curso; la siguiente publicacion volvera a intentar la limpieza.'};
  const selected=plan(first,all),backup=await api(`/v13/deployments/${selected.keep[1]}?teamId=${TEAM}`);
  if(backup.projectId!==PROJECT||backup.readyState!=='READY')throw Error('El respaldo no es valido; no se borra nada.');
  const result={dryRun:!apply,keep:selected.keep,candidates:selected.remove,removed:[]};
  if(!apply)return result;
  for(const id of selected.remove){
    const current=await project();
    if(current.id!==PROJECT||current.accountId!==TEAM||current.targets?.production?.id!==selected.keep[0]||current.targets.production.readyState!=='READY')throw Error('Produccion cambio durante la limpieza; se detuvo sin ampliar el inventario.');
    if(selected.keep.includes(id))throw Error('Intento de borrar una version protegida.');
    const deleted=await api(`/v13/deployments/${id}?teamId=${TEAM}`,'DELETE');
    if(deleted.uid!==id||deleted.state!=='DELETED')throw Error('Respuesta de borrado inesperada; se detuvo la limpieza.');
    result.removed.push(id);
  }
  const remaining=await inventory();
  if(selected.keep.some(id=>!remaining.some(d=>d.uid===id&&d.state==='READY')))throw Error('Falta una version protegida en la verificacion final.');
  result.remaining=remaining.map(d=>d.uid);return result;
}

function eventSha(env=process.env){
  if(env.GITHUB_EVENT_NAME==='deployment_status'){
    const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
    if(event.deployment_status?.state!=='success'||!(event.deployment?.production_environment===true||event.deployment?.environment==='Production'))throw Error('El evento no es una publicacion exitosa de produccion.');
    return event.deployment.sha;
  }
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main')return env.GITHUB_SHA;
  throw Error('La limpieza solo se ejecuta por produccion o desde main.');
}
if(require.main===module)Promise.resolve().then(()=>cleanup({token:process.env.VERCEL_CLEANUP_TOKEN,expectedSha:eventSha(),apply:process.env.VERCEL_CLEANUP_APPLY==='true'}))
  .then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={cleanup,eventSha,PROJECT,TEAM};
