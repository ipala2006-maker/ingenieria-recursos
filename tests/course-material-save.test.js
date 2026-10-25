const test=require('node:test'),assert=require('node:assert/strict');
const {DriveFiles,FOLDER}=require('../shared/drive-files'),rules=require('../shared/classrooms');
const root='student-root',owner='student',pdf={id:'shared-pdf',mimeType:'application/pdf',capabilities:{canCopy:true}};
function harness(responder){
  const calls=[],drive=new DriveFiles({userId:owner,getToken:async()=>'student-token',fetchImpl:async(url,options)=>{
    calls.push({url,options});return responder(url,options);
  }});drive.rootId=root;return {drive,calls};
}
test('Drive material links retain resource keys but reject arbitrary URLs before any Google operation',()=>{
  assert.deepEqual(rules.driveSource('https://drive.google.com/file/d/SHARED_PDF/view?resourcekey=key_123&tracking=ignored'),{id:'SHARED_PDF',resourceKey:'key_123',folder:false});
  assert.deepEqual(rules.driveSource('https://docs.google.com/document/d/DOC_123/edit'),{id:'DOC_123',resourceKey:'',folder:false});
  assert.equal(rules.driveSource('https://drive.google.com/drive/u/1/folders/FOLDER_123').folder,true);
  for(const value of ['https://drive.google.com.evil.test/file/d/SHARED_PDF/view','javascript:alert(1)','https://evil.test/file/d/SHARED_PDF/view'])assert.equal(rules.driveSource(value),null);
});
for(const mode of ['copy','shortcut'])test(mode+' creates only in the student Drive, with no file bytes or sharing mutations',async()=>{
  const h=harness((url,options)=>Response.json(options.method?{id:'saved-item',...JSON.parse(options.body)}:pdf));
  const result=await h.drive.saveCourseMaterial({id:pdf.id,resourceKey:'resource_key'},mode,root,'Guia de la materia');
  assert.equal(result.id,'saved-item');assert.equal(h.calls.length,2);
  const [read,write]=h.calls,body=JSON.parse(write.options.body);
  assert.deepEqual(body.parents,[root]);assert.equal(body.appProperties.estudiemosOwner,owner);assert.equal(body.appProperties.estudiemosSpace,root);
  assert.equal(body.name,'Guia de la materia');assert.equal(body.permissions,undefined);assert.equal(body.owners,undefined);
  assert.equal(write.options.headers.Authorization,'Bearer student-token');assert.equal(write.options.headers['X-Goog-Drive-Resource-Keys'],'shared-pdf/resource_key');
  assert.equal(read.options.headers['X-Goog-Drive-Resource-Keys'],'shared-pdf/resource_key');
  assert.ok(h.calls.every(call=>new URL(call.url).origin==='https://www.googleapis.com'&&!/alt=media|upload|permissions|student-token/.test(call.url)));
  assert.ok(h.calls.every(call=>!call.options.method||call.options.method==='POST'));
  if(mode==='copy'){assert.match(write.url,/shared-pdf\/copy\?/);assert.equal(body.shortcutDetails,undefined);}
  else{assert.equal(new URL(write.url).pathname,'/drive/v3/files');assert.equal(body.mimeType,'application/vnd.google-apps.shortcut');assert.deepEqual(body.shortcutDetails,{targetId:pdf.id});}
});
test('folders support shortcuts, not recursive copies; disabled copying never causes a write',async()=>{
  for(const item of [{...pdf,mimeType:FOLDER},{...pdf,capabilities:{canCopy:false}},{...pdf,capabilities:{}},{...pdf,trashed:true}]){
    const h=harness(()=>Response.json(item));await assert.rejects(h.drive.saveCourseMaterial({id:pdf.id},'copy',root,'Guia'));
    assert.ok(h.calls.every(call=>!call.options.method));
  }
  const h=harness((url,options)=>Response.json(options.method?{id:'saved-folder'}:{...pdf,mimeType:FOLDER,capabilities:{canCopy:false}}));
  assert.equal((await h.drive.saveCourseMaterial({id:pdf.id},'shortcut',root,'Materia')).id,'saved-folder');
});
test('existing shortcuts resolve the real original and resource key; malformed cycles never create a copy',async()=>{
  const shortcut={id:'shortcut-file',mimeType:'application/vnd.google-apps.shortcut',shortcutDetails:{targetId:pdf.id,targetResourceKey:'target_key'}};
  const h=harness((url,options)=>Response.json(options.method?{id:'personal-copy'}:url.includes('/shortcut-file?')?shortcut:pdf));
  await h.drive.saveCourseMaterial({id:shortcut.id},'copy',root,'Apunte');
  assert.match(h.calls.at(-1).url,/shared-pdf\/copy/);assert.equal(h.calls.at(-1).options.headers['X-Goog-Drive-Resource-Keys'],'shared-pdf/target_key');
  const loop=harness(()=>Response.json({...shortcut,shortcutDetails:{targetId:shortcut.id}}));
  await assert.rejects(loop.drive.saveCourseMaterial({id:shortcut.id},'shortcut',root,'Apunte'),/destino/);assert.ok(loop.calls.every(call=>!call.options.method));
});
test('file-level authorization and foreign folder restrictions cannot be bypassed or broadened',async()=>{
  const denied=harness(()=>Response.json({error:{}},{status:403}));
  await assert.rejects(denied.drive.saveCourseMaterial({id:pdf.id},'copy',root,'Guia'),error=>error.status===403);assert.equal(denied.calls.length,1);
  const foreign=harness(()=>Response.json({id:'foreign-folder',mimeType:FOLDER,appProperties:{estudiemosOwner:'another-user',estudiemosSpace:'other-root'}}));
  await assert.rejects(foreign.drive.saveCourseMaterial({id:pdf.id},'shortcut','foreign-folder','Guia'),/no pertenece/);assert.ok(foreign.calls.every(call=>!call.options.method));
  const invalid=harness(()=>{throw Error('No network expected');});
  for(const [source,mode,title]of [[{id:'../bad'},'copy','Guia'],[{id:pdf.id,resourceKey:'bad\r\nheader'},'copy','Guia'],[{id:pdf.id},'auto','Guia'],[{id:pdf.id},'copy','']])await assert.rejects(invalid.drive.saveCourseMaterial(source,mode,root,title));
  assert.equal(invalid.calls.length,0);
});
test('failed creations are not retried or reported as saved, and account changes block pending copies',async()=>{
  const failed=harness((url,options)=>options.method?Response.json({error:{}},{status:503}):Response.json(pdf));
  await assert.rejects(failed.drive.saveCourseMaterial({id:pdf.id},'copy',root,'Guia'));
  assert.equal(failed.calls.filter(call=>call.options.method==='POST').length,1);
  const changed=harness(()=>{changed.drive.isCurrent=()=>false;return Response.json(pdf);});
  await assert.rejects(changed.drive.saveCourseMaterial({id:pdf.id},'shortcut',root,'Guia'),/cuenta cambi/);assert.equal(changed.calls.length,1);
});
