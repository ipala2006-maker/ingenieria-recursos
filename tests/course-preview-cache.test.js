const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../api/_lib/course-preview'),'utf8');
test('a shared invite burst coalesces database reads and expires without caching private member data',async()=>{
  let now=0,calls=0,fail=false;
  const request=async()=>{calls++;if(fail)throw Error('Unavailable');return{title:'Algebra',teacherName:'Docente',calendar:[]};};
  const context={Map,Date:{now:()=>now},module:{exports:{}},require:name=>name==='./supabase-admin'?{adminRequest:request}:require('../shared/classrooms')};
  vm.runInNewContext(source,context);const preview=context.module.exports;
  await Promise.all(Array.from({length:400},()=>preview('ABCDEFGHJK')));assert.equal(calls,1);
  now=10001;await preview('ABCDEFGHJK');assert.equal(calls,2);
  now=20002;fail=true;await assert.rejects(preview('ABCDEFGHJK'));await assert.rejects(preview('ABCDEFGHJK'));assert.equal(calls,4);
  fail=false;await preview('ABCDEFGHJK');assert.equal(calls,5);
});
