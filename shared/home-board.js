(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EstudiemosHomeBoard=api;})(typeof window==='undefined'?globalThis:window,function(){
  const keys=['focus','progress','assistant','workspace','calendar','inbox'];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function defaults(list=keys){
    const row=items=>items.length===1?items[0]:{axis:'x',ratio:1/items.length,a:items[0],b:row(items.slice(1))};
    if(!list.length)return null;if(list.length<=3)return row(list);
    const mid=Math.ceil(list.length/2);return {axis:'y',ratio:.5,a:row(list.slice(0,mid)),b:row(list.slice(mid))};
  }
  function sanitize(raw){
    const seen=new Set();
    function visit(n,depth){
      if(typeof n==='string'&&keys.includes(n)&&!seen.has(n)){seen.add(n);return n;}
      if(!n||typeof n!=='object'||depth>8||!['x','y'].includes(n.axis))return null;
      const a=visit(n.a,depth+1),b=visit(n.b,depth+1);return a&&b?{axis:n.axis,ratio:Number.isFinite(n.ratio)?clamp(n.ratio,.05,.95):.5,a,b}:a||b;
    }
    const tree=visit(raw,0);return seen.size===keys.length?tree:defaults();
  }
  function visibleTree(n,visible,path=''){
    if(typeof n==='string')return visible[n]===false?null:{key:n};if(!n)return null;
    const a=visibleTree(n.a,visible,path+'a'),b=visibleTree(n.b,visible,path+'b');return a&&b?{axis:n.axis,ratio:n.ratio,a,b,path}:a||b;
  }
  function layout(tree,width,height,visible={},gap=8){
    const boxes={},splits=[],n=visibleTree(tree,visible);
    const collect=n=>n.key?[n.key]:[...collect(n.a),...collect(n.b)];
    const minimum=n=>n.key?{w:240,h:({focus:206,progress:228,assistant:216})[n.key]||180}:(()=>{const a=minimum(n.a),b=minimum(n.b);return n.axis==='x'?{w:a.w+b.w+gap,h:Math.max(a.h,b.h)}:{w:Math.max(a.w,b.w),h:a.h+b.h+gap};})();
    function visit(n,x,y,w,h){
      if(n.key){boxes[n.key]={x,y,w,h};return;}
      const first=minimum(n.a),second=minimum(n.b),axis=n.axis,available=Math.max(1,(axis==='x'?w:h)-gap),m1=axis==='x'?first.w:first.h,m2=axis==='x'?second.w:second.h;
      const scale=Math.min(1,available/(m1+m2)),low=m1*scale/available,high=1-m2*scale/available,ratio=clamp(n.ratio,low,high),size=available*ratio;
      splits.push({path:n.path,axis,x,y,w,h,ratio,low,high,available,first:collect(n.a),second:collect(n.b)});
      if(axis==='x'){visit(n.a,x,y,size,h);visit(n.b,x+size+gap,y,w-size-gap,h);}else{visit(n.a,x,y,w,size);visit(n.b,x,y+size+gap,w,h-size-gap);}
    }
    if(n)visit(n,0,0,Math.max(1,width),Math.max(1,height));return {boxes,splits};
  }
  function setRatio(tree,path,ratio){let n=tree;for(const part of path)n=n[part];if(n&&typeof n==='object')n.ratio=clamp(ratio,.01,.99);}
  function swap(tree,a,b){if(typeof tree==='string')return tree===a?b:tree===b?a:tree;return {...tree,a:swap(tree.a,a,b),b:swap(tree.b,a,b)};}
  function boundary(splits,key,axis){return [...splits].reverse().find(s=>s.axis===axis&&(s.first.includes(key)||s.second.includes(key)));}
  return {keys,defaults,sanitize,layout,setRatio,swap,boundary};
});
