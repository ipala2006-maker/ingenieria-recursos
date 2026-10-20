const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {snapshot,MAX_ITEMS}=require('../shared/drive-widget');
const folder={id:'folder_123',name:'Mis apuntes',mimeType:'application/vnd.google-apps.folder'};

test('Drive widget receives only bounded metadata, not credentials, contents or arbitrary URLs',()=>{
  const result=snapshot('owner-a',true,[{...folder,access_token:'secret',email:'private@example.test',content:'private',webViewLink:'https://bad.test',appProperties:{secret:true}}],'unit');
  assert.deepEqual(result,{type:'drive-workspace-sync',owner:'owner-a',connected:true,location:'unit',items:[{id:folder.id,name:folder.name,kind:'folder',mimeType:folder.mimeType,sizeBytes:0,parentId:null}],truncated:false});
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(snapshot('',true,[]),null);
  assert.equal(snapshot(null,true,[]),null);
  assert.equal(snapshot('a'.repeat(101),true,[]),null);
});

test('Drive widget skips unsafe entries and caps its private preview',()=>{
  const result=snapshot('owner-a',true,[{...folder,id:'../other'},{...folder,name:'  '},{...folder,trashed:true},{...folder,name:' Guia\n\t.pdf ',mimeType:'application/pdf',size:'3000'}]);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].name,'Guia.pdf');
  assert.equal(result.items[0].kind,'file');
  assert.equal(result.items[0].sizeBytes,3000);
  const large=snapshot('owner-a',true,Array.from({length:MAX_ITEMS+10},(_,i)=>({...folder,id:'file_'+i,name:'a'.repeat(200)})));
  assert.equal(large.items.length,MAX_ITEMS);
  assert.equal(large.items[0].name.length,120);
  assert.equal(large.truncated,true);
});

test('Disconnect sends an empty preview and non-boolean consent is not accepted',()=>{
  for(const connected of [false,'true',null,undefined]) {
    const result=snapshot('owner-a',connected,[folder]);
    assert.equal(result.connected,false);
    assert.deepEqual(result.items,[]);
  }
});

test('Native cached rows and opening intents retain their original account owner',()=>{
  const base=path.resolve(__dirname,'../android-app/app/src/main/java/com/estudiemos/app');
  const provider=fs.readFileSync(path.join(base,'WorkspaceWidgetProvider.java'),'utf8');
  const service=fs.readFileSync(path.join(base,'WorkspaceWidgetService.java'),'utf8');
  const activity=fs.readFileSync(path.join(base,'MainActivity.java'),'utf8');
  assert.match(provider,/new WorkspaceEntry\(id, name, kind,.*owner\)/);
  assert.match(service,/EXTRA_DRIVE_OWNER, entry.owner/);
  assert.match(service,/belongsTo\(entry.owner, WidgetSyncManager.currentUserId\(context\)\)/);
  assert.match(activity,/belongsTo\(intent.getStringExtra\(EXTRA_DRIVE_OWNER\), WidgetSyncManager.currentUserId\(this\)\)/);
  assert.match(provider,/rawMessage.length\(\) > 65536/);
});
