import { MIN_TEAMS, createRoom, join, start, submit, tick, advance, scores } from './engine.js';
import { config } from './config.js';
import { GoogleTransport } from './google-transport.js';
const app = document.querySelector('#app');
const googleBackend = !!config.appsScriptUrl;
let transport, polling = false, lastPoll = 0, actionVersion = 0;
const storage = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k,v) => { try { sessionStorage.setItem(k,v); } catch {} }, remove: k => { try { sessionStorage.removeItem(k); } catch {} } };
let room, role, teamId, token, demo = false, available = false, selection = null, screenKey = '', busy = false, draft = {}, networkFailed = false, draftTimer;
const esc = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const team = id => room.teams.find(t => t.id === id);
const names = { lobby:'Sala de espera', villain:'Crear al villano', heroes:'Crear a los héroes', voting:'La batalla final', results:'El gran resultado' };
const icons = ['🦇','👻','🎃','⚡','🕷️','🌙','🧪','💀'];
const icon = id => icons[Math.max(0,room.teams.findIndex(t=>t.id===id))%icons.length];
function toast(message) { const el = document.querySelector('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),5000); }
async function api(path,body) {
  if(googleBackend) return transport.request(path,body || {},token || '');
  const res = await fetch(`./api/${path}`, { method:body?'POST':'GET', headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}, ...(body?{body:JSON.stringify(body)}:{}) });
  const data = await res.json(); if (!res.ok) throw Error(data.error || 'No se pudo conectar.'); return data;
}
function adopt(data) { room=data.room; role=data.role; teamId=data.teamId; if(data.token) {token=data.token; storage.set(googleBackend?'imposibles-google-session':'imposibles-session',token);} }
function header() { return `<header class="topbar"><a class="brand" href="./"><span class="brand-icon">✦</span> IMPOSIBLES<span class="brand-dot">!</span></a><span class="edition">ACTIVIDAD 03 <i></i> EDICIÓN HALLOWEEN</span><button class="quiet" data-action="home">${room?'Salir':'Cómo jugar'} <span>↗</span></button></header>`; }
function steps() { const current=['villain','heroes','voting','results'].indexOf(room.phase); return `<nav class="steps" aria-label="Rondas">${['Villanos','Héroes','Votación','Resultados'].map((s,i)=>`<span class="${current===i?'active':current>i?'passed':''}"><b>${current>i?'✓':`0${i+1}`}</b> ${s}</span>`).join('')}</nav>`; }
function landing() {
  document.body.classList.remove('voting-view');
  app.innerHTML=`${header()}<main class="landing"><section class="intro"><div class="eyebrow"><span></span> PROACTIVIDAD · UN JUEGO DE CREATIVIDAD EN EQUIPO</div><h1>Problemas<br><span>imposibles.</span></h1><p class="lead">El caos tiene un nuevo enemigo.<br><strong>Tu equipo.</strong></p><p class="description">No esperamos que aparezca la solución: damos el primer paso para crearla. Inventen el peor problema y conviertan la iniciativa en su superpoder.</p><div class="mini-tags"><span>🦇 Villanos terribles</span><span>⚡ Héroes inesperados</span><span>🏆 Soluciones proactivas</span></div><div class="poster" aria-hidden="true"><div class="moon"></div><span class="bat bat-one">🦇</span><span class="bat bat-two">🦇</span><div class="poster-text">QUE EMPIECE<br><strong>EL CAOS!</strong></div><div class="ghost">👻</div><span class="burst">¡BOOM!</span><div class="poster-caption">TODO GRAN HÉROE NECESITA UN GRAN PROBLEMA.</div></div></section><aside class="join-panel"><div class="ticket">TU MISIÓN EMPIEZA AQUÍ</div><h2>Reúne a tu escuadrón.</h2><p>Un dispositivo por equipo. Muchas ideas por cabeza.</p><form id="join-form"><label>Nombre del equipo<input name="name" maxlength="32" placeholder="Ej. Los Cazacaos" required autocomplete="off"></label><button class="button orange" ${available?'':'disabled'}>Entrar con mi equipo <span>→</span></button></form><div class="divider"><span>¿DIRIGES LA ACTIVIDAD?</span></div><button class="button outline" data-action="admin" ${available?'':'disabled'}>Administrar actividad <span>✦</span></button><button class="demo-link" data-action="demo">Explorar demo con 4 equipos →</button><p class="connection-note">${available?(googleBackend?'● Google Sheets conectado':'● Servidor local conectado · datos temporales'):(googleBackend?'Google no disponible · revisa la configuración del tutorial':'Modo estático · explora la demo o configura el servidor')}</p></aside><section class="how" id="how"><div><small>EL GUION DE LA BATALLA</small><h2>Tres rondas.<br>Una imaginación sin límites.</h2></div><article><b>01 <span>🦇</span></b><h3>Desata el caos</h3><p>Crea un villano con un problema imposible.</p><small>4 MINUTOS</small></article><article><b>02 <span>⚡</span></b><h3>Inventa la solución</h3><p>Un héroe para cada villano de los otros equipos.</p><small>4 MIN / HÉROE</small></article><article><b>03 <span>🏆</span></b><h3>Elige a las leyendas</h3><p>Vota la solución más proactiva y al villano más memorable.</p><small>3 MIN / VOTO</small></article></section></main>${googleBackend?'<dialog id="admin-dialog"><form id="admin-form"><h2>Administrar actividad</h2><p class="muted">Usa la contraseña del facilitador configurada en Apps Script.</p><label>Contraseña de administrador<input type="password" name="password" required autocomplete="current-password"></label><button class="button orange">Entrar como administrador →</button><button type="button" class="quiet" data-action="close-admin">Cancelar</button></form></dialog>':''}<footer>La diferencia está en quién decide crear la solución. <span>PROACTIVIDAD · EQUIPO · ACCIÓN</span></footer>`;
}
function card(entry, kind, author, selectable=false) {
  const id=entry.id || author;
  return `<${selectable?'button':'article'} ${selectable?`type="button" data-choice="${esc(id)}" aria-pressed="${selection===id}"`:''} class="character-card ${kind} ${selection===id?'selected':''}"><div class="card-top"><span>${kind==='villain'?'VILLANO':'HÉROE'}</span><span>${kind==='villain'?'🦇':'⚡'}</span></div><h3>${esc(entry.name)}</h3><div class="author">${esc(team(author)?.name || '')}</div><dl><dt>${kind==='villain'?'Poder especial':'Superpoder'}</dt><dd>${esc(entry.power)}</dd><dt>${kind==='villain'?'Daño que genera':'Plan de acción'}</dt><dd>${esc(kind==='villain'?entry.damage:entry.plan)}</dd></dl>${entry.incomplete?'<span class="incomplete">Respuesta incompleta por tiempo</span>':''}${selectable?`<div class="card-select">${selection===id?'✓ SELECCIONADO':'○ ELEGIR ESTA TARJETA'}</div>`:''}${entry.votes!==undefined?`<div class="vote-count">${entry.votes} ${entry.votes===1?'voto':'votos'}</div>`:''}</${selectable?'button':'article'}>`;
}
function timer(t) { return `<div class="timer" aria-label="Tiempo restante"><span>TIEMPO RESTANTE</span><b id="clock" data-deadline="${t.deadline}">04:00</b><div class="time-track"><i id="time-bar"></i></div></div>`; }
function render() {
  if(!room) return landing();
  document.body.classList.toggle('voting-view',room.phase==='voting'&&role==='team');
  const t=team(teamId); const key=`${room.phase}:${teamId}:${t?.index}:${t?.done}`;
  if (key!==screenKey) {draft={...(t?.pending || {})};selection=t?.pending?.choice || null;screenKey=key;}
  app.innerHTML=`${header()}<main class="game">${demo?`<div class="demo-toolbar"><span>DEMO LOCAL · Cambia de vista para jugar con cada equipo</span><label>Vista <select id="demo-view"><option value="admin" ${role==='admin'?'selected':''}>Administrador</option>${room.teams.map(t=>`<option value="${t.id}" ${teamId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="quiet" data-action="sample">${room.phase==='lobby'?'Preparar ejemplos':'Completar ronda con ejemplos'} ↗</button></div>`:''}<div class="game-meta"><span>ACTIVIDAD <strong>PROACTIVIDAD</strong></span><span>${role==='admin'?'🎬 Administrador':`${icon(teamId)} ${esc(t?.name)}`}</span><span id="connection" class="live">● ${demo?'Demo en este navegador':'En vivo'}</span></div>${steps()}<div id="game-content">${room.phase==='results'?results():role==='admin'?admin():room.phase==='lobby'?lobbyTeam():t.done?waiting():activity(t)}</div></main><footer>Problemas imposibles <span>EL SUPERPODER ES TOMAR LA INICIATIVA.</span></footer>`;
  updateClock();
  equalizePodium();
}
function lobbyTeam() {return `<section class="waiting"><div class="big-emoji">${icon(teamId)}</div><div class="eyebrow">TU EQUIPO YA ESTÁ DENTRO</div><h1>Preparados para<br><em>lo imposible.</em></h1><p>El administrador iniciará la batalla cuando todos estén aquí.</p>${teamList()}<p class="muted">Se necesitan al menos ${MIN_TEAMS} equipos.</p></section>`;}
function teamList() { return `<div class="team-grid">${room.teams.map(t=>`<div class="team-chip"><span>${icon(t.id)}</span><b>${esc(t.name)}</b>${room.phase!=='lobby'?`<small>${t.done?'✓ Listo':room.phase==='villain'?'Creando villano':`${t.index+1} / ${t.queue.length}`}</small>`:''}</div>`).join('') || '<p class="muted">Aún no hay equipos. Comparte el enlace para que se unan.</p>'}</div>`; }
function admin() {
  const lobby=room.phase==='lobby';
  return `<section class="admin-panel"><div class="eyebrow">CENTRO DE MANDO</div><h1>${lobby?'Que se reúna<br><em>el escuadrón.</em>':names[room.phase]}</h1><p>${lobby?'Comparte el enlace de esta página. Cada equipo entra con su nombre desde su dispositivo.':'Los equipos avanzan por sus propias pantallas. La siguiente ronda empieza cuando todos finalizan.'}</p>${lobby?`<div class="access-block"><small>UNA SOLA SALA · SIN CÓDIGOS</small><p>Todos los equipos participan en la misma actividad.</p><button class="button outline" data-action="copy">Copiar enlace de acceso ↗</button></div>`:`<div class="admin-stats"><b>${room.teams.filter(t=>t.done).length} / ${room.teams.length}</b><span>equipos finalizaron la ronda</span></div>`}${teamList()}<button class="button orange" data-action="${lobby?'start':'advance'}" ${lobby&&room.teams.length<MIN_TEAMS?'disabled':''}>${lobby?'Iniciar el juego':'Finalizar ronda para todos'} →</button>${lobby?`<p class="muted">Mínimo ${MIN_TEAMS} equipos · máximo 20 · ${googleBackend?'respuestas en Google Sheets':'respuestas en memoria'}</p>`:'<p class="muted">Finalizar ahora envía respuestas pendientes como incompletas y votos pendientes como abstenciones.</p>'}</section>`;
}
function waiting() { return `<section class="waiting"><div class="big-emoji">✦</div><div class="eyebrow">MISIÓN COMPLETADA</div><h1>Tu equipo ya<br><em>hizo su magia.</em></h1><p>Esperando a los demás equipos para empezar la siguiente ronda.</p>${teamList()}</section>`; }
function activity(t) {
  if(room.phase==='voting') return voting(t);
  const villain=room.phase==='villain'; const opponent=team(t.queue[t.index]);
  return `<div class="round-heading"><div><div class="eyebrow">RONDA ${villain?'01 · DESATA EL CAOS':`02 · HÉROE ${t.index+1} DE ${t.queue.length}`}</div><h1>${villain?'Crea el peor<br><em>problema posible.</em>':'El caos necesita<br><em>un héroe.</em>'}</h1><p>${villain?'Dale un rostro al problema. Cuanto más creativo, mejor.':`Tu misión: tomar la iniciativa para derrotar al villano de ${esc(opponent.name)}.`}</p></div>${timer(t)}</div><div class="creation-layout"><aside>${villain?`<div class="inspiration"><div class="eyebrow">🧪 LABORATORIO DE IDEAS</div><h2>¿Y si todo sale mal?</h2><p>Piensa en un problema cotidiano… y llévalo al extremo.</p><ul><li>El cliente necesita algo urgente y nadie sabe quién responde.</li><li>Una herramienta deja de funcionar.</li><li>Un proyecto pierde información importante.</li><li>Una entrega tiene un cambio inesperado.</li></ul><div class="comic-note">¡DALE UN GIRO IMPOSIBLE!</div></div>`:card(opponent.villain,'villain',opponent.id)}</aside><form id="creation-form" class="creation-form"><div class="form-title"><span>${villain?'🦇':'⚡'}</span><div><small>FICHA DE ${villain?'VILLANO':'HÉROE'}</small><h2>${villain?'El origen del caos':'La solución tiene nombre'}</h2></div></div><label>Nombre ${villain?'del villano':'del héroe'}<input name="name" maxlength="60" placeholder="${villain?'Ej. Doctor Sinrespuesta':'Ej. Capitana Claridad'}" value="${esc(draft.name||'')}" required></label><label>${villain?'Poder especial':'Superpoder'}<textarea name="power" maxlength="1200" rows="3" placeholder="${villain?'¿Qué puede hacer para complicarlo todo?':'¿Qué habilidad transforma este problema?'}" required>${esc(draft.power||'')}</textarea></label><label>${villain?'Daño que genera':'Plan de acción'}<textarea name="${villain?'damage':'plan'}" maxlength="1200" rows="4" placeholder="${villain?'¿Qué pasa cuando el villano entra en acción?':'¿Qué hacemos primero? ¿Quién toma la iniciativa? ¿Cómo evitamos que el problema vuelva?'}" required>${esc(draft[villain?'damage':'plan']||'')}</textarea></label>${villain?'':'<p class="plan-guide">⚡ Un plan proactivo empieza con una acción realizable en la empresa, alguien que tome la iniciativa y una forma de prevenir el problema.</p>'}<p class="muted">Al terminar el tiempo se envía lo escrito; los campos vacíos se marcan como incompletos.</p><button class="button ${villain?'orange':'lime'}">Finalizar ${villain?'villano':'héroe'} →</button></form></div>`;
}
function voting(t) {
  const target=t.queue[t.index], villains=target==='villains'; const opponent=team(target);
  const options=villains?room.teams.filter(v=>v.id!==t.id).map(v=>card({...v.villain,id:v.id},'villain',v.id,true)):room.heroes.filter(h=>h.villainId===target&&h.teamId!==t.id).map(h=>card(h,'hero',h.teamId,true));
  return `<section class="voting-screen"><div class="round-heading"><div><div class="eyebrow">RONDA 03 · VOTO ${t.index+1} DE ${t.queue.length}</div><h1>${villains?'Elige al mejor <em>villano.</em>':'Elige la solución más <em>proactiva.</em>'}</h1><p>${villains?'Elige una tarjeta de los otros equipos.':'Acción concreta, iniciativa y prevención. Elige una tarjeta; tus héroes no aparecen.'}</p></div>${timer(t)}</div><div class="vote-cards ${villains?'villains-only':''}">${villains?'':card(opponent.villain,'villain',opponent.id)}${options.join('')}</div><div class="vote-footer"><p>Una opción por pantalla. Sin selección al vencer el tiempo: abstención.</p><button class="button lime" data-action="vote" ${selection?'':'disabled'}>Finalizar voto →</button></div></section>`;
}
function equalizePodium() {
  const groups=[...document.querySelectorAll('.podium-teams')];
  groups.forEach(el=>el.style.minHeight='');
  if(!groups.length||window.matchMedia('(max-width:580px)').matches)return;
  const height=Math.max(...groups.map(el=>el.getBoundingClientRect().height));
  groups.forEach(el=>el.style.minHeight=`${height}px`);
}
window.addEventListener('resize',equalizePodium);
if(document.fonts)document.fonts.ready.then(equalizePodium);
function results() {
  const score=scores(room);
  const levels=[...new Set(score.teams.map(t=>t.votes))].filter(v=>v>0).slice(0,3);
  const medals=['🥇','🥈','🥉'];
  const podium=levels.map((votes,i)=>{
    const winners=score.teams.filter(t=>t.votes===votes);
    return `<article class="podium-place place-${i+1}"><div class="podium-medal">${medals[i]}</div><div class="podium-position">${i+1}° LUGAR${winners.length>1?' · EMPATE':''}</div><div class="podium-teams">${winners.map(t=>`<div class="podium-team"><h3>${icon(t.id)} ${esc(t.name)}</h3><strong>${t.votes} <small>votos</small></strong><p>⚡ ${t.heroVotes} a sus héroes · 🦇 ${t.villainVotes} a su villano</p></div>`).join('')}</div><div class="podium-base" aria-hidden="true"></div></article>`;
  });
  const position=(entries,entry)=>entry.votes?[...new Set(entries.map(e=>e.votes))].indexOf(entry.votes)+1:'—';
  return `<section class="results-screen"><section class="results-head"><div class="eyebrow">LA BATALLA TERMINÓ · LA PROACTIVIDAD GANÓ</div><h1>De lo imposible<br><em>a lo extraordinario.</em></h1><p>${room.teams.length} equipos · ${room.heroes.length} héroes · ${room.votes.filter(v=>v.choice).length} votos válidos · ${room.votes.filter(v=>!v.choice).length} abstenciones</p></section><section class="podium-section"><div class="eyebrow">🏆 PREMIO PRINCIPAL</div><h2>Los equipos más votados</h2><p>Votos recibidos por todos sus héroes + votos por su villano. Los empates comparten puesto.</p><div class="podium">${podium.length?podium.join(''):'<p class="muted">No se registraron votos para formar el podio.</p>'}</div></section><div class="results-tables"><section><h2>⚡ Mejor héroe</h2><p class="muted">Ranking de las soluciones más proactivas.</p><div class="table-wrap"><table><thead><tr><th scope="col">Puesto</th><th scope="col">Héroe / equipo</th><th scope="col">Contra</th><th scope="col">Votos</th></tr></thead><tbody>${score.heroes.map(h=>`<tr><td>${position(score.heroes,h)}</td><td><strong>${esc(h.name)}</strong><small>${esc(team(h.teamId).name)}</small></td><td>${esc(team(h.villainId).villain.name)}</td><td class="table-votes">${h.votes}</td></tr>`).join('')}</tbody></table></div></section><section><h2>🦇 Mejor villano</h2><p class="muted">Ranking de los maestros del caos.</p><div class="table-wrap"><table><thead><tr><th scope="col">Puesto</th><th scope="col">Villano / equipo</th><th scope="col">Votos</th></tr></thead><tbody>${score.villains.map(v=>`<tr><td>${position(score.villains,v)}</td><td><strong>${esc(v.name)}</strong><small>${esc(team(v.teamId).name)}</small></td><td class="table-votes">${v.votes}</td></tr>`).join('')}</tbody></table></div></section></div><section class="solutions-gallery"><h2>Galería de problemas y soluciones</h2><p class="muted">Cada villano y los héroes que lo enfrentaron.</p>${room.teams.map(t=>`<div class="solution-row"><div class="gallery-villain">${card(score.villains.find(v=>v.teamId===t.id),'villain',t.id)}</div><div class="gallery-heroes">${score.heroes.filter(h=>h.villainId===t.id).map(h=>card(h,'hero',h.teamId)).join('')}</div></div>`).join('')}</section><button class="button outline" data-action="download">Descargar resultados JSON ↓</button></section>`;
}

async function action(name,data={}) {
  if(busy) return; busy=true;actionVersion++;clearTimeout(draftTimer);
  try {
    if(demo) { if(name==='start')start(room); else if(name==='advance')advance(room); else submit(room,teamId,data,Date.now(),data.automatic===true); }
    else adopt(await api('action',{action:name,data,phase:room.phase,index:team(teamId)?.index}));
    render();
  } catch(e){toast(e.message);} finally{busy=false;}
}
app.addEventListener('submit',async e=>{
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.target));
  if(e.target.id==='admin-form'){try{adopt(await api('admin',data));document.querySelector('#admin-dialog').close();render();}catch(e){toast(e.message);}return;}
  if(e.target.id==='creation-form') return action('submit',data);
  try {adopt(await api('join',data));render();} catch(e){toast(e.message);}
});
function saveDraft(){
  if (!room || role!=='team')return;
  const data=room.phase==='voting'?{choice:selection}:draft;
  if(demo){const t=team(teamId);t.pending={...data};return;}
  const snapshot={action:'draft',data:{...data},phase:room.phase,index:team(teamId)?.index};
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>api('action',snapshot).catch(()=>toast('No se guardó el borrador. Revisa tu conexión antes de finalizar.')),googleBackend?1500:180);
}
app.addEventListener('input',e=>{if(e.target.closest('#creation-form')){draft[e.target.name]=e.target.value;saveDraft();}});
app.addEventListener('change',e=>{if(e.target.id==='demo-view'){role=e.target.value==='admin'?'admin':'team';teamId=role==='team'?e.target.value:null;render();}});
app.addEventListener('click',async e=>{
  const choice=e.target.closest('[data-choice]');
  if(choice){selection=choice.dataset.choice;saveDraft();render();return;}
  const button=e.target.closest('[data-action]');if(!button)return;
  const name=button.dataset.action;
  if(name==='home'){if(!room)return document.querySelector('#how').scrollIntoView({behavior:'smooth'});if(!confirm('¿Salir de esta vista? Podrás regresar recargando si es una partida local.'))return; room=null;demo=false;screenKey='';landing();return;}
  if(name==='admin'){if(googleBackend){document.querySelector('#admin-dialog').showModal();return;}try {adopt(await api('admin',{}));render();}catch(e){toast(e.message);}return;}
  if(name==='demo'){demo=true;room=createRoom();['Los Cazacaos','Liga Fantasma','Calabazas Atómicas','Guardianes del Trueno'].forEach(n=>join(room,n));role='admin';teamId=null;render();return;}
  if(name==='close-admin'){document.querySelector('#admin-dialog').close();return;}
  if(name==='start')return action('start');
  if(name==='advance'){if(confirm('¿Finalizar toda la ronda? Las respuestas pendientes se marcarán como incompletas y los votos sin enviar como abstenciones.'))action('advance');return;}
  if(name==='vote')return action('submit',{choice:selection});
  if(name==='copy'){try{const url=new URL(location.href);url.search='';await navigator.clipboard.writeText(url.href);toast(googleBackend?'Enlace copiado. Los equipos entran aquí con su nombre.':'Enlace copiado. En otros dispositivos usa la IP local del servidor en lugar de localhost.');}catch{toast('Comparte esta dirección para que los equipos ingresen con su nombre.');}return;}
  if(name==='download'){const blob=new Blob([JSON.stringify({...room,scores:scores(room)},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`imposibles-proactividad.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;}
  if(name==='sample')fillDemo();
});
function fillDemo(){
  if(room.phase==='lobby'){start(room);render();return;}
  const phase=room.phase;
  const villains=[['Doctor Sinrespuesta','Vuelve invisible al responsable de cada solicitud.','Los clientes esperan y el equipo repite trabajo sin tomar decisiones.'],['La Niebla del Olvido','Borra los archivos justo antes de una entrega.','Desaparecen acuerdos, versiones y toda la información del proyecto.'],['Reina del Último Minuto','Cambia los requisitos cuando todo está listo.','Los plazos se rompen y el equipo debe rehacer cada entrega.']];
  for(const t of room.teams)while(room.phase===phase&&!t.done){
    if(phase==='villain'){const v=villains[room.teams.indexOf(t)%3];submit(room,t.id,{name:v[0],power:v[1],damage:v[2]});}
    else if(phase==='heroes')submit(room,t.id,{name:['Capitana Claridad','Guardián de las Copias','Centella Ágil'][room.teams.indexOf(t)%3],power:'Convierte el caos en acuerdos visibles y acciones coordinadas.',plan:`1. Identificar el impacto de ${team(t.queue[t.index]).villain.name}.\n2. Asignar un responsable y priorizar la recuperación.\n3. Comunicar el plan, probar la solución y prevenir que el problema vuelva.`});
    else if(phase==='voting'){const target=t.queue[t.index];const candidates=target==='villains'?room.teams.filter(v=>v.id!==t.id):room.heroes.filter(h=>h.villainId===target&&h.teamId!==t.id);submit(room,t.id,{choice:candidates[Math.floor(Math.random()*candidates.length)].id});}
    else break;
  }render();
}
function updateClock(){const el=document.querySelector('#clock');if(!el)return;const left=Math.max(0,Number(el.dataset.deadline)-Date.now());const seconds=Math.ceil(left/1000);el.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;el.closest('.timer').classList.toggle('urgent',left<30000);document.querySelector('#time-bar').style.width=`${100*left/(room.phase==='voting'?180000:240000)}%`;}
setInterval(async()=>{
  if(!room)return;
  updateClock();
  const t=team(teamId);
  if(demo&&role==='team'&&!t.done&&t.deadline&&Date.now()>=t.deadline&&!busy)await action('submit',room.phase==='voting'?{choice:selection,automatic:true}:{...draft,automatic:true});
  if(demo){const before=JSON.stringify(room);tick(room);if(before!==JSON.stringify(room))render();return;}
  if(busy||polling||Date.now()-lastPoll<(googleBackend?5000:750))return;
  polling=true;lastPoll=Date.now();const pollVersion=actionVersion;
  try{const old=JSON.stringify(room);const oldPhase=room.phase;const oldIndex=t?.index;const oldDone=t?.done;const data=await api('state');if(pollVersion!==actionVersion)return;adopt(data);if(networkFailed){networkFailed=false;toast('Conexión recuperada.');}const next=team(teamId);if(old!==JSON.stringify(room)&&(role==='admin'||oldPhase==='lobby'||oldDone||oldPhase!==room.phase||oldIndex!==next?.index||oldDone!==next?.done))render();}
  catch(e){if(!networkFailed){networkFailed=true;toast('Sin conexión. Intentando reconectar… '+e.message);}const el=document.querySelector('#connection');if(el)el.textContent='● Reconectando';}
  finally{polling=false;}
},750);
async function init(){
  landing();
  try{if(googleBackend){transport=new GoogleTransport(config.appsScriptUrl);available=(await api('health')).ok;}else{const res=await fetch('./api/health');available=res.ok&&(await res.json()).ok;}}catch(e){toast(e.message);}
  token=storage.get(googleBackend?'imposibles-google-session':'imposibles-session');
  if(token&&available){try{adopt(await api('state'));}catch{storage.remove(googleBackend?'imposibles-google-session':'imposibles-session');token=null;}}
  render();
}
init();
