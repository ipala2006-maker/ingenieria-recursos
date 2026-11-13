(function(){
  const q=selector=>document.querySelector(selector), mode=document.body.dataset.studyView;
  const rules=window.EstudiemosTimetableRules, views=window.EstudiemosStudyViews;
  const output=q('[data-report-results]'), status=q('[data-report-status]'), content=q('[data-report-content]');
  let shift=0,count=7,hasContent=false,lastIdentity=null;
  function stored(key,fallback){
    try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}
  }
  function node(tag,text,style){
    const child=document.createElement(tag);
    if(text!==undefined)child.textContent=text;
    if(style)child.className=style;
    return child;
  }
  function totals(values){
    q('[data-report-totals]').replaceChildren(...values.map(([label,value])=>{
      const div=node('div');div.append(node('dt',label),node('dd',value));return div;
    }));
  }
  function period(first,last){
    q('[data-report-period]').textContent=views.short.format(first)+' – '+views.short.format(last)+' '+last.getFullYear();
  }
  function renderWeek(owner,now){
    const dates=views.week(now,shift),keys=dates.map(rules.dateKey),classes=window.EstudiemosClassroomRules;
    const agenda=stored('bandeja_agenda',[]), cache=stored(classes.CACHE_KEY,null);
    const model=owner!=='guest'&&cache?.owner===owner&&Array.isArray(cache.model?.calendar)?cache.model:null;
    const hidden=new Set(Array.isArray(model?.calendarHidden)?model.calendarHidden:[]);
    const shared=model?classes.occurrences({calendar:model.calendar.filter(row=>!hidden.has(row?.classId))},keys[0],keys.at(-1)):[];
    const grouped=views.agenda(agenda,rules.read(localStorage),shared,dates);
    const all=[...grouped.values()].flat();
    const undated=Array.isArray(agenda)?agenda.filter(item=>item?.title&&!item.date&&!item.done).length:0;
    const box=q('[data-report-undated]');box.hidden=!undated;
    q('[data-report-undated-count]').textContent=undated+' '+(undated===1?'anotación pendiente':'anotaciones pendientes');
    period(dates[0],dates.at(-1));
    totals([['Actividades',all.length],['Horarios fijos',all.filter(item=>item.label==='Horario fijo').length],['De cátedras',shared.length]]);
    output.replaceChildren(...dates.map((date,i)=>{
      const cell=node('section'), heading=node('h2',views.names[date.getDay()]);
      const day=node('small',views.short.format(date));if(keys[i]===rules.dateKey(now))day.setAttribute('aria-current','date');
      heading.append(day);cell.append(heading);
      const list=node('ul');
      for(const item of grouped.get(keys[i])){
        const block=node('li',undefined,'study-event tone-'+item.color);
        const time=item.start?item.start+(item.end?'–'+item.end:''):'Sin horario';
        block.append(node('strong',item.title),node('span',time+' · '+item.label));list.append(block);
      }
      cell.append(list.children.length?list:node('p','Sin actividades'));
      return cell;
    }));
    return all.length>0;
  }
  function renderProgress(now){
    const state=stored('estudiemos_pomodoro_streak',{}),rows=views.progress(state,count,now);
    const total=rows.reduce((sum,row)=>sum+row.minutes,0), active=rows.filter(row=>row.minutes>0).length;
    const summary=window.EstudiemosStudyGoal.summary(state,now);
    period(rows[0].date,rows.at(-1).date);
    totals([['Tiempo registrado',views.duration(total)],['Días con estudio',active],['Racha',summary.currentStreak+' días']]);
    const list=node('ul',undefined,'study-bars'), max=Math.max(1,...rows.map(row=>row.minutes));
    for(const {date,minutes} of rows){
      const item=node('li'),label=views.short.format(date),meter=node('meter');
      meter.max=max;meter.value=minutes;meter.setAttribute('aria-hidden','true');
      item.append(node('span',label),meter,node('span',views.duration(minutes)));list.append(item);
    }
    output.replaceChildren(list);
    return active>0;
  }
  function render(){
    const owner=window.EstudiemosReportSession?.identity();
    if(owner!==lastIdentity){shift=0;count=7;lastIdentity=owner;}
    content.hidden=!owner;
    const now=new Date();
    hasContent=owner?mode==='week'?renderWeek(owner,now):renderProgress(now):false;
    if(!owner)output.replaceChildren();
    status.textContent=!owner?'Abrí Estudiemos para iniciar sesión o volver a sincronizar tus datos.':hasContent?'':mode==='week'?'No tenés actividades con fecha en esta semana.':'Todavía no hay tiempo de estudio registrado en este período.';
    for(const button of document.querySelectorAll('[data-report-range]'))button.setAttribute('aria-pressed',String(Number(button.dataset.reportRange)===count));
    window.dispatchEvent(new Event('estudiemos:report-updated'));
  }
  window.EstudiemosReport = Object.freeze({hasContent:()=>hasContent});
  document.addEventListener('click',event=>{
    const step=event.target.closest('[data-report-shift]'), range=event.target.closest('[data-report-range]');
    if(step)shift=Math.max(-104,Math.min(104,shift+Number(step.dataset.reportShift)));
    else if(range)count=Number(range.dataset.reportRange);
    else if(event.target.closest('[data-report-reset]'))shift=0;
    else return;
    render();
  });
  window.addEventListener('estudiemos:report-session-ready',render);
  window.addEventListener('pageshow',render);
  window.addEventListener('storage',event=>{
    const session=window.EstudiemosReportSession;
    if(event.key===null||[session?.ownerKey,session?.sessionKey,'bandeja_agenda','bandeja_horarios','estudiemos_pomodoro_streak',window.EstudiemosClassroomRules?.CACHE_KEY].includes(event.key))render();
  });
  try { if(localStorage.getItem('estudiemos_theme')==='light')document.documentElement.dataset.theme='light'; }catch(_){}
  if(window.EstudiemosReportSession)render();
})();
