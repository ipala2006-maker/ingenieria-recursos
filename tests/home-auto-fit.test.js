const test=require('node:test'),assert=require('node:assert/strict'),board=require('../shared/home-board');
function bounded(boxes,w,h){for(const [key,r] of Object.entries(boxes))assert.ok(board.fits(r,boxes,key,w,h),key+': '+JSON.stringify(r));}
test('a large remembered tool shrinks into an available gap without moving any neighbor',()=>{
  const boxes={calendar:{x:0,y:0,w:600,h:600},inbox:{x:608,y:0,w:392,h:300}};
  const original=structuredClone(boxes),result=board.addTool('classes',{x:0,y:0,w:1000,h:600},boxes,1000,600);
  assert.equal(result.mode,'space');assert.equal(result.boxes.classes.x,608);assert.equal(result.boxes.classes.y,308);
  assert.equal(result.boxes.classes.w,392);assert.equal(result.boxes.classes.h,292);
  assert.deepEqual(result.boxes.calendar,boxes.calendar);assert.deepEqual(result.boxes.inbox,boxes.inbox);assert.deepEqual(boxes,original);bounded(result.boxes,1000,600);
});
test('a full board splits only one usable neighbor and retains other positions',()=>{
  const boxes={calendar:{x:0,y:0,w:496,h:700},inbox:{x:504,y:0,w:496,h:700}};
  const result=board.addTool('focus',{x:0,y:0,w:400,h:300},boxes,1000,700);
  assert.equal(result.mode,'split');assert.equal(Object.keys(boxes).filter(key=>JSON.stringify(boxes[key])!==JSON.stringify(result.boxes[key])).length,1);bounded(result.boxes,1000,700);
});
test('when no panel can split, compact packing keeps every tool on screen',()=>{
  const boxes=Object.fromEntries(board.keys.slice(0,6).map((key,i)=>[key,{x:i%3*248,y:Math.floor(i/3)*228,w:240,h:220}]));
  const result=board.addTool('classes',{x:0,y:0,w:744,h:448},boxes,744,448);
  assert.equal(result.mode,'reflow');assert.equal(Object.keys(result.boxes).length,7);bounded(result.boxes,744,448);
});
test('varied tool insertion orders remain bounded through repeated hide and restore cycles',()=>{
  for(const [w,h] of [[1440,780],[1024,620],[744,450],[1000,300]])for(let turn=0;turn<30;turn++){
    const order=[...board.keys];let seed=turn+1,boxes={};
    for(let i=order.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];}
    for(const key of order){boxes=board.addTool(key,{x:0,y:0,w:w*.65,h:h*.7},boxes,w,h).boxes;bounded(boxes,w,h);}
    const hidden=order[turn%7],preferred=boxes[hidden];delete boxes[hidden];
    boxes=board.addTool(hidden,preferred,boxes,w,h).boxes;assert.equal(Object.keys(boxes).length,7);bounded(boxes,w,h);
  }
});
test('invalid preferred geometry uses safe defaults and an already present tool is not repositioned',()=>{
  const first=board.addTool('focus',{x:Infinity,y:NaN,w:-1,h:null},{},1000,700);bounded(first.boxes,1000,700);
  assert.deepEqual(board.addTool('focus',{},first.boxes,1000,700).boxes,first.boxes);
  assert.equal(board.addTool('foreign',{},first.boxes,1000,700),null);
});
test('resizing stops continuously at a neighbor rather than rejecting the whole drag',()=>{
  const box={x:0,y:0,w:300,h:240},boxes={focus:box,inbox:{x:400,y:0,w:400,h:500}};
  const result=board.resizeProposal(box,{x:400,y:0},boxes,'focus',1000,700,false,'e');
  assert.equal(result.valid,true);assert.equal(result.clamped,true);assert.ok(Math.abs(result.box.w-400)<.02);assert.equal(result.box.h,240);assert.equal(result.box.x,0);
  assert.deepEqual(boxes.focus,box);bounded({...boxes,focus:result.box},1000,700);
});
test('all edges clamp safely without changing the opposite anchor or jumping backwards',()=>{
  const box={x:100,y:100,w:400,h:300},boxes={focus:box,inbox:{x:510,y:0,w:250,h:600},calendar:{x:0,y:410,w:500,h:250}};
  for(const edge of ['n','e','s','w','nw','ne','sw','se'])for(const d of [-500,-20,0,20,500]){
    const result=board.resizeProposal(box,{x:d,y:d},boxes,'focus',1000,700,false,edge);
    assert.ok(result.valid);bounded({...boxes,focus:result.box},1000,700);
    if(edge.includes('n'))assert.ok(Math.abs(result.box.y+result.box.h-400)<.001);
    if(edge.includes('w'))assert.ok(Math.abs(result.box.x+result.box.w-500)<.001);
  }
});
