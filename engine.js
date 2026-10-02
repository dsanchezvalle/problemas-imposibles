export const MIN_TEAMS = 4;
export const MAX_TEAMS = 8;
export const durations = { villain: 240000, heroes: 240000, voting: 180000 };
export const uid = () => globalThis.crypto.randomUUID();
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function createRoom(now = Date.now()) {
  return { phase: 'lobby', teams: [], heroes: [], votes: [], createdAt: now, updatedAt: now };
}
export function join(room, name) {
  if (room.phase !== 'lobby') throw Error('La partida ya comenzó.');
  name = String(name || '').trim().slice(0, 32);
  if (!name) throw Error('Escribe el nombre de tu equipo.');
  if (room.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) throw Error('Ese nombre ya está en la sala.');
  if (room.teams.length >= MAX_TEAMS) throw Error(`La sala admite hasta ${MAX_TEAMS} equipos.`);
  const team = { id: uid(), name, villain: null, index: 0, done: false, queue: [], deadline: null };
  room.teams.push(team); return team;
}
function transition(room, phase, now) {
  room.phase = phase;
  for (const t of room.teams) {
    t.index = 0; t.done = false; t.pending = {};
    if (phase === 'heroes') t.queue = shuffle(room.teams.filter(x => x.id !== t.id).map(x => x.id));
    if (phase === 'voting') t.queue = [...shuffle(room.teams.filter(v => room.heroes.some(h => h.villainId === v.id && h.teamId !== t.id)).map(v => v.id)), 'villains'];
    t.screenStartedAt = phase === 'results' ? null : now;
    t.deadline = phase === 'results' ? null : now + durations[phase];
  }
}
export function start(room, now = Date.now()) {
  if (room.phase !== 'lobby') throw Error('La partida ya comenzó.');
  if (room.teams.length < MIN_TEAMS) throw Error(`Se necesitan al menos ${MIN_TEAMS} equipos para iniciar el juego.`);
  if (room.teams.length > MAX_TEAMS) throw Error(`La sala admite hasta ${MAX_TEAMS} equipos.`);
  for (const t of room.teams) t.totalTimeMs = 0;
  transition(room, 'villain', now);
}
const clean = (v, limit) => String(v || '').trim().slice(0, limit);
export function submit(room, teamId, data = {}, now = Date.now(), automatic = false) {
  const t = room.teams.find(t => t.id === teamId);
  if (!t || t.done || !['villain','heroes','voting'].includes(room.phase)) throw Error('Esta pantalla ya finalizó.');
  if (room.phase === 'villain' || room.phase === 'heroes') {
    const fields = room.phase === 'villain' ? ['name','power','damage'] : ['name','power','plan'];
    if (!automatic && fields.some(k => !clean(data[k], 1200))) throw Error('Completa todos los campos antes de finalizar.');
    const entry = Object.fromEntries(fields.map(k => [k, clean(data[k], k === 'name' ? 30 : k === 'power' ? 80 : 140) || (k === 'name' ? 'Sin nombre' : 'El equipo no completó este campo a tiempo.')]));
    entry.incomplete = fields.some(k => !clean(data[k], 1200));
    if (room.phase === 'villain') { t.villain = entry; t.done = true; }
    else { room.heroes.push({ ...entry, id: uid(), teamId: t.id, villainId: t.queue[t.index] }); t.index++; }
  } else {
    const target = t.queue[t.index];
    const eligible = target === 'villains' ? room.teams.filter(v => v.id !== t.id).map(v => v.id) : room.heroes.filter(h => h.villainId === target && h.teamId !== t.id).map(h => h.id);
    if (data.choice && !eligible.includes(data.choice)) throw Error('Esa opción no está disponible para tu equipo.');
    if (!data.choice && !automatic) throw Error('Selecciona una tarjeta para votar.');
    room.votes.push({ teamId: t.id, kind: target === 'villains' ? 'villain' : 'hero', target, choice: data.choice || null }); t.index++;
  }
  // Count active screen time only, capped at expiry even when polling is late.
  if (Number.isFinite(t.totalTimeMs) && Number.isFinite(t.screenStartedAt)) {
    t.totalTimeMs += Math.max(0, Math.min(now, t.deadline) - t.screenStartedAt);
  }
  t.screenStartedAt = now;
  t.pending = {};
  if (room.phase !== 'villain') { t.done = t.index >= t.queue.length; t.deadline = t.done ? null : now + durations[room.phase]; }
  if (room.phase !== 'voting' && room.teams.every(x => x.done)) transition(room, { villain: 'heroes', heroes: 'voting' }[room.phase], now);
  room.updatedAt = now;
}
export function tick(room, now = Date.now()) {
  for (const t of room.teams) if (!t.done && t.deadline && now >= t.deadline) submit(room, t.id, t.pending || {}, now, true);
}
export function advance(room, now = Date.now()) {
  if (!['villain','heroes','voting'].includes(room.phase)) throw Error('No hay ronda activa.');
  const phase = room.phase;
  for (const t of room.teams) while (room.phase === phase && !t.done) submit(room, t.id, t.pending || {}, now, true);
}
export function finish(room, now = Date.now()) {
  if (room.phase !== 'voting') throw Error('El juego solo puede finalizar durante la votación.');
  advance(room, now);
  transition(room, 'results', now);
  room.updatedAt = now;
}
export function scores(room) {
  const count = (kind, id) => room.votes.filter(v => v.kind === kind && v.choice === id).length;
  const heroes = room.heroes.map(h => ({ ...h, votes: count('hero', h.id) })).sort((a,b) => b.votes-a.votes);
  const villains = room.teams.map(t => ({ ...t.villain, id: t.id, teamId: t.id, votes: count('villain', t.id) })).sort((a,b) => b.votes-a.votes);
  const teams = room.teams.map(t => {
    const heroVotes = heroes.filter(h => h.teamId === t.id).reduce((total,h) => total+h.votes,0);
    const villainVotes = count('villain',t.id);
    return { id:t.id, name:t.name, heroVotes, villainVotes, votes:heroVotes+villainVotes, totalTimeMs:Number.isFinite(t.totalTimeMs)?t.totalTimeMs:null };
  }).sort((a,b) => b.votes-a.votes || (a.totalTimeMs ?? Infinity)-(b.totalTimeMs ?? Infinity));
  return { teams, heroes, villains };
}
