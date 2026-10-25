(function(){
  if(window.EstudiemosCourseDrive)return;
  const root=new URL('../',document.currentScript.src),UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  let generation=0,library=null,libraryTask=null,token=null,loader;
  const account=()=>window.EstudiemosAccount,identity=()=>account()?.getUser()?.id||'';
  async function request(action,values={},method='GET'){
    const owner=identity(),session=account()?.getSession();
    if(!owner||!session?.access_token)throw new Error('Iniciá sesión para conectar Drive.');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(new URL('api/account-config?drive='+action,root),{method,headers:{Authorization:'Bearer '+session.access_token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(values)}:{}),cache:'no-store',credentials:'same-origin',signal:controller.signal});
      const result=await response.json();
      if(owner!==identity())throw new Error('La cuenta cambió. Volvé a abrir la materia.');
      if(!response.ok)throw new Error(result.message||'No pudimos conectar con Drive.');
      return result;
    }finally{clearTimeout(timeout);}
  }
  function load(){
    if(window.EstudiemosDriveFiles)return Promise.resolve();
    if(!loader)loader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('shared/drive-files.js?v=20261024-courses',root);script.onload=resolve;script.onerror=()=>{loader=null;script.remove();reject(new Error('No pudimos cargar Drive. Volvé a intentar.'));};document.head.append(script);});
    return loader;
  }
  async function drive(){
    if(library)return library;
    if(libraryTask)return libraryTask;
    const owner=identity(),version=generation;
    const task=(async()=>{
      await load();const state=await request('status');
      if(!state.connected)throw new Error('Conectá tu Google Drive antes de subir un PDF.');
      const files=new window.EstudiemosDriveFiles.DriveFiles({userId:owner,isCurrent:()=>identity()===owner&&generation===version,getToken:async force=>{
        if(!force&&token?.expiresAt>Date.now()+120000)return token.accessToken;
        token=await request('token',{force:force===true},'POST');return token.accessToken;
      }});
      await files.initialize();files.check();library=files;return files;
    })();
    libraryTask=task;
    try{return await task;}finally{if(libraryTask===task)libraryTask=null;}
  }
  async function connect(classId){
    if(!UUID.test(classId))throw new Error('Elegí una materia antes de conectar Drive.');
    const context=document.body.classList.contains('teacher-workspace')?'teacher':'student-course';
    try{sessionStorage.setItem('estudiemos_course_upload',JSON.stringify({owner:identity(),classId,expires:Date.now()+3600000}));}catch(_){}
    if(window.EstudiemosAndroid?.postMessage){window.EstudiemosAndroid.postMessage(JSON.stringify({type:'drive-connect-browser',context,classId}));return;}
    const result=await request('start',{context,classId},'POST'),url=new URL(result.url);
    if(url.origin!=='https://accounts.google.com')throw new Error('Google no devolvió una conexión válida.');
    location.assign(url);
  }
  async function destinations(course){
    if(!UUID.test(course?.id||''))throw new Error('Materia no válida.');
    const files=await drive(),folders=await files.folders();files.check();
    const byId=new Map(folders.map(item=>[item.id,item]));
    function path(item){const parts=[item.name],seen=new Set([item.id]);let parent=item.parents?.[0];while(parent&&parent!==files.rootId&&byId.has(parent)&&!seen.has(parent)){seen.add(parent);const folder=byId.get(parent);parts.unshift(folder.name);parent=folder.parents?.[0];}return 'Estudiemos / '+parts.join(' / ');}
    return {email:files.about?.user?.emailAddress||'',rootUrl:'https://drive.google.com/drive/folders/'+files.rootId,
      defaultLabel:'Estudiemos / '+course.title,folders:folders.map(item=>({id:item.id,name:path(item)})).sort((a,b)=>a.name.localeCompare(b.name,'es'))};
  }
  async function upload(file,course,progress,destination=''){
    if(!UUID.test(course?.id||''))throw new Error('Materia no válida.');
    if(!file||!file.name.toLowerCase().endsWith('.pdf')||!file.size||file.size>50*1024*1024||await file.slice(0,5).text()!=='%PDF-')throw new Error('Elegí un PDF válido de hasta 50 MB.');
    const files=await drive();
    let folder;
    if(destination){await files.parent(destination);folder={id:destination};}
    else{folder=(await files.folders()).find(item=>item.appProperties?.estudiemosCourse===course.id);
      if(!folder){folder=await files.createFolder(course.title);folder=await files.patch(folder.id,{appProperties:{...folder.appProperties,estudiemosCourse:course.id}});}}
    const result=await files.upload(new File([file],file.name,{type:'application/pdf'}),folder.id,progress);
    const item=await files.patch(result.id,{appProperties:{...result.appProperties,estudiemosCourse:course.id}});
    return {id:item.id,title:item.name,url:window.EstudiemosDriveFiles.openUrl(item),folderUrl:'https://drive.google.com/drive/folders/'+folder.id};
  }
  async function share(item,courseId,consent){const files=await drive();await files.shareCoursePdf(item.id,courseId,consent);}
  window.addEventListener('estudiemos:account-change',()=>{generation++;library=null;libraryTask=null;token=null;});
  window.EstudiemosCourseDrive=Object.freeze({connect,upload,share,destinations,status:()=>request('status')});
})();
