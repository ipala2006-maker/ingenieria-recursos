(function(){
  const rules=window.EstudiemosTimetableRules, views=window.EstudiemosStudyViews;
  const key='estudiemos_public_week_v1';
  const q=selector=>document.querySelector(selector);
  const grid=q('[data-planner-grid]'), editor=q('[data-planner-editor]'), form=q('[data-planner-form]');
  const error=q('[data-planner-error]'), status=q('[data-planner-status]');
  let draft=null, editing='', example=true;
  try{
    const saved=localStorage.getItem(key);
    if(saved!==null){draft=rules.list(JSON.parse(saved));example=false;}
    if(localStorage.getItem('estudiemos_theme')==='light')document.documentElement.dataset.theme='light';
  }catch(_){}
  function element(tag,text,style){
    const node=document.createElement(tag);
    if(text)node.textContent=text;
    if(style)node.className=style;
    return node;
  }
  function save(){
    try{localStorage.setItem(key,JSON.stringify(draft));return true;}catch(_){return false;}
  }
  function render(message=''){
    const items=example?views.example:draft;
    q('[data-planner-mode]').textContent=example?'Semana de ejemplo':'Mi horario';
    q('[data-planner-start]').hidden=!example;
    q('[data-planner-start]').textContent=draft?'Volver a mi semana':'Usar este ejemplo';
    q('[data-planner-blank]').hidden=!example||draft!==null;
    q('[data-planner-example]').hidden=example;
    q('[data-planner-export]').hidden=example||!items.length;
    status.textContent=message||(example?'Ejemplo ficticio de una cursada de ingeniería.':'Tu horario se guarda en este navegador.');
    grid.replaceChildren(...views.days.map(day=>{
      const cell=element('section'), list=element('ul');
      cell.append(element('h2',views.names[day]));
      for(const item of rules.forDay(items,day)){
        const entry=element('li');
        const block=element(example?'div':'button','','study-event tone-'+item.color);
        if(!example){
          block.type='button';block.dataset.plannerItem=item.id;block.dataset.day=String(day);
          block.setAttribute('aria-label','Editar '+item.title+' · '+views.names[day]+' '+item.start);
        }
        block.append(element('strong',item.title),element('span',item.start+'–'+item.end+(item.place?' · '+item.place:'')));
        entry.append(block);list.append(entry);
      }
      cell.append(list.children.length?list:element('p','Sin horarios'));
      return cell;
    }));
  }
  function personal(copy=false){
    if(!draft)draft=copy?rules.list(views.example):[];
    example=false;
    render(save()?'':'No se pudo guardar en este navegador. Podés exportar el horario antes de salir.');
  }
  function open(item,day=1,copy=false){
    editing=copy?'':item?.id||'';
    error.textContent='';
    form.reset();
    q('#planner-editor-title').textContent=editing?'Editar horario':'Agregar horario';
    q('[data-planner-remove]').hidden=!editing;
    for(const input of form.querySelectorAll('[name="day"]'))input.checked=(item?.days||[day]).includes(Number(input.value));
    if(item){
      for(const field of ['title','start','end','place','color'])form.elements[field].value=item[field];
    }
    editor.showModal();
    form.elements.title.focus();
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(form);
    const next=rules.normalize({id:editing||crypto.randomUUID(),title:data.get('title'),days:data.getAll('day').map(Number),
      start:data.get('start'),end:data.get('end'),place:data.get('place'),color:data.get('color')});
    if(!next){error.textContent='Elegí al menos un día y una hora de fin posterior al inicio.';return;}
    if(!editing&&(draft?.length||0)>=rules.MAX_ITEMS){error.textContent='Tu semana admite hasta '+rules.MAX_ITEMS+' horarios.';return;}
    const current=draft||[];
    const overlaps=rules.overlaps(current,next);
    draft=rules.list([...current.filter(item=>item.id!==editing),next]);
    example=false;
    editor.close();
    const saved=save();
    render(!saved?'No se pudo guardar en este navegador. Podés exportar el horario antes de salir.':overlaps.length?'Guardado. Se superpone con '+overlaps.map(item=>item.title).join(', ')+'.':'Horario guardado.');
    q('[data-planner-add]').focus();
  });
  q('[data-planner-add]').addEventListener('click',()=>open());
  q('[data-planner-course]').addEventListener('click',()=>open(views.example[2],2,true));
  q('[data-planner-close]').addEventListener('click',()=>editor.close());
  q('[data-planner-start]').addEventListener('click',()=>{personal(true);q('[data-planner-add]').focus();});
  q('[data-planner-blank]').addEventListener('click',()=>{personal();q('[data-planner-add]').focus();});
  q('[data-planner-example]').addEventListener('click',()=>{example=true;render();q('[data-planner-start]').focus();});
  q('[data-planner-remove]').addEventListener('click',()=>{
    if(!editing||!draft)return;
    draft=draft.filter(item=>item.id!==editing);editor.close();
    render(save()?'Horario quitado.':'No se pudo guardar el cambio en este navegador.');
    q('[data-planner-add]').focus();
  });
  q('[data-planner-export]').addEventListener('click',()=>{
    if(example||!draft?.length)return;
    const url=URL.createObjectURL(new Blob([views.ics(draft)],{type:'text/calendar;charset=utf-8'}));
    const link=element('a');link.href=url;link.download='estudiemos-semana.ics';document.body.append(link);
    link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    status.textContent='Exportamos tu semana como un calendario de horarios recurrentes.';
  });
  grid.addEventListener('click',event=>{
    const entry=event.target.closest('[data-planner-item]');
    const item=entry&&draft?.find(row=>row.id===entry.dataset.plannerItem);
    if(item)open(item,Number(entry.dataset.day));
  });
  q('[data-planner-add]').hidden=false;
  q('[data-planner-course]').hidden=false;
  q('[data-planner-tools]').hidden=false;
  render();
})();
