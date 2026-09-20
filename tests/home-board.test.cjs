const test=require('node:test'),assert=require('node:assert/strict'),board=require('../shared/home-board');
function bounded(layout,w,h){const boxes=Object.values(layout.boxes);for(const [i,a] of boxes.entries()){assert.ok(a.x>=0&&a.y>=0&&a.w>0&&a.h>0&&a.x+a.w<=w+.001&&a.y+a.h<=h+.001);for(const b of boxes.slice(i+1))assert.ok(a.x+a.w<=b.x+.001||b.x+b.w<=a.x+.001||a.y+a.h<=b.y+.001||b.y+b.h<=a.y+.001);}}
test('all visibility combinations fit the board without overlaps or discarded tools',()=>{
  for(const [w,h] of [[1896,950],[1342,620],[1000,470],[744,900]])for(let mask=0;mask<64;mask++){
    const visible=Object.fromEntries(board.keys.map((k,i)=>[k,!!(mask&(1<<i))]));const r=board.layout(board.defaults(),w,h,visible);bounded(r,w,h);assert.equal(Object.keys(r.boxes).length,Object.values(visible).filter(Boolean).length);
  }
});
test('continuous resize, swapping and malicious saved preferences remain bounded',()=>{
  assert.deepEqual(board.sanitize({axis:'z',a:'focus'}),board.defaults());
  const tree=board.defaults();let r=board.layout(tree,1400,750),s=board.boundary(r.splits,'focus','x'),old=r.boxes.focus.w;
  board.setRatio(tree,s.path,s.ratio+3/s.available);r=board.layout(tree,1400,750);assert.ok(Math.abs(r.boxes.focus.w-old-3)<.001,'three-pixel resize does not snap to grid');
  for(let i=0;i<100;i++){for(const s of r.splits)board.setRatio(tree,s.path,(i%7)/6);r=board.layout(tree,1400,750);bounded(r,1400,750);}
  const swapped=board.layout(board.swap(tree,'focus','inbox'),1400,750);assert.deepEqual(swapped.boxes.inbox,r.boxes.focus);
});
