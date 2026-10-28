const vault=require('./drive-vault');
const {adminRequest}=require('./supabase-admin');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const adapters={
  listPage:(after,limit)=>adminRequest('/rest/v1/drive_connections?select=user_id,credentials,updated_at&order=user_id.asc&limit='+limit+(after?'&user_id=gt.'+after:'')),
  compareAndSwap:row=>adminRequest('/rest/v1/rpc/recipher_drive_connection',{method:'POST',body:JSON.stringify(row)})
};

// Server-only building block. No HTTP route, cron, key export or automatic run.
async function recipherBatch({after='',limit=25,commit=false}={},io=adapters){
  if(typeof after!=='string'||after&&!UUID.test(after)||!Number.isInteger(limit)||limit<1||limit>25||typeof commit!=='boolean')throw new Error('DRIVE_REKEY_INVALID_OPTIONS');
  if(commit&&process.env.DRIVE_REKEY_ENABLED!=='true')throw new Error('DRIVE_REKEY_DISABLED');
  const target=vault.activeKeyId();if(!target)throw new Error('DRIVE_REKEY_TARGET_REQUIRED');
  const rows=await io.listPage(after,limit+1);
  if(!Array.isArray(rows)||rows.length>limit+1)throw new Error('DRIVE_REKEY_INVALID_PAGE');
  let previous=after;
  for(const row of rows){
    if(!row||!UUID.test(row.user_id)||row.user_id<=previous||typeof row.credentials!=='string'||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw new Error('DRIVE_REKEY_INVALID_PAGE');
    previous=row.user_id;
  }
  const result={dryRun:!commit,target,scanned:0,current:0,wouldChange:0,changed:0,conflicts:0,failed:0,hasMore:rows.length>limit,nextCursor:after};
  let checkpoint=true;
  for(const row of rows.slice(0,limit)){
    result.scanned++;
    try{
      const purpose='user:'+row.user_id,value=vault.unseal(row.credentials,purpose);
      if(vault.envelopeKeyId(row.credentials)===target)result.current++;
      else{
        const credentials=vault.seal(value,purpose);
        if(vault.envelopeKeyId(credentials)!==target||JSON.stringify(vault.unseal(credentials,purpose))!==JSON.stringify(value))throw new Error('DRIVE_REKEY_VERIFY_FAILED');
        result.wouldChange++;
        if(commit){
          const changed=await io.compareAndSwap({p_user:row.user_id,p_expected_credentials:row.credentials,p_expected_updated_at:row.updated_at,p_credentials:credentials});
          if(changed===true)result.changed++;
          else if(changed===false){result.conflicts++;checkpoint=false;}
          else throw new Error('DRIVE_REKEY_INVALID_ACK');
        }
      }
      if(checkpoint)result.nextCursor=row.user_id;
    }catch{result.failed++;checkpoint=false;}
  }
  return {...result,retryRequired:result.failed>0||result.conflicts>0};
}
module.exports={recipherBatch};
