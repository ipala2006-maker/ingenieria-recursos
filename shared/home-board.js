(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EstudiemosHomeBoard=api;})(typeof window==='undefined'?globalThis:window,function(){
  const originalKeys=['focus','progress','assistant','workspace','calendar','inbox'];
  const keys=[...originalKeys,'classes'];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function defaults(list){
    if(!list)return {axis:'y',ratio:.7,a:defaults(originalKeys),b:'classes'};
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
    const tree=visit(raw,0);
    if(seen.size===keys.length)return tree;
    // Append the optional tool without changing any existing split when it is hidden.
    if(seen.size===originalKeys.length&&originalKeys.every(key=>seen.has(key)))return {axis:'y',ratio:.7,a:tree,b:'classes'};
    return defaults();
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
  const overlaps=(a,b)=>a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01;
  function fits(box,boxes,key,width,height){
    return ['x','y','w','h'].every(k=>Number.isFinite(box[k]))&&box.x>=0&&box.y>=0&&box.w>0&&box.h>0&&box.x+box.w<=width+.01&&box.y+box.h<=height+.01&&Object.entries(boxes).every(([k,r])=>k===key||!overlaps(box,r));
  }
  function firstSpace(box,boxes,key,width,height){
    const xs=[box.x,0],ys=[box.y,0];
    for(const [k,r] of Object.entries(boxes))if(k!==key){xs.push(r.x+r.w+8,r.x-box.w-8);ys.push(r.y+r.h+8,r.y-box.h-8);}
    const candidates=[];for(const x of xs)for(const y of ys){const r={...box,x,y};if(fits(r,boxes,key,width,height))candidates.push(r);}
    return candidates.sort((a,b)=>Math.hypot(a.x-box.x,a.y-box.y)-Math.hypot(b.x-box.x,b.y-box.y))[0]||null;
  }
  const minimumSize=(key,width,height)=>({w:Math.min(240,width),h:Math.min(key==='progress'?228:key==='focus'?200:180,height)});
  function addTool(key,preferred,boxes,width,height){
    if(!keys.includes(key)||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
    const current=Object.fromEntries(Object.entries(boxes).filter(([name])=>keys.includes(name)).map(([name,r])=>[name,{...r}]));
    if(current[key])return {boxes:current,mode:'space'};
    const min=minimumSize(key,width,height),fallback={x:0,y:0,w:Math.max(min.w,width/3),h:Math.max(min.h,height/2)},wanted={...fallback};
    for(const field of ['x','y','w','h'])if(Number.isFinite(preferred?.[field])&&(!['w','h'].includes(field)||preferred[field]>0))wanted[field]=preferred[field];
    const direct=firstSpace(wanted,current,key,width,height);
    if(direct)return {boxes:{...current,[key]:direct},mode:'space'};
    // Maximal empty rectangles let a remembered large tool shrink into a smaller gap.
    let holes=[{x:0,y:0,w:width,h:height}];
    for(const r of Object.values(current)){
      const obstacle={x:Math.max(0,r.x-8),y:Math.max(0,r.y-8),w:Math.min(width,r.x+r.w+8)-Math.max(0,r.x-8),h:Math.min(height,r.y+r.h+8)-Math.max(0,r.y-8)};
      const next=[];
      for(const h of holes){
        if(!overlaps(h,obstacle)){next.push(h);continue;}
        if(obstacle.x>h.x)next.push({...h,w:obstacle.x-h.x});
        if(obstacle.x+obstacle.w<h.x+h.w)next.push({...h,x:obstacle.x+obstacle.w,w:h.x+h.w-obstacle.x-obstacle.w});
        if(obstacle.y>h.y)next.push({...h,h:obstacle.y-h.y});
        if(obstacle.y+obstacle.h<h.y+h.h)next.push({...h,y:obstacle.y+obstacle.h,h:h.y+h.h-obstacle.y-obstacle.h});
      }
      holes=next.filter((a,i)=>a.w>0&&a.h>0&&!next.some((b,j)=>j!==i&&b.x<=a.x&&b.y<=a.y&&b.x+b.w>=a.x+a.w&&b.y+b.h>=a.y+a.h&&(j<i||b.w*b.h>a.w*a.h)));
    }
    const vacant=holes.filter(r=>r.w>=min.w&&r.h>=min.h).map(h=>({x:clamp(wanted.x,h.x,h.x+h.w-Math.min(wanted.w,h.w)),y:clamp(wanted.y,h.y,h.y+h.h-Math.min(wanted.h,h.h)),w:Math.min(wanted.w,h.w),h:Math.min(wanted.h,h.h)}));
    vacant.sort((a,b)=>b.w*b.h-a.w*a.h||Math.hypot(a.x-wanted.x,a.y-wanted.y)-Math.hypot(b.x-wanted.x,b.y-wanted.y));
    if(vacant.length)return {boxes:{...current,[key]:vacant[0]},mode:'space'};
    let best=null;
    for(const [other,r] of Object.entries(current))for(const axis of ['x','y']){
      const size=axis==='x'?'w':'h',cross=axis==='x'?'h':'w',otherMin=minimumSize(other,width,height),room=r[size]-8;
      if(room<min[size]+otherMin[size]||r[cross]<Math.max(min[cross],otherMin[cross]))continue;
      const newSize=clamp(room*wanted[size]/(wanted[size]+r[size]),min[size],room-otherMin[size]);
      const kept={...r,[size]:room-newSize},added={...r,[axis]:r[axis]+room-newSize+8,[size]:newSize};
      const score=Math.abs(Math.log(kept.w*kept.h/(r.w*r.h)))+.25*Math.abs(Math.log((added.w/added.h)/(wanted.w/wanted.h)))+.1*Math.hypot((added.x-wanted.x)/width,(added.y-wanted.y)/height);
      if(!best||score<best.score)best={score,boxes:{...current,[other]:kept,[key]:added}};
    }
    if(best)return {boxes:best.boxes,mode:'split'};
    const ordered=[...Object.keys(current).sort((a,b)=>current[a].y-current[b].y||current[a].x-current[b].x),key];
    for(let cols=1;cols<=ordered.length;cols++){
      const rows=Math.ceil(ordered.length/cols),gap=Math.min(8,width/(cols*3),height/(rows*3)),h=(height-gap*(rows-1))/rows,candidate={};let score=0;
      for(let i=0;i<ordered.length;i++){
        const name=ordered[i],row=Math.floor(i/cols),count=Math.min(cols,ordered.length-row*cols),w=(width-gap*(count-1))/count,r={x:(i%cols)*(w+gap),y:row*(h+gap),w,h},m=minimumSize(name,width,height),old=current[name]||wanted;
        candidate[name]=r;score+=100*(Math.max(0,1-w/m.w)+Math.max(0,1-h/m.h))+Math.abs(Math.log((w/h)/(old.w/old.h)))+.1*Math.hypot((r.x-old.x)/width,(r.y-old.y)/height);
      }
      if(!best||score<best.score)best={score,boxes:candidate};
    }
    return {boxes:best.boxes,mode:'reflow'};
  }
  function freeLayout(placement,tree,width,height,visible={}){
    const fallback=()=>({...layout(tree,width,height,visible),width,height});
    if(!placement||!Number.isFinite(placement.width)||!Number.isFinite(placement.height)||placement.width<=0||placement.height<=0)return fallback();
    const boxes={},stored={},scaleX=width/placement.width,scaleY=height/placement.height;
    for(const key of keys){
      const r=placement.boxes?.[key] || (key==='classes'&&visible.classes===false ? layout(tree,placement.width,placement.height).boxes.classes : null);
      if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>placement.width+.01||r.y+r.h>placement.height+.01)return fallback();
      stored[key]={x:r.x*scaleX,y:r.y*scaleY,w:r.w*scaleX,h:r.h*scaleY};
      if(visible[key]!==false)boxes[key]=stored[key];
    }
    // Reject corrupt overlapping preferences instead of obscuring another tool.
    if(Object.entries(boxes).some(([key,r])=>!fits(r,boxes,key,width,height)))return fallback();
    return {boxes,stored,splits:[],width,height};
  }
  function remember(current,previous,tree){
    const {width,height}=current;
    const all=layout(tree,width,height).boxes;
    if(previous?.width>0&&previous?.height>0)for(const key of keys){const r=previous.boxes?.[key];if(r)all[key]={x:r.x*width/previous.width,y:r.y*height/previous.height,w:r.w*width/previous.width,h:r.h*height/previous.height};}
    return {width,height,boxes:{...all,...current.boxes}};
  }
  function proposal(box,delta,kind,boxes,key,width,height,snap=true,edge='se'){
    const r={...box};
    const guides=[];
    for(const axis of ['x','y']){
      const size=axis==='x'?'w':'h',limit=axis==='x'?width:height,leading=edge.includes(axis==='x'?'w':'n'),trailing=edge.includes(axis==='x'?'e':'s');
      if(kind!=='move'&&!leading&&!trailing)continue;
      const min=Math.min(size==='w'?240:key==='progress'?228:200,box[size]),far=box[axis]+box[size];
      // Leading-edge resizing changes the origin while anchoring the opposite edge.
      function adjust(d){
        if(kind==='move')r[axis]=clamp(r[axis]+d,0,limit-r[size]);
        else if(leading){r[axis]=clamp(r[axis]+d,0,far-min);r[size]=far-r[axis];}
        else r[size]=clamp(r[size]+d,min,limit-r[axis]);
      }
      adjust(delta[axis]);
      if(!snap)continue;
      const targets=[0,limit];for(const [k,b] of Object.entries(boxes))if(k!==key)targets.push(b[axis],b[axis]+b[size],b[axis]-8,b[axis]+b[size]+8);
      const movingEdges=kind==='move'?[r[axis],r[axis]+r[size]]:[leading?r[axis]:r[axis]+r[size]];
      let best=null;for(const t of targets)for(const position of movingEdges){const d=t-position;if(Math.abs(d)<=5&&(!best||Math.abs(d)<Math.abs(best.d)))best={d,t};}
      if(best){const before={...r};adjust(best.d);if(r[axis]!==before[axis]||r[size]!==before[size])guides.push({axis,position:best.t});}
    }
    return {box:r,valid:fits(r,boxes,key,width,height),guides};
  }
  function resizeProposal(box,delta,boxes,key,width,height,snap=true,edge='se'){
    const target=proposal(box,delta,'resize',boxes,key,width,height,snap,edge);
    if(target.valid||!fits(box,boxes,key,width,height))return target;
    let low=0,high=1,result={...box};
    for(let i=0;i<28;i++){
      const t=(low+high)/2,r=Object.fromEntries(['x','y','w','h'].map(field=>[field,box[field]+(target.box[field]-box[field])*t]));
      if(fits(r,boxes,key,width,height)){low=t;result=r;}else high=t;
    }
    return {box:result,valid:true,guides:[],clamped:true};
  }
  return {keys,defaults,sanitize,layout,setRatio,swap,boundary,overlaps,fits,firstSpace,addTool,freeLayout,remember,proposal,resizeProposal};
});
