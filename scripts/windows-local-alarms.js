(function(){
  if(window.EstudiemosWindowsLocalAlarms||!window.EstudiemosWindowsAlarmSnapshot)return;
  const rules=window.EstudiemosWindowsAlarmSnapshot,KEY='estudiemos_windows_alarm_connection';
  let record=null,ready=false,generation=0,timer=0,last='',writing=false,pending=false,database,writeQueue=Promise.resolve();
  const owner=()=>window.EstudiemosAccount?.getUser()?.id||'';
  const supported=()=>typeof window.showOpenFilePicker==='function'&&Boolean(window.indexedDB);
  function signal(status,message=''){
    ready=status==='ready';window.dispatchEvent(new CustomEvent('estudiemos:windows-local-alarm-status',{detail:{status,message,owner:owner()}}));
  }
  function db(){
    if(!database)database=new Promise((resolve,reject)=>{
      const request=indexedDB.open('estudiemos-windows-local-alarms',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('connections');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('No pudimos recordar el archivo local de alarmas.'));
    }).catch(error=>{database=null;throw error;});
    return database;
  }
  async function saved(value){
    const database=await db();return new Promise((resolve,reject)=>{
      const tx=database.transaction('connections',value?'readwrite':'readonly'),store=tx.objectStore('connections');
      const request=value?store.put(value,'active'):store.get('active');let result;
      request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('No pudimos recordar el archivo de alarmas.'));
    });
  }
  async function read(handle,user){
    const file=await handle.getFile();
    if(!file.name.endsWith('.estudiemos-local')||file.size>rules.MAX_BYTES)throw new Error('Este no es el archivo local de alarmas de Estudiemos.');
    return rules.validate(JSON.parse(await file.text()),user);
  }
  function data(){
    return rules.create(owner(),record.deviceId,JSON.parse(localStorage.getItem('bandeja_agenda')||'[]'),JSON.parse(localStorage.getItem('estudiemos_pomodoro_streak')||'{}'));
  }
  function write(value,version){
    const connection=record;
    // Serialize ordinary writes and logout cleanup: a late close must not restore old alarms.
    const task=writeQueue.catch(()=>{}).then(async()=>{
      if(version!==generation)return false;
      const current=await read(connection.handle,connection.owner);
      if(current.deviceId!==connection.deviceId)throw new Error('El archivo cambió de conexión. Volvé a seleccionarlo.');
      if(version!==generation)return false;
      const text=JSON.stringify(value);if(text===last)return true;
      const stream=await connection.handle.createWritable();
      try{if(version!==generation){await stream.abort();return false;}await stream.write(text);if(version!==generation){await stream.abort();return false;}await stream.close();last=text;return true;}
      catch(error){try{await stream.abort();}catch(_){}throw error;}
    });
    writeQueue=task;return task;
  }
  async function synchronize(){
    if(writing){pending=true;return;}
    if(!record||!owner()||record.owner!==owner())return;
    if(window.EstudiemosAccount?.isSynchronized?.()===false)return;
    writing=true;pending=false;const version=generation;
    try{
      if(await record.handle.queryPermission({mode:'readwrite'})!=='granted'){signal('needs-permission','Permití actualizar el archivo local para sincronizar esta PC.');return;}
      const value=data();
      if(await write(value,version)&&version===generation){
        localStorage.setItem(KEY,JSON.stringify({mode:'local',version:'2.0.0',userId:record.owner,deviceId:record.deviceId,updatedAt:Date.now()}));
        signal('ready','Programadas en esta PC. Se actualizan al abrir o sincronizar Estudiemos.');
      }
    }catch(error){if(version===generation)signal('error',error.message||'No pudimos actualizar la programación local.');}
    finally{writing=false;if(pending)schedule();}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(synchronize,600);}
  async function connectFile(){
    if(!supported())throw new Error('Para programar alarmas locales en Windows, abrí Estudiemos en Microsoft Edge o Google Chrome.');
    const user=owner(),version=generation;if(!user)throw new Error('Iniciá sesión antes de conectar las alarmas.');
    // The picker is invoked synchronously from the user's click, not in the background.
    const [handle]=await window.showOpenFilePicker({id:'estudiemos-local-alarms',startIn:'documents',multiple:false,types:[{description:'Alarmas locales de Estudiemos',accept:{'application/json':['.estudiemos-local']}}]});
    const value=await read(handle,user);
    if(version!==generation||user!==owner())return;
    if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('El archivo necesita permiso de escritura para actualizar tus alarmas.');
    const next={handle,owner:user,deviceId:value.deviceId};await saved(next);
    if(version!==generation||user!==owner())return;
    record=next;last='';await synchronize();
  }
  async function changed(){
    const version=++generation;ready=false;last='';clearTimeout(timer);
    try{
      const previous=record||await saved();
      if(version!==generation)return;
      record=previous||null;
      if(record&&record.owner!==owner()){
        // Signing out stops the old account's local alarms when permission is still available.
        if(await record.handle.queryPermission({mode:'readwrite'})==='granted'){
          await write({...await read(record.handle,record.owner),items:[],study:null,disabled:true},version);
        }else signal('needs-permission','La PC conserva la última programación. Reconectá el archivo para quitarla.');
        ready=false;return;
      }
      if(!record){signal('not-linked');return;}
      await synchronize();
    }catch(error){if(version===generation)signal('error',error.message);}
  }
  window.EstudiemosWindowsLocalAlarms=Object.freeze({supported,connectFile,sync:synchronize,ready:()=>ready&&record?.owner===owner()});
  for(const name of ['estudiemos:data-change','estudiemos:cloud-restored','estudiemos:account-synced','focus','pageshow'])window.addEventListener(name,schedule);
  window.addEventListener('storage',event=>{if(['bandeja_agenda','estudiemos_pomodoro_streak'].includes(event.key))schedule();});
  for(const name of ['estudiemos:account-change','estudiemos:account-ready'])window.addEventListener(name,changed);
  if(window.EstudiemosAccount?.whenReady)window.EstudiemosAccount.whenReady().then(changed).catch(()=>{});
})();
