(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./inbox-alarms'),require('./study-goal'));
  else root.EstudiemosWindowsAlarmSnapshot=factory(root.EstudiemosAlarmRules,root.EstudiemosStudyGoal);
})(typeof globalThis!=='undefined'?globalThis:this,function(alarms,goals){
  const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,KIND='estudiemos-local-alarms',MAX_BYTES=400000;
  function validate(value,owner){
    if(!value||value.version!==2||value.kind!==KIND||!UUID.test(value.deviceId||'')||value.owner!==owner||!Array.isArray(value.items)||value.items.length>500)throw new Error('Elegí el archivo local de alarmas conectado a esta cuenta.');
    return value;
  }
  function create(owner,deviceId,agenda,streak={},now=new Date()){
    if(!UUID.test(owner||'')||!UUID.test(deviceId||''))throw new Error('Conectá primero esta cuenta con Windows.');
    const date=alarms.dateKey(now),goal=(goals||globalThis.EstudiemosStudyGoal).read(streak),items=(Array.isArray(agenda)?agenda:[]).filter(item=>!item?.done&&alarms.normalize(item?.alarm)).map(item=>({
      id:String(item.id).slice(0,180),title:String(item.title||'Tarea pendiente').slice(0,90),alarm:{...alarms.normalize(item.alarm),windows:true}
    }));
    if(items.length>500)throw new Error('Esta PC admite hasta 500 alarmas activas. Las anteriores no se reemplazaron.');
    return {version:2,kind:KIND,owner,deviceId,items,study:{date,minutes:Math.min(1440,Math.max(0,Math.floor(Number(streak.days?.[date])||0))),goalMinutes:goal.minutes,configured:goal.configured}};
  }
  return Object.freeze({validate,create,KIND,MAX_BYTES});
});
