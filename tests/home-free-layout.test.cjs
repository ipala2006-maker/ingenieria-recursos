const test=require('node:test'),assert=require('node:assert/strict'),board=require('../shared/home-board');
const tree=board.defaults();
function initial(width=1400,height=720,visible={}){return board.freeLayout(null,tree,width,height,visible);}
test('migration retains the old visible layout, then hiding a tool leaves an empty space',()=>{
  const start=initial(),saved=board.remember(start,null,tree),hidden=board.freeLayout(saved,tree,1400,720,{progress:false});
  assert.equal(hidden.boxes.progress,undefined);
  for(const [key,r] of Object.entries(hidden.boxes))assert.deepEqual(r,start.boxes[key]);
  assert.deepEqual(board.freeLayout(saved,tree,1400,720).boxes,start.boxes);
});
test('independent resizing does not stretch neighbors and a free position persists',()=>{
  const start=initial(),saved=board.remember(start,null,tree),old=structuredClone(start.boxes);
  const shrink=board.proposal(old.focus,{x:-120,y:-90},'resize',old,'focus',1400,720,false);
  assert.ok(shrink.valid);saved.boxes.focus=shrink.box;
  const small=board.freeLayout(saved,tree,1400,720);
  assert.deepEqual(small.boxes.progress,old.progress);
  const move=board.proposal(small.boxes.focus,{x:60,y:40},'move',small.boxes,'focus',1400,720,false);
  assert.ok(move.valid);saved.boxes.focus=move.box;
  const reloaded=board.freeLayout(JSON.parse(JSON.stringify(saved)),tree,1400,720);
  assert.deepEqual(reloaded.boxes.focus,move.box);assert.equal(move.box.x,60);assert.equal(move.box.y,40);
});
test('moving over an occupied tool is invalid; positions stay inside the screen',()=>{
  const l=initial();
  assert.equal(board.proposal(l.boxes.focus,{x:470,y:0},'move',l.boxes,'focus',1400,720).valid,false);
  const r=board.proposal(l.boxes.focus,{x:-500,y:-500},'move',l.boxes,'focus',1400,720,false);
  assert.ok(r.valid);assert.equal(r.box.x,0);assert.equal(r.box.y,0);
  const far=board.proposal(l.boxes.inbox,{x:1e6,y:1e6},'move',l.boxes,'inbox',1400,720,false).box;
  assert.ok(far.x+far.w<=1400.01&&far.y+far.h<=720.01);
});
test('pixel movement can align softly, or avoid snapping for precision',()=>{
  const boxes={focus:{x:30,y:30,w:240,h:200},inbox:{x:400,y:300,w:240,h:200}};
  assert.equal(board.proposal(boxes.focus,{x:371,y:0},'move',boxes,'focus',1000,700).box.x,400);
  assert.equal(board.proposal(boxes.focus,{x:371,y:0},'move',boxes,'focus',1000,700,false).box.x,401);
});
test('restoring hidden tools finds a vacant slot without displacing neighbors',()=>{
  const l=initial(),r=l.boxes.progress,visible={...l.boxes};delete visible.progress;
  assert.deepEqual(board.firstSpace(r,visible,'progress',1400,720),r);
  assert.equal(board.firstSpace(l.boxes.focus,l.boxes,'new',1400,720),null);
  assert.deepEqual(visible.focus,l.boxes.focus);
});
test('resize to other desktop viewports preserves proportional gaps and non-overlap',()=>{
  const l=initial(),saved=board.remember(l,null,tree);saved.boxes.focus={x:25,y:20,w:300,h:250};
  for(const [w,h] of [[1000,470],[744,900],[1920,980],[1400,720]]){
    const resized=board.freeLayout(saved,tree,w,h);
    for(const [k,r] of Object.entries(resized.boxes))assert.ok(board.fits(r,resized.boxes,k,w,h));
    assert.ok(Math.abs(resized.boxes.focus.x-25*w/1400)<.001);
  }
});
test('malformed positions are rejected instead of hiding or overlapping tools',()=>{
  for(const bad of [null,{width:0,height:720,boxes:{}},{width:1400,height:720,boxes:{focus:{x:Infinity,y:0,w:3,h:4}}}])assert.deepEqual(board.freeLayout(bad,tree,1400,720).boxes,initial().boxes);
  const bad=board.remember(initial(),null,tree);bad.boxes.progress={...bad.boxes.focus};
  assert.deepEqual(board.freeLayout(bad,tree,1400,720).boxes,initial().boxes);
});
test('all tool visibility combinations preserve holes with free positioning',()=>{
  const l=initial(),saved=board.remember(l,null,tree);
  for(let mask=0;mask<64;mask++){
    const visible=Object.fromEntries(board.keys.map((k,i)=>[k,!!(mask&(1<<i))]));
    const next=board.freeLayout(saved,tree,1400,720,visible);
    for(const [k,r] of Object.entries(next.boxes))assert.deepEqual(r,l.boxes[k]);
    assert.equal(Object.keys(next.boxes).length,Object.values(visible).filter(Boolean).length);
  }
});
test('all four edges and corners resize while anchoring the opposite sides',()=>{
  const box={x:100,y:100,w:400,h:300},boxes={focus:box};
  for(const edge of ['n','e','s','w','nw','ne','sw','se']){
    const {box:r,valid}=board.proposal(box,{x:30,y:20},'resize',boxes,'focus',1000,800,false,edge);
    assert.ok(valid,edge);
    assert.equal(r.x,edge.includes('w')?130:100,edge);
    assert.equal(r.y,edge.includes('n')?120:100,edge);
    assert.equal(r.w,edge.includes('w')?370:edge.includes('e')?430:400,edge);
    assert.equal(r.h,edge.includes('n')?280:edge.includes('s')?320:300,edge);
  }
});
test('leading edges clamp to viewport and minimum size without moving the far edge',()=>{
  const box={x:100,y:100,w:400,h:300};
  for(const delta of [-10000,-60,0,90,10000])for(const edge of ['n','e','s','w','nw','ne','sw','se']){
    const {box:r,valid}=board.proposal(box,{x:delta,y:delta},'resize',{focus:box},'focus',1000,800,false,edge);
    assert.ok(valid);assert.ok(r.w>=240&&r.h>=200);
    if(edge.includes('w'))assert.equal(r.x+r.w,500);
    if(edge.includes('n'))assert.equal(r.y+r.h,400);
  }
});
test('edge snapping cannot move an inactive axis or obscure another tool',()=>{
  const box={x:100,y:100,w:400,h:300},boxes={focus:box,inbox:{x:0,y:450,w:500,h:250}};
  const r=board.proposal(box,{x:-98,y:99},'resize',boxes,'focus',1000,800,true,'w');
  assert.equal(r.box.x,0);assert.equal(r.box.x+r.box.w,500);assert.equal(r.box.y,100);assert.equal(r.box.h,300);
  assert.equal(board.proposal(box,{x:0,y:80},'resize',boxes,'focus',1000,800,false,'s').valid,false);
});
