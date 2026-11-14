const page=await figma.getNodeByIdAsync('22:2');await figma.setCurrentPageAsync(page);
const base=await figma.getNodeByIdAsync('22:67');const frames=[];
const configs=[
['CHAT-02-briefing','Preparé tu campaña','Usaré únicamente LinkedIn, un máximo de 50 postulaciones, modalidad remota y salario desde US$ 1 000.','CampaignSummary','Autorizar y comenzar','BROW-01 · Sin sitio abierto'],
['CHAT-03-searching','Buscando ofertas en LinkedIn','Aplicaré primero tus condiciones obligatorias. Las ofertas con datos críticos ausentes quedarán pendientes.','ExecutionLog',null,'BROW-02 · Resultados de búsqueda'],
['CHAT-05-recorded-continue','Continuando con otra oportunidad','El resultado anterior se registró automáticamente. Estoy evaluando una nueva vacante.','ResultRow',null,'BROW-02 · Siguiente oportunidad'],
['CHAT-06-missing-fact','Necesito confirmar un dato','¿Tienes autorización laboral para Brasil? Puedes responder u omitir esta oferta. Seguiré con otras.','Intervention','Responder','BROW-04 · Requiere intervención'],
['CHAT-07-paused','Campaña pausada','Conservé el progreso. No iniciaré acciones nuevas hasta que decidas continuar.','CampaignSummary',null,'BROW-05 · Pausado'],
['CHAT-08-return-after-close','La campaña se pausó al cerrar Mirai','La última postulación quedó sin confirmar. Primero comprobaré su recepción cuando reanudes.','Intervention',null,'BROW-05 · Esperando reanudación'],
['CHAT-09-extension-error','No puedo comunicarme con la extensión','El trabajo se conservó. Revisa que la extensión esté habilitada y vuelve a conectar.','Intervention','Reconectar extensión','BROW-05 · Sin conexión'],
['CHAT-10-completed','Terminamos por ahora','38 confirmadas. 2 envíos sin confirmar, 6 descartadas y 4 pendientes. Puedes consultar todos los registros.','CompactReport','Ver registros','BROW-01 · Campaña finalizada'],
['CHAT-12-long-context','Retomando tu campaña Backend','Puedes expandir los pasos anteriores o volver al trabajo actual sin perder el contexto.','ExecutionLog','Volver al trabajo actual','BROW-02 · Trabajo actual']
];
for(let i=0;i<configs.length;i++){
const [name,title,detail,block,action,browserState]=configs[i];
const root=track(base.clone());page.appendChild(root);root.name=name;root.x=120+(i%3)*1760;root.y=120+(Math.floor(i/3)+1)*1080;frames.push({id:root.id,name});
const chat=root.findOne(n=>n.name==='Conversation'),messages=chat.findOne(n=>n.name==='Messages · scroll region');
for(const c of [...messages.children])c.remove();
await text(messages,'Mirai','Label');
await text(messages,title,'Title','text-primary',592);
await text(messages,detail,'Body','text-secondary',592);
const master=await figma.getNodeByIdAsync({'CampaignSummary':'21:133','ExecutionLog':'21:136','ResultRow':'21:145','Intervention':'21:139','CompactReport':'21:148'}[block]);inst(messages,master);
if(name.includes('briefing'))await text(messages,'Permisos de campaña\n✓ Postular en LinkedIn\n✓ Usar Backend Engineer · v3\n□ Comunicaciones por portal o correo (permiso reutilizable)','Body','text-secondary',592);
if(name.includes('missing'))await text(messages,'Sí, tengo autorización     ·     No     ·     Omitir esta oportunidad','Label','info',592);
if(name.includes('long')){await text(messages,'▸ 12 acciones anteriores\n\n✓ 2 recepciones verificadas\n? 1 recepción aún por comprobar','Body','text-secondary',592);}
if(action){const master=await figma.getNodeByIdAsync('21:36');const b=inst(messages,master);b.resize(240,40);b.setProperties({[Object.keys(master.componentPropertyDefinitions)[0]]:action});}
const composer=chat.children.find(n=>n.type==='INSTANCE'&&n.name.startsWith('Composer'));
if(composer){composer.swapComponent(await figma.getNodeByIdAsync(name.includes('paused')||name.includes('return')||name.includes('error')?'21:124':name.includes('completed')||name.includes('briefing')?'21:106':'21:115'));composer.resize(592,120);}
const browser=root.findOne(n=>n.name==='Linked browser');for(const c of [...browser.children])c.remove();
await text(browser,browserState,'Label','text-secondary',496);
const area=box(browser,'Observed site state',496,690,'VERTICAL','surface-2',24,24);radius(area,16);
if(name.includes('search')||name.includes('continue')||name.includes('long')){
await text(area,'Backend Engineer · Remoto','Title','text-primary',448);
for(const [company,salary] of [['Atlas Systems','US$ 1 500 / mes'],['Nova Labs','Salario por confirmar'],['Orbit Data','US$ 1 800 / mes']]){const item=box(area,'Vacante / '+company,448,128,'VERTICAL','surface-3',12,16);radius(item,12);await text(item,company,'Label');await text(item,'Backend Engineer · '+salary,'Body','text-secondary',416);}
}else{
area.primaryAxisAlignItems='CENTER';await text(area,name.includes('completed')?'Campaña completada':name.includes('error')?'Conecta la extensión':name.includes('missing')?'Intervención necesaria':'Esperando tu siguiente paso','Title','text-primary',448);await text(area,detail,'Body','text-secondary',448);
}
}
const operator=track((await figma.getNodeByIdAsync('22:147')).clone());page.appendChild(operator);operator.name='CHAT-11-operator-empty';operator.x=120;operator.y=4440;frames.push({id:operator.id,name:operator.name});
const om=operator.findOne(n=>n.name==='Messages · scroll region');for(const c of [...om.children])c.remove();await text(om,'¿Qué trabajo buscas?','Title','text-primary',432);await text(om,'Añade tu CV y una instrucción sencilla para empezar.','Body','text-secondary',432);
const ob=operator.findOne(n=>n.name==='Linked browser');for(const c of [...ob.children])c.remove();await text(ob,'Espacio de navegación','Label','text-muted');await text(ob,'Aquí verás el trabajo de Mirai','Title','text-secondary',816);
const oc=operator.findOne(n=>n.type==='INSTANCE'&&n.name.startsWith('Composer'));if(oc)oc.swapComponent(await figma.getNodeByIdAsync('21:106'));
return {createdNodeIds:[...new Set([...ids,...frames.flatMap(f=>{const n=page.children.find(x=>x.id===f.id);return n.findAll(()=>true).map(x=>x.id)})])],frames};
