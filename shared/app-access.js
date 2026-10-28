(function(root,factory){
  const policy=factory();
  if(typeof module==='object'&&module.exports)module.exports=policy;
  else root.EstudiemosAccessRules=policy;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const free=Object.freeze(['classes','createClass','courseFiles','calendar']);
  const advanced=Object.freeze(['inbox','pomodoro','progress','workspace','friends','personalLayout']);
  function resolve({mode='pilot',paidPro=false,ownsClass=false}={}){
    const restricted=mode==='restricted',full=!restricted||paidPro===true||ownsClass===true;
    return Object.freeze({mode:restricted?'restricted':'pilot',fullAccess:full,
      reason:!restricted?'pilot':paidPro===true?'subscription':ownsClass===true?'class-owner':'free',
      features:Object.freeze([...free,...(full?advanced:[])]),proFeatures:advanced,billingEnabled:false});
  }
  function allows(access,feature){return Array.isArray(access?.features)&&access.features.includes(feature);}
  const configuredMode=(mode,published=false)=>published===true&&mode==='restricted'?'restricted':'pilot';
  function courseEntry({mode='pilot',invited=false,selected=false,ownsClass=false,paidPro=false}={}){
    return Boolean(mode==='restricted'&&(invited||selected)&&!ownsClass&&!paidPro);
  }
  return Object.freeze({free,advanced,resolve,allows,courseEntry,configuredMode});
});
