(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.EstudiemosPomodoroSync=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const KEY='estudiemos_pomodoro_sync';
  const time=value=>Number.isSafeInteger(Number(value))&&Number(value)>0&&Number(value)<=8640000000000000?Number(value):0;
  const integer=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Math.floor(Number(value)))):fallback;
  function parse(value){try{return typeof value==='string'?JSON.parse(value):value;}catch(_){return null;}}
  function controls(value){
    const v=parse(value);
    if(!v||typeof v!=='object'||Array.isArray(v))return null;
    const config={blocks:integer(v.config?.blocks,1,100,4),study:integer(v.config?.study,0,59,25),break:integer(v.config?.break,0,59,5)};
    const phase=v.phase==='break'?'break':'study',running=v.running===true&&time(v.endAt)>0;
    return {config,phase,currentBlock:integer(v.currentBlock,1,config.blocks,1),remaining:running?0:integer(v.remaining,0,3540,config[phase]*60),running,endAt:running?time(v.endAt):0,autoStart:v.autoStart===true};
  }
  function normalize(value){
    const v=parse(value),c=controls(v);
    if(!c||!time(v.updatedAt)||typeof v.writer!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v.writer))return null;
    const previous=v.previous&&time(v.previous.updatedAt)&&typeof v.previous.writer==='string'
      ?{updatedAt:time(v.previous.updatedAt),writer:v.previous.writer.slice(0,100)}:null;
    return {...c,updatedAt:time(v.updatedAt),writer:v.writer,previous};
  }
  function compare(left,right){
    const a=normalize(left),b=normalize(right);
    if(!a||!b)return a?1:b?-1:0;
    return a.updatedAt-b.updatedAt||(a.writer<b.writer?-1:a.writer>b.writer?1:0);
  }
  function signature(value){return JSON.stringify(controls(value));}
  function choose(a,b){return compare(a,b)>0?normalize(a):normalize(b);}
  return Object.freeze({KEY,normalize,controls,compare,signature,choose});
});
