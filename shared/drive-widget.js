(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.EstudiemosDriveWidget=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MAX_ITEMS=100,FOLDER='application/vnd.google-apps.folder';
  function snapshot(owner,connected,items=[],location='space'){
    if(typeof owner!=='string'||!owner||owner.length>100)return null;
    const source=Array.isArray(items)?items:[],rows=[];
    if(connected===true)for(const item of source){
      if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{5,200}$/.test(item.id)||typeof item.name!=='string')continue;
      const name=item.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);
      if(!name||item.trashed)continue;
      rows.push({id:item.id,name,kind:item.mimeType===FOLDER?'folder':'file',mimeType:String(item.mimeType||'').slice(0,100),sizeBytes:Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Number(item.size)||0)),parentId:null});
      if(rows.length===MAX_ITEMS)break;
    }
    return {type:'drive-workspace-sync',owner,connected:connected===true,location:location==='unit'?'unit':'space',items:rows,truncated:connected===true&&source.length>MAX_ITEMS};
  }
  return Object.freeze({snapshot,MAX_ITEMS});
});
