(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./timetable'));
  else root.EstudiemosStudyViews=factory(root.EstudiemosTimetableRules);
})(globalThis,function(rules){
  const days=[1,2,3,4,5,6,0];
  const names=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const example=Object.freeze([
    {id:'analysis',title:'Análisis Matemático',days:[1,3],start:'08:00',end:'10:00',place:'Clase',color:'blue'},
    {id:'review',title:'Repaso de ejercicios',days:[1],start:'16:00',end:'17:00',place:'Estudio',color:'amber'},
    {id:'physics',title:'Física I',days:[2,5],start:'10:00',end:'12:00',place:'Laboratorio',color:'teal'},
    {id:'programming',title:'Programación',days:[4],start:'14:00',end:'16:00',place:'Práctica',color:'violet'}
  ]);
  const short=new Intl.DateTimeFormat('es',{day:'numeric',month:'short'});
  function offset(date, n){
    const next=new Date(date);
    next.setHours(12,0,0,0);
    next.setDate(next.getDate()+n);
    return next;
  }
  function week(now,shift=0){
    const start=offset(now,-((now.getDay()+6)%7)+7*shift);
    return days.map((_,i)=>offset(start,i));
  }
  function duration(value){
    const n=Math.max(0,Math.round(value)||0);
    return n<60?n+' min':Math.floor(n/60)+' h'+(n%60?' '+n%60+' min':'');
  }
  function progress(state,count,now){
    const size=count===30?30:7;
    return Array.from({length:size},(_,i)=>{
      const date=offset(now,i-size+1);
      const minutes=state?.days?.[rules.dateKey(date)];
      return {date,minutes:typeof minutes==='number'&&Number.isFinite(minutes)?Math.min(1440,Math.max(0,minutes)):0};
    });
  }
  function agenda(items,schedules,courseRows,dates){
    const keys=dates.map(rules.dateKey);
    const grouped=new Map(keys.map(key=>[key,[]]));
    function add(item,kind){
      const rows=grouped.get(item?.date);
      if(!rows||typeof item.title!=='string'||!item.title.trim())return;
      rows.push({title:item.title.slice(0,120),start:rules.time(item.horaInicio)?item.horaInicio:'',end:rules.time(item.horaFin)?item.horaFin:'',
        color:rules.COLORS.includes(item.color)?item.color:kind==='course'?'teal':kind==='schedule'?'blue':'violet',
        label:kind==='course'?'Cátedra':kind==='schedule'?'Horario fijo':item.done?'Completada':'Anotación',done:item.done===true});
    }
    for(const item of Array.isArray(items)?items.slice(0,2000):[])add(item,'note');
    for(const item of rules.occurrences(schedules,keys[0],keys.at(-1)))add(item,'schedule');
    for(const item of courseRows)add(item,'course');
    for(const rows of grouped.values())rows.sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
    return grouped;
  }
  function ics(items,now=new Date(),uid=()=>globalThis.crypto.randomUUID()){
    const escape=value=>String(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').replace(/\\/g,'\\\\')
      .replace(/\r?\n/g,'\\n').replace(/([,;])/g,'\\$1');
    function fold(line){
      const output=[];let part='',length=0;
      const utf8=new TextEncoder();
      for(const ch of line){
        const size=utf8.encode(ch).length;
        if(length+size>75){output.push(part);part=' ';length=1;}
        part+=ch;length+=size;
      }
      return [...output,part].join('\r\n');
    }
    const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const dayCodes=['SU','MO','TU','WE','TH','FR','SA'];
    const calendar=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Estudiemos//Planificador semanal//ES','CALSCALE:GREGORIAN'];
    for(const item of rules.list(items)){
      const first=week(now).find(date=>item.days.includes(date.getDay()));
      const date=rules.dateKey(first).replace(/-/g,'');
      const value=t=>date+'T'+t.replace(':','')+'00';
      calendar.push('BEGIN:VEVENT','UID:'+uid()+'@estudiemos.ar','DTSTAMP:'+stamp,'DTSTART:'+value(item.start),'DTEND:'+value(item.end),
        'RRULE:FREQ=WEEKLY;BYDAY='+item.days.map(day=>dayCodes[day]).join(','),'SUMMARY:'+escape(item.title));
      if(item.place)calendar.push('LOCATION:'+escape(item.place));
      calendar.push('END:VEVENT');
    }
    return calendar.concat('END:VCALENDAR').map(fold).join('\r\n')+'\r\n';
  }
  return Object.freeze({days,names,example,short,offset,week,duration,progress,agenda,ics});
});
