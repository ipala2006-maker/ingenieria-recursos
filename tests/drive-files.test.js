const test=require('node:test'),assert=require('node:assert/strict');
const {DriveFiles,FOLDER,fileCheck,openUrl}=require('../shared/drive-files');
const root='root-folder',owner='alice',metadata={id:'a-file',name:'Apunte.pdf',mimeType:'application/pdf',parents:[root],appProperties:{estudiemosOwner:owner,estudiemosSpace:root}};
function library(responder=()=>Response.json({files:[]})){
  const calls=[],tokens=[];
  const drive=new DriveFiles({userId:owner,getToken:async force=>{tokens.push(force);return 'pilot-access';},fetchImpl:async (url,options)=>{calls.push({url,options});return responder(url,options,calls.length);}});
  drive.rootId=root;return {drive,calls,tokens};
}
test('Drive requests send only short-lived tokens directly to Google, never to an arbitrary URL',async()=>{
  const h=library();await h.drive.list(root,"O'Brien \\ ' or trashed = true");
  const call=h.calls[0],url=new URL(call.url);assert.equal(url.origin,'https://www.googleapis.com');assert.equal(call.options.credentials,'omit');assert.equal(call.options.headers.Authorization,'Bearer pilot-access');assert.ok(!url.search.includes('pilot-access'));
  assert.match(url.searchParams.get('q'),/estudiemosOwner/);assert.match(url.searchParams.get('q'),/estudiemosSpace/);assert.ok(url.searchParams.get('q').includes("O\\'Brien"));
  await assert.rejects(h.drive.request('https://attacker.test/drive/v3/files'),/Destino/);assert.equal(h.calls.length,1);
});
test('expired access retries once with a forced refresh, not an infinite authentication loop',async()=>{
  const h=library((url,options,n)=>n===1?Response.json({},{status:401}):Response.json({files:[]}));
  await h.drive.list();assert.deepEqual(h.tokens,[false,true]);
  const denied=library(()=>Response.json({},{status:401}));await assert.rejects(denied.drive.list(),/conectar/);assert.equal(denied.calls.length,2);
});
test('an account change prevents queued and in-flight data from reaching another account',async()=>{
  const h=library();h.drive.isCurrent=()=>false;await assert.rejects(h.drive.list(),/cuenta cambi/);assert.equal(h.calls.length,0);
  const inFlight=library(()=>{inFlight.drive.isCurrent=()=>false;return Response.json({files:[metadata]});});await assert.rejects(inFlight.drive.list(),/cuenta cambi/);
});
test('initialization reuses the app-owned folder, and uses only the user Drive quota',async()=>{
  const h=library(url=>url.includes('/about?')?Response.json({user:{emailAddress:'student@example.test'},storageQuota:{limit:'15000000000',usage:'2000000'}}):Response.json({files:[{id:root,mimeType:FOLDER}]}));
  h.drive.rootId='';await h.drive.initialize();assert.equal(h.drive.rootId,root);assert.ok(h.calls.every(call=>!call.options.method));assert.equal(h.drive.about.user.emailAddress,'student@example.test');
});
test('mutations cannot touch unrelated files or move a folder into itself',async()=>{
  const h=library(()=>Response.json({...metadata,appProperties:{estudiemosOwner:'other',estudiemosSpace:root}}));
  await assert.rejects(h.drive.rename('a-file','New'),/no pertenece/);assert.ok(h.calls.every(call=>!call.options.method));
  const owned=library(()=>Response.json(metadata));await assert.rejects(owned.drive.move('a-file','a-file'),/destino no es una carpeta/);
  const folder=library(()=>Response.json({...metadata,mimeType:FOLDER}));await assert.rejects(folder.drive.move('a-file','a-file'),/dentro de s/);
});
test('trash is recoverable and changing names preserves ownership and never issues permanent DELETE',async()=>{
  const h=library((url,options)=>Response.json(options.method?{...metadata,...JSON.parse(options.body)}:metadata));
  await h.drive.trash('a-file');await h.drive.rename('a-file','Nuevo nombre.pdf');
  assert.deepEqual(h.calls.filter(call=>call.options.method).map(call=>JSON.parse(call.options.body)),[{trashed:true},{name:'Nuevo nombre.pdf'}]);assert.ok(!h.calls.some(call=>call.options.method==='DELETE'));
});
test('uploads validate type/size and never send data to a malicious resumable session',async()=>{
  for(const file of [{name:'malware.exe',size:1},{name:'empty.pdf',size:0},{name:'huge.pdf',size:51*1024*1024},{name:'bad\nname.pdf',size:10}])assert.throws(()=>fileCheck(file));
  const h=library(()=>new Response('',{status:200,headers:{Location:'https://attacker.test/upload/drive/v3/files'}}));
  const file=new File(['pdf'],'apunte.pdf',{type:'application/pdf'});await assert.rejects(h.drive.upload(file),/prepar/);assert.equal(h.calls.length,1);
});
test('resumable upload sends original bytes to Google and confirms completion before success',async()=>{
  const h=library((url,options)=>options.method==='POST'?new Response('',{status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=pilot'}}):Response.json(metadata));
  const file=new File(['original pdf bytes'],'apunte.pdf',{type:'application/pdf'}),progress=[];
  const result=await h.drive.upload(file,root,value=>progress.push(value));assert.equal(result.id,'a-file');assert.equal(await h.calls[1].options.body.text(),'original pdf bytes');assert.deepEqual(progress,[100]);
  assert.deepEqual(JSON.parse(h.calls[0].options.body).parents,[root]);assert.equal(JSON.parse(h.calls[0].options.body).appProperties.estudiemosOwner,owner);
});
test('file links cannot execute scripts or forward credentials to another domain',()=>{
  for(const webViewLink of ['javascript:alert(1)','https://attacker.test/file','https://drive.google.com.attacker.test/file'])assert.equal(openUrl({id:'file-123',webViewLink}),'https://drive.google.com/file/d/file-123/view');
  assert.throws(()=>openUrl({id:'../file'}));assert.equal(openUrl({id:'file-123',webViewLink:'https://docs.google.com/document/d/file-123/edit'}),'https://docs.google.com/document/d/file-123/edit');
});
