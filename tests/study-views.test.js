const test = require('node:test');
const assert = require('node:assert/strict');
const views = require('../shared/study-views');
const timetable = require('../shared/timetable');

test('planner uses the existing timetable rules and exports a local recurring calendar',()=>{
  const now=new Date(2026,10,13,11,30);
  const dates=views.week(now).map(timetable.dateKey);
  assert.deepEqual(dates,['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
  const item={...views.example[0],id:'custom',title:'Álgebra, Física; Práctica\r\nATTENDEE:otra'+ 'á'.repeat(70)};
  assert.equal(timetable.overlaps(views.example,item)[0].id,'analysis');
  const calendar=views.ics([item],now,()=> 'fixture');
  assert.match(calendar,/DTSTART:20261109T080000\r\nDTEND:20261109T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE/);
  assert.match(calendar,/SUMMARY:Álgebra\\, Física\\; Práctica\\nATTENDEE:/);
  assert.doesNotMatch(calendar,/\r\nATTENDEE:/);
  assert.ok(calendar.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
});

test('agenda projection combines existing data without retaining notes, links or contact fields',()=>{
  const dates=views.week(new Date(2026,10,13));
  const input={title:'Parcial',date:'2026-11-09',done:true,horaInicio:'11:00',note:'Privado',email:'private@example.test'};
  const data=views.agenda([input,{title:'Sin fecha'}],views.example,[{...input,title:'Compartida',horaInicio:'12:00'}],dates);
  assert.deepEqual(data.get(input.date).map(({title,label})=>[title,label]),[
    ['Análisis Matemático','Horario fijo'],['Parcial','Completada'],['Compartida','Cátedra'],['Repaso de ejercicios','Horario fijo']
  ]);
  assert.doesNotMatch(JSON.stringify([...data]),/Privado|private@example/);
  assert.equal(input.note,'Privado');
});

test('reports read only the requested dates and reject invalid stored minute values',()=>{
  const now=new Date(2026,10,13);
  const rows=views.progress({days:{'2026-11-11':-8,'2026-11-12':'100','2026-11-13':65}},7,now);
  assert.equal(rows.length,7);
  assert.deepEqual(rows.slice(-3).map(row=>row.minutes),[0,0,65]);
  assert.equal(views.duration(rows.at(-1).minutes),'1 h 5 min');
});
