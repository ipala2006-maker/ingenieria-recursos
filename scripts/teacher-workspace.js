(function(){
  const roles=window.EstudiemosCourseRole;
  if(!roles||!window.EstudiemosClasses)return;
  const query=new URL(location.href),signal=query.searchParams.get('drive'),classId=query.searchParams.get('uploadClass');
  if(signal||classId){query.searchParams.delete('drive');query.searchParams.delete('uploadClass');history.replaceState(history.state,'',query);}
  async function start(){
    await window.EstudiemosAccount.whenReady();
    const role=roles.bind(window.EstudiemosAccount.getUser());
    if(role==='student')return location.replace(roles.studentUrl());
    await window.EstudiemosClasses.refresh(true);
    await window.EstudiemosClasses.open({standalone:true,id:window.EstudiemosClassroomRules.UUID.test(classId||'')?classId:'',upload:signal==='connected'});
    document.querySelector('.teacher-loading')?.remove();
    if(signal)window.dispatchEvent(new CustomEvent('estudiemos:course-drive-return',{detail:{result:signal}}));
  }
  start().catch(()=>{const node=document.querySelector('.teacher-loading');if(node)node.textContent='No pudimos cargar tus materias. Recargá la página para volver a intentar.';});
})();
