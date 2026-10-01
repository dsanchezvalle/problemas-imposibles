const examples = {
  villain: {name:'El Devoraplazos',type:'villain',image:'devoraplazos',power:'Hace desaparecer al responsable de cada urgencia.',detail:'El cliente espera, nadie responde y la entrega se retrasa.'},
  hero: {name:'Capitana Iniciativa',type:'hero',image:'iniciativa',power:'Activa al equipo antes de que el caos crezca.',detail:'Asume la coordinación, asigna un responsable y confirma un plazo con el cliente. Crea un canal de urgencias para prevenirlo.'},
  radar: {name:'Radar Preventivo',type:'hero',image:'radar',power:'Detecta urgencias antes de que exploten.',detail:'Revisa solicitudes, asigna responsables y activa alertas para anticipar retrasos.'},
  bridge: {name:'El Conector',type:'hero',image:'conector',power:'Une a quienes pueden resolver el problema.',detail:'Reúne al equipo adecuado, acuerda tareas y comunica al cliente el siguiente paso.'}
};
function exampleCard(key,compact=false,selected=false) {
  const c=examples[key];
  return `<div class="example-card ${c.type} ${compact?'compact':''} ${selected?'chosen':''}"><div class="example-card-name">${c.name}<span>${c.type==='villain'?'☾':'✦'}</span></div><div class="example-stars">${c.type==='villain'?'✦ ✦ ✦ ✦ ✦':'✦ ✦ ✦ ✦'}</div><img src="./images/${c.image}.svg" alt="Ilustración de ${c.name}" width="360" height="260"><div class="example-card-description"><div class="card-top"><span class="card-role">${c.type==='villain'?'Villano':'Héroe'}</span><span class="card-ethos"><small>${c.type==='villain'?'Antivalor':'Valor'}</small><strong>${c.type==='villain'?'Caos':'Proactividad'}</strong></span></div><dl><div class="card-field"><dt>${c.type==='villain'?'Poder especial':'Superpoder'}</dt><dd>${c.power}</dd></div><div class="card-field card-field-detail"><dt>${c.type==='villain'?'Daño que genera':'Plan de acción'}</dt><dd>${c.detail}</dd></div></dl></div>${selected?'<span class="example-selected">✓ SOLUCIÓN ELEGIDA</span>':''}</div>`;
}
const progression = label => `<div class="tutorial-progression"><svg viewBox="0 0 180 95" aria-hidden="true"><path class="arrow-shadow" d="M8 57C35 9 104 6 107 40C112 76 52 78 66 43C80 17 139 18 166 54"/><path class="arrow-line" d="M8 57C35 9 104 6 107 40C112 76 52 78 66 43C80 17 139 18 166 54"/><path class="arrow-tip" d="M145 50l24 8-7-24"/></svg><span>${label}</span></div>`;
export function lobbyTutorial(){return `<section class="lobby-tutorial" aria-label="Las tres rondas de la batalla"><div class="tutorial-steps"><article><div class="tutorial-step-title"><div class="tutorial-step-heading"><b>01</b><h2>Desata el caos</h2><small>4 min</small></div><p>Crea un villano con un problema imposible.</p></div><div class="tutorial-visual">${exampleCard('villain')}</div>${progression('¡Aparece el héroe!')}</article><article><div class="tutorial-step-title"><div class="tutorial-step-heading"><b>02</b><h2>Inventa la solución</h2><small>4 min / héroe</small></div><p>Crea un héroe para cada villano de los otros equipos.</p></div><div class="tutorial-visual">${exampleCard('hero')}</div>${progression('¡A votar!')}</article><article class="tutorial-vote"><div class="tutorial-step-title"><div class="tutorial-step-heading"><b>03</b><h2>Elige a las leyendas</h2><small>3 min / voto</small></div><p>Vota la solución más proactiva y al villano más memorable.</p></div><div class="tutorial-vote-scene"><div class="tutorial-enemy">${exampleCard('villain',true)}</div><div class="tutorial-connector" aria-hidden="true">↓</div><div class="tutorial-choices">${exampleCard('hero',true,true)}${exampleCard('radar',true)}${exampleCard('bridge',true)}</div></div></article></div></section>`;}
export function sizeTutorialCards(){
  document.querySelectorAll('.tutorial-visual').forEach(visual=>{
    const scale=Math.min(1,visual.clientWidth/260);
    visual.querySelector('.example-card').style.transform=`scale(${scale})`;
    visual.querySelector('.example-card').style.left=`${(visual.clientWidth-260*scale)/2}px`;
  });
  document.querySelectorAll('.tutorial-vote-scene').forEach(scene=>{
    const width=scene.clientWidth;
    const scale=Math.min((width-24)/(3*260),((260*918/634)-24)/(2*(260*918/634)));
    const cardWidth=260*scale,cardHeight=(260*918/634)*scale;
    const enemy=scene.querySelector('.tutorial-enemy .example-card');
    enemy.style.transform=`scale(${scale})`;enemy.style.left=`${(width-cardWidth)/2}px`;enemy.style.top='0';
    const arrow=scene.querySelector('.tutorial-connector');arrow.style.top=`${cardHeight}px`;
    scene.querySelectorAll('.tutorial-choices .example-card').forEach((card,index)=>{
      card.style.transform=`scale(${scale})`;card.style.top=`${cardHeight+24}px`;card.style.left=`${(width-3*cardWidth-24)/2+index*(cardWidth+12)}px`;
    });
  });
}
window.addEventListener('resize',sizeTutorialCards);
document.fonts?.ready.then(sizeTutorialCards);
