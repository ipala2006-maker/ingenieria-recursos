(function(){
  if(window.EstudiemosCourseRole)return;
  const root=new URL('../',document.currentScript.src),prefix='estudiemos_course_role:',identityKey=prefix+'owner',pendingKey=prefix+'pending';
  let owner='guest';try{owner=localStorage.getItem(identityKey)||'guest';}catch(_){}
  const valid=value=>value==='teacher'||value==='student',memory=new Map();
  function get(){try{const value=localStorage.getItem(prefix+owner)||memory.get(owner);return valid(value)?value:'';}catch(_){return memory.get(owner)||'';}}
  function set(value){
    if(!valid(value))return;
    memory.set(owner,value);
    try{localStorage.setItem(prefix+owner,value);if(owner==='guest')sessionStorage.setItem(pendingKey,JSON.stringify({role:value,expires:Date.now()+86400000}));}catch(_){}
    window.dispatchEvent(new CustomEvent('estudiemos:course-role',{detail:{role:value}}));
  }
  function bind(user){
    owner=user?.id||'guest';
    try{
      if(user){
        const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
        if(pending?.expires>Date.now()&&valid(pending.role)){localStorage.setItem(prefix+owner,pending.role);sessionStorage.removeItem(pendingKey);localStorage.removeItem(prefix+'guest');}
        localStorage.setItem(identityKey,owner);
      }else localStorage.removeItem(identityKey);
    }catch(_){}
    return get();
  }
  function teacherUrl(){return new URL('materias.html',root);}
  function studentUrl(){const url=new URL('./',root);url.searchParams.set('materias','1');return url;}
  function choose(value){set(value);if(value==='teacher'&&!document.body?.classList.contains('teacher-workspace'))location.assign(teacherUrl());else if(value==='student'&&document.body?.classList.contains('teacher-workspace'))location.assign(studentUrl());}
  window.EstudiemosCourseRole=Object.freeze({get,set,bind,choose,teacherUrl,studentUrl});
  const url=new URL(location.href);
  if(document.currentScript.hasAttribute('data-role-entry')&&get()==='teacher'&&!url.search&&!url.hash)location.replace(teacherUrl());
})();
