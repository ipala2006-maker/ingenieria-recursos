const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const board=require('../shared/home-board'),code=fs.readFileSync(require.resolve('../scripts/home-boot.js'),'utf8');
function boot({mobile=false,release=true}={}){
  const classes=()=>{const set=new Set();return{add:key=>set.add(key),remove:key=>set.delete(key),contains:key=>set.has(key),toggle(key,on){on?set.add(key):set.delete(key);}};};
  const style={remove(){this.removed=true;}},root={classList:classes()},body={classList:classes(),dataset:{}};
  body.classList.add('workspace-home');
  const saved={visible:{focus:false,progress:false,workspace:false,calendar:true,inbox:true,classes:true},density:'compact'};
  const listeners=new Map(),window={EstudiemosHomeLayout:{read:()=>saved},EstudiemosHomeBoard:board};
  window.addEventListener=(name,handler)=>listeners.set(name,handler);
  window.removeEventListener=name=>listeners.delete(name);
  if(release)window.EstudiemosRelease=require('../shared/release');
  vm.runInNewContext(code,{window,document:{body,documentElement:root,createElement:()=>style,head:{appendChild(){}}},
    matchMedia:()=>({matches:mobile}),innerWidth:1440,innerHeight:900});
  return{window,root,body,style,listeners};
}

test('early geometry is bounded, filters unavailable tools and releases without persisting preferences',()=>{
  // No storage write, network API or timer is supplied to the first-render script.
  const {window,root,body,style,listeners}=boot();
  assert.equal(root.classList.contains('home-starting'),true);
  assert.equal(body.classList.contains('home-board'),true);
  assert.equal(body.dataset.homeDensity,'compact');
  assert.match(style.textContent,/data-home-space="assistant"\]\{display:none!important\}/);
  assert.match(style.textContent,/data-home-space="classes"\]\{display:flex!important;left:/);
  assert.match(style.textContent,/data-home-space="calendar"\]\{left:/);
  assert.equal(listeners.has('resize'),true);
  window.EstudiemosHomeBoot.release();
  assert.equal(style.removed,true);assert.equal(root.classList.contains('home-starting'),false);
  assert.equal(listeners.has('resize'),false);
});

test('mobile keeps its existing navigation, and a missing release helper fails closed for gated tools',()=>{
  const mobile=boot({mobile:true});
  assert.equal(mobile.body.classList.contains('home-board'),false);assert.equal(mobile.style.textContent,'');
  const fallback=boot({release:false});
  assert.match(fallback.style.textContent,/data-home-space="assistant"\]\{display:none!important\}/);
  assert.match(fallback.style.textContent,/data-home-space="workspace"\]\{display:none!important\}/);
});

test('critical first-render assets load before the body and the editor loads each shared helper once',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const file of ['shared/home-layout-storage.js','shared/home-board.js','styles/home-boot.css']){
    assert.equal(html.split(file).length,2);assert.ok(html.indexOf(file)<html.indexOf('</head>'));
  }
  assert.ok(html.indexOf('scripts/home-boot.js')<html.indexOf('<header class="topbar">'));
  assert.match(html,/<link rel="stylesheet" href="\.\/styles\/professional\.css/);
});
