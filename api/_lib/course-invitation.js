const fs=require('node:fs'),path=require('node:path');
const {enforceRateLimit}=require('./request-security');
const preview=require('./course-preview');
const view=require('../../shared/course-invite-view');
const template=fs.readFileSync(path.join(__dirname,'../../instalar.html'),'utf8');
const origin='https://estudiemos-app.vercel.app';
const documentPolicy=require('../../vercel.json').headers.find(rule=>rule.source==='/(.*)').headers.find(header=>header.key==='Content-Security-Policy').value;
module.exports=async function courseInvitation(req,res){
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({message:'Método no permitido.'});}
  const code=req.query?.courseInvitation;
  if(typeof code!=='string'||!/^[A-HJ-NP-Z2-9]{10}$/.test(code))return res.status(404).json({message:'Invitación no disponible.'});
  if(!await enforceRateLimit(req,res,{route:'course-invitation',limit:60,windowSeconds:60,distributed:false}))return;
  let model=null,status='',http=200,unavailable=false;
  try{model=await preview(code);}catch(error){unavailable=error.message==='INVALID_CODE';http=unavailable?404:503;status=unavailable?'La cátedra ya no está disponible o cambió su enlace.':'No pudimos cargar la invitación. Podés continuar en la app o volver a intentar.';}
  const url=origin+'/materia/'+code,title=model?model.title+' · Invitación en Estudiemos':'Invitación a una cátedra · Estudiemos';
  const description=model?'Sumate a '+model.title+'. '+(model.teacherName?'Compartida por '+model.teacherName+'. ':'')+'Fechas y materiales de tu cursada, en Estudiemos.':'Tu comisión, sus fechas y sus materiales. Sumate en Estudiemos.';
  const image=origin+'/assets/course-invite-preview.png',joinUrl=unavailable?origin+'/':origin+'/?unirme=1#materia='+code;
  // Reuse installation controls without shipping hidden product demos/media.
  const installTemplate=template.slice(0,template.indexOf('<main>')+6)+template.slice(template.indexOf('<section class="install-downloads"'));
  let html=installTemplate.replace('<title>Estudiemos | Tu estudio, conectado</title>','<title>'+view.esc(title)+'</title>')
    .replace(/((?:href|src)=")\.\//g,'$1/').replace('class="install-page"','class="install-page course-invitation-page"');
  const meta=(key,value)=>{html=html.replace(new RegExp('((?:name|property)="'+key+'" content=")[^"]*'),(_all,start)=>start+view.esc(value));};
  for(const key of ['description','og:description'])meta(key,description);
  meta('og:title',title);meta('og:url',url);meta('og:image',image);meta('og:image:alt','Invitación a una cátedra en Estudiemos');
  html=html.replace('href="'+origin+'/instalar.html"','href="'+url+'"').replace('<main>',`<main><section class="course-install-invitation" aria-labelledby="courseInviteTitle">${view.content(model,{code,joinUrl,status,unavailable})}</section><template data-course-preview="${view.esc(JSON.stringify({code,preview:model,status,unavailable}))}"></template>`)
    .replace('</head>','<meta name="robots" content="noindex, nofollow"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"></head>');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',documentPolicy);res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
  return res.status(http).send(req.method==='HEAD'?'':html);
};
