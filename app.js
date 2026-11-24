/* Life RPG — prototype v0.4
   Principe : on n'enregistre que des actions réelles (séances, étapes de cours, pages, puzzles, kcal).
   L'XP et les niveaux sont RECALCULÉS à partir de ces actions à chaque affichage :
   changer une règle d'XP plus tard s'applique donc à tout l'historique, sans migration. */
'use strict';

/* ================= Règles du jeu (valeurs modifiables ici) ================= */
const RULES = {
  seance: 50,          // XP par séance terminée
  semaine4: 10,        // bonus si 4 séances dans la semaine (lundi→dimanche)
  record: 25,          // bonus par nouveau record de charge (provisoire)
  etapeCours: 20,      // XP par étape de cours (provisoire)
  pomo: 10,            // XP par bloc de 25 min de révision
  examen: 200,         // bonus par examen réussi
  page: 1,             // XP par page lue
  livre: 100,          // bonus par livre fini
  puzzles: 5,          // XP par série de 10 puzzles (à affiner)
  kcalSeuil: 3500,
  kcal: 40,            // XP si le seuil de kcal est atteint
  absenceRetour: 3,    // jours d'absence avant la quête « Retour » (XP du jour ×2)
  objectifPages: 10,
  queteDemain: 20,     // XP d'une quête du lendemain réussie
};

const STATS = [
  {k:'for', name:'Force',     abbr:'FOR', page:'force',     sub:'Musculation'},
  {k:'sav', name:'Savoir',    abbr:'SAV', page:'savoir',    sub:'Médecine'},
  {k:'sag', name:'Sagesse',   abbr:'SAG', page:'sagesse',   sub:'Lecture'},
  {k:'str', name:'Stratégie', abbr:'STR', page:'strategie', sub:'Échecs rapide'},
  {k:'vit', name:'Ravitaillement', abbr:'RAV', page:'vitalite',  sub:'Alimentation'},
];
const STAGES = ['Novice','Apprenti','Athlète','Guerrier','Champion','Titan'];
const STAGE_LVL = [0, 2, 5, 10, 15, 20];   // niveau de Force requis pour chaque stade

/* Programme : [id, nom, séries, reps (ou secondes), type de charge] */
const PROGRAM = {
  A: {name:'Haut A', ex:[
    ['dc','Développé couché',3,8], ['pecm','Pecs machine',3,8], ['trac','Tractions',3,8,'lest'],
    ['tvp','Tirage vertical poulie',3,8], ['elat','Élévations latérales',3,8], ['shr','Shrugs',3,8],
    ['bica','Biceps alterné',3,8], ['trip','Triceps poulie',3,8], ['curlr','Curls en rotation',3,8]]},
  L: {name:'Bas', ex:[
    ['sq','Squat',3,8], ['pr','Presse',3,10], ['sdtjt','Soulevé de terre jambes tendues',3,8],
    ['lext','Leg extension',3,12], ['lcurl','Leg curl',3,12], ['mol','Mollets debout',3,15],
    ['gain','Gainage',3,45,'sec']]},
  B: {name:'Haut B', ex:[
    ['dih','Développé incliné haltères',3,8], ['ecp','Écarté poulie',3,8], ['rowb','Rowing barre',3,8],
    ['thp','Tirage horizontal poulie',3,8], ['elp','Élévations latérales poulie',3,8], ['shh','Shrugs haltères',3,8],
    ['cup','Curl poulie',3,8], ['tbf','Triceps barre au front',3,8], ['rdd','Roulés de doigts',3,8]]},
};
const CYCLE = ['A','L','B','L'];   // Haut A, Bas, Haut B, Bas
const EXN = {}; for (const t in PROGRAM) for (const e of PROGRAM[t].ex) EXN[e[0]] = e;

/* ================= Dates (toujours en heure locale) ================= */
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const weekKey = s => { const d = parse(s); const dow = (d.getDay()+6)%7; d.setDate(d.getDate()-dow); return ymd(d); };
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const longDate = s => { const d = parse(s); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
const shortDate = s => { const d = parse(s); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const kgTxt = n => (Math.round(n*10)/10).toLocaleString('fr-FR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================= Stockage sur l'appareil ================= */
const KEY = 'liferpg.v1';
const blank = () => ({
  v:1, name:'Boss',
  workouts:[],      // séances terminées {id,date,type,pos,ex:{id:{kg,sets:[0|1|2]}},run:[b,b]}
  cur:null,         // séance en cours
  loads:{},         // charge prévue pour la prochaine séance, par exercice
  rest:[],          // jours de repos prévus (dates)
  courses:[],       // {id,name,url,folder,steps:{lu,fiche,quiz,rev}} (fiche = Appris, rev = Maîtrisé)
  folders:[],       // {id,name,parent}
  exams:[],         // {id,name,passed}
  pomo:{},          // date → nombre de blocs de 25 min
  outfit:{},
  theme:'pixel',
  sound:true,
  tquests:[],       // quêtes du lendemain {id,date,stat,text,done}
  books:[],         // {id,title,total,done}
  pages:[],         // {id,date,book,n}
  puzzles:[],       // {id,date}
  elo:[],           // {date,v}
  kcal:{},          // date → total
  grade:{},         // date → note de qualité C / B / A / S
  mquests:[],       // quêtes principales / secondaires {id,type:'main'|'side',text,done}
  fold:{},          // sections repliées de l'onglet Quêtes
});
let S;
function load(){
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { S = blank(); }
}
function migrate(){
  // v0.6 : plus d'augmentation automatique. Les charges prévues redeviennent la dernière charge réellement saisie.
  if (S.mig06) return;
  for (const id in EXN){ const last = lastOf(id); if (last) S.loads[id] = last.kg; }
  if (S.cur && !Object.values(S.cur.ex).some(e => e.sets.some(x => x))) for (const id in S.cur.ex) S.cur.ex[id].kg = S.loads[id] ?? null;
  S.mig06 = true; save();
}
function save(){ localStorage.setItem(KEY, JSON.stringify(S)); }

/* ================= Moteur d'XP ================= */
// Ravitaillement : plus d'XP. Rang = moyenne des notes C/B/A/S des 30 derniers jours (jours sans note ignorés).
// Le rang ne compte pas dans le niveau perso : il change l'allure de l'avatar.
const GRADES = ['C','B','A','S'];
const GVAL = {C:1, B:2, A:3, S:4};
const GEMO = {C:'🍔', B:'🍝', A:'🍗', S:'🥩'};
const last30 = obj => { const t = today(), from = addDays(t, -29); return Object.keys(obj || {}).filter(d => d >= from && d <= t); };
function tierOf(){
  const ds = last30(S.grade).filter(d => GVAL[S.grade[d]]);
  if (!ds.length) return null;
  const avg = ds.reduce((a,d) => a + GVAL[S.grade[d]], 0) / ds.length;
  const letter = GRADES[Math.min(4, Math.max(1, Math.round(avg))) - 1];   // lettre la plus proche (2,5 → A)
  return {letter, val: GVAL[letter], avg, n: ds.length};
}
function kcalAvg(){
  const ds = last30(S.kcal).filter(d => S.kcal[d] > 0);
  return ds.length ? {avg: Math.round(ds.reduce((a,d) => a + S.kcal[d], 0) / ds.length), n: ds.length} : null;
}
const tierTxt = t => t ? `${t.letter}-tier <span class="emo">${GEMO[t.letter]}</span>` : 'sans tier';
const emo = g => `<span class="emo">${GEMO[g]}</span>`;
function levelOf(xp){
  // Passer du niveau n-1 au niveau n coûte 100×n XP (niveau 1 = 100 XP, niveau 2 = +200…)
  let lvl = 0, rest = xp;
  while (rest >= 100*(lvl+1)) { rest -= 100*(lvl+1); lvl++; }
  return {lvl, into:rest, cost:100*(lvl+1), xp};
}
function allSuccess(e){ return e.sets.length > 0 && e.sets.every(x => x === 1); }

function computeEvents(){
  const ev = [];   // {date, stat, xp, label}
  const push = (date, stat, xp, label) => ev.push({date, stat, xp, label});

  // Force : séances, bonus 4 séances/semaine, records
  const ws = [...S.workouts].sort((a,b) => a.date.localeCompare(b.date));
  const perWeek = {}, best = {};
  for (const w of ws){
    push(w.date, 'for', RULES.seance, `Séance ${PROGRAM[w.type].name}`);
    const wk = weekKey(w.date); perWeek[wk] = (perWeek[wk]||0) + 1;
    if (perWeek[wk] === 4) push(w.date, 'for', RULES.semaine4, 'Bonus semaine : 4 séances');
    for (const id in w.ex){
      const e = w.ex[id], def = EXN[id];
      if (!def || def[4] === 'sec' || !allSuccess(e)) continue;
      // La première fois qu'un exercice est réussi, on fixe la référence (pas de bonus) :
      // sinon la séance test donnerait un record par exercice.
      if (best[id] === undefined) best[id] = e.kg;
      else if (e.kg > best[id]) { best[id] = e.kg; push(w.date, 'for', RULES.record, `Record ${def[1]} : ${kgTxt(e.kg)} kg`); }
    }
  }
  // Savoir
  const SN = {lu:'lu', fiche:'appris', quiz:'quiz réussi', rev:'maîtrisé'};
  for (const c of S.courses) for (const k in SN) if (c.steps[k]) push(c.steps[k], 'sav', RULES.etapeCours, `${c.name} : ${SN[k]}`);
  for (const d in S.pomo) if (S.pomo[d] > 0) push(d, 'sav', S.pomo[d]*RULES.pomo, `Révision : ${S.pomo[d]} × 25 min`);
  for (const q of S.tquests || []) if (q.done) push(q.done, q.stat, RULES.queteDemain, `Quête du jour : ${q.text}`);
  for (const q of S.mquests || []) if (q.done && q.xp > 0 && q.stat) push(q.done, q.stat, q.xp, `Quête ${q.type === 'main' ? 'principale' : 'secondaire'} : ${q.text}`);
  for (const x of S.exams) if (x.passed) push(x.passed, 'sav', RULES.examen, `Examen réussi : ${x.name}`);
  // Sagesse
  const bt = id => (S.books.find(b => b.id === id) || {}).title || 'Livre';
  for (const p of S.pages) push(p.date, 'sag', p.n*RULES.page, `${p.n} pages · ${bt(p.book)}`);
  for (const b of S.books) if (b.done) push(b.done, 'sag', RULES.livre, `Livre fini : ${b.title}`);
  // Stratégie
  for (const p of S.puzzles) push(p.date, 'str', RULES.puzzles, '10 puzzles');

  // Quête « Retour » : après 3 jours sans aucune action, l'XP du premier jour de reprise est doublée.
  const days = [...activeDays()].sort();
  for (let i = 1; i < days.length; i++){
    if (diffDays(days[i-1], days[i]) > RULES.absenceRetour){
      const d = days[i];
      for (const e of ev.filter(e => e.date === d)) push(d, e.stat, e.xp, `Retour ×2 · ${e.label}`);
    }
  }
  return ev.filter(e => e.stat !== 'vit');   // Ravitaillement ne gagne plus d'XP (ancienne quête du lendemain comprise)
}
function activeDays(){
  const s = new Set();
  S.workouts.forEach(w => s.add(w.date)); S.rest.forEach(d => s.add(d));
  S.courses.forEach(c => Object.values(c.steps).forEach(d => d && s.add(d)));
  S.exams.forEach(x => x.passed && s.add(x.passed));
  S.pages.forEach(p => s.add(p.date)); S.books.forEach(b => b.done && s.add(b.done));
  (S.tquests || []).forEach(q => q.done && s.add(q.done));
  S.puzzles.forEach(p => s.add(p.date)); S.elo.forEach(e => s.add(e.date));
  Object.keys(S.kcal).forEach(d => S.kcal[d] > 0 && s.add(d));
  Object.keys(S.grade || {}).forEach(d => s.add(d));
  (S.mquests || []).forEach(q => q.done && s.add(q.done));
  Object.keys(S.pomo).forEach(d => S.pomo[d] > 0 && s.add(d));
  return s;
}
function retourToday(){
  const t = today(); const days = [...activeDays()].filter(d => d < t).sort();
  if (!days.length) return false;
  return diffDays(days[days.length-1], t) > RULES.absenceRetour;
}
function snapshot(){
  const ev = computeEvents();
  const tot = {for:0,sav:0,sag:0,str:0,vit:0};
  ev.forEach(e => tot[e.stat] += e.xp);
  const lv = {}; for (const k in tot) lv[k] = levelOf(tot[k]);
  const sum = ['for','sav','sag','str'].reduce((a,k) => a + lv[k].lvl, 0);   // niveau perso : 4 attributs ÷ 4
  lv.vit = {lvl:0, into:0, cost:1, xp:0};
  const tier = tierOf();
  const t = today();
  return {ev, tot, lv, tier, perso: Math.floor(sum/4), sum, todayXP: ev.filter(e => e.date === t).reduce((a,e) => a + e.xp, 0)};
}
function stageOf(forLvl){ let s = 0; STAGE_LVL.forEach((l,i) => { if (forLvl >= l) s = i; }); return s; }

/* ================= Avatar pixel art (6 stades) + garde-robe + récompenses ================= */
// lvl = niveau perso requis (récompenses). Sans lvl : disponible dès le départ.
const WARDROBE = {
  head:   [{v:'none', label:'Rien'},
           {v:'cap',   label:'Casquette', lvl:1},  {v:'band', label:'Bandeau de sport', lvl:2},
           {v:'hat',   label:'Chapeau', lvl:5},    {v:'crown', label:'Couronne de roi', lvl:10}],
  face:   [{v:'none', label:'Sans lunettes'}, {v:'glasses', label:'Lunettes'}, {v:'shades', label:'Lunettes noires', lvl:4}],
  beard:  [{v:'none', label:'Rasé'}, {v:'must-s', label:'Moustache courte'}, {v:'must-l', label:'Moustache longue'},
           {v:'beard-s', label:'Barbe courte'}, {v:'beard-l', label:'Barbe longue'}],
  top:    [{v:'none',   label:'Torse nu'},
           {v:'tee-0',  label:'T-shirt blanc', c:'#f5f1e6'}, {v:'tee-1', label:'T-shirt rouge', c:'#ff5d5d'}, {v:'tee-2', label:'T-shirt noir', c:'#2b2d42'},
           {v:'pull-0', label:'Pull gris', c:'#9aa6d6'},     {v:'pull-1', label:'Pull violet', c:'#8e5cff'}, {v:'pull-2', label:'Pull vert', c:'#3fa34d'},
           {v:'coat',   label:'Blouse de médecin', c:'#eef2f7', lvl:6}],
  bottom: [{v:'short-0', label:'Short rose', c:'#ff5d73'},   {v:'short-1', label:'Short noir', c:'#2b2d42'},   {v:'short-2', label:'Short bleu', c:'#4fc3ff'},
           {v:'pant-0',  label:'Jean', c:'#3b5bdb'},         {v:'pant-1',  label:'Pantalon beige', c:'#c8a97e'}, {v:'pant-2', label:'Pantalon noir', c:'#2b2d42'},
           {v:'stripe',  label:'Pantalon rayé', c:'#3b3f8f', lvl:3}],
  belt:   [{v:'none', label:'Rien'}, {v:'champ', label:'Ceinture de champion', lvl:7}],
  back:   [{v:'none', label:'Rien'}, {v:'cape', label:'Cape rouge', lvl:8}],
  shoes:  [{v:'white', label:'Baskets blanches', c:'#f5f1e6'}, {v:'black', label:'Baskets noires', c:'#2b2d42'},
           {v:'red', label:'Baskets rouges', c:'#ff5d5d'}, {v:'blue', label:'Baskets bleues', c:'#4fc3ff'},
           {v:'gold', label:'Baskets dorées', c:'#ffd23f', lvl:9}],
};
const OUTFIT0 = {head:'none', face:'none', beard:'none', top:'none', bottom:'short-0', belt:'none', back:'none', shoes:'white'};
const REWARDS = Object.entries(WARDROBE).flatMap(([part, l]) => l.filter(i => i.lvl).map(i => ({...i, part}))).sort((a,b) => a.lvl - b.lvl);
let persoLvl = 0;   // mis à jour à chaque rendu
const unlocked = it => !it.lvl || persoLvl >= it.lvl;
const wItem = (part, v) => { const it = WARDROBE[part].find(x => x.v === v); return it && unlocked(it) ? it : WARDROBE[part].find(x => x.v === OUTFIT0[part]); };
const shade = (hex, f=.75) => '#' + [1,3,5].map(i => Math.round(parseInt(hex.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('');

const curTier = () => (tierOf() || {letter:'B'}).letter;   // sans note = allure B
function avatarSVG(stage, px, outfit = S.outfit || {}, pose = '', tier = curTier()){
  const o = Object.assign({}, OUTFIT0, outfit);
  const it = {}; for (const k in OUTFIT0) it[k] = wItem(k, o[k]);
  const W = 32, H = 36, g = Array.from({length:H}, () => Array(W).fill(0));
  // codes : 1 peau tête/cou, 2 cheveux, 3 short, 4 relief torse, 5 chaussures, 6 torse, 7 haut du bras,
  // 8 avant-bras, 10 jambes, 11 relief jambes, 12 mains, 20+ accessoires
  const span = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) if (y>=0 && y<H && x>=0 && x<W) g[y][x] = c; };
  const sym = (y, hw, c) => span(y, 16-hw, 15+hw, c);
  const s = stage + 1;
  const sh = 3 + s, wa = 3 + Math.floor(s/3), aw = 1 + Math.floor((s+1)/2), ax0 = 16 - sh - aw, lw = 2 + Math.floor(s/2);
  if (it.back.v === 'cape') for (let y = 10; y <= 31; y++) sym(y, sh + 1 + Math.floor((y-10)/5), 29);   // cape (derrière le corps)
  for (let y = 2; y <= 8; y++) sym(y, y===2||y===8 ? 2 : 3, 1);   // tête
  sym(2, 3, 2); sym(3, 3, 2); span(4, 12, 12, 2); span(4, 19, 19, 2);
  // visage selon le tier : 34 bouche, 35 dents, 36 cernes
  const tired = tier === 'C';
  if (pose === 'yawn'){ span(5, 13, 14, 36); span(5, 17, 18, 36); span(6, 15, 16, 34); span(7, 15, 16, 34); }   // C : bâillement
  else {
    if (tired){ span(4, 13, 14, 36); span(4, 17, 18, 36); g[5][14] = 2; g[5][17] = 2; g[6][14] = 36; g[6][17] = 36; }   // paupières lourdes, cernes
    else { g[5][14] = 2; g[5][17] = 2; }
    if (pose === 'wink'){ g[5][14] = 1; g[5][13] = 1; span(5, 13, 14, 2); if (!tired) g[5][17] = 2; }   // clin d'œil
    if (tier === 'S'){ g[6][14] = 34; g[6][17] = 34; span(7, 14, 17, 34); span(7, 15, 16, 35); }   // grand sourire
    else if (tier === 'A'){ g[6][14] = 34; g[6][17] = 34; span(7, 15, 16, 34); }               // sourire
    else span(7, 15, 16, 34);                                                                    // neutre (B, C)
  }
  sym(9, 1 + (s >= 4 ? 1 : 0), 1);
  for (let y = 10; y <= 19; y++){ const t = (y-10)/9; sym(y, Math.round(sh + (wa - sh)*t*t) + (tier === 'S' && y >= 11 && y <= 13 ? 1 : 0), 6); }   // S : torse bombé
  if (tier === 'C'){ g[10][16-sh] = 0; g[10][15+sh] = 0; }   // C : épaules tombantes
  for (let y = 11; y <= 21; y++){
    const off = y > 16 ? 1 : 0, c = y <= 14 ? 7 : y === 21 ? 12 : 8;
    if (pose !== 'flex') span(y, ax0 - off, ax0 + aw - 1 - off, c);
    if (pose !== 'flex' && pose !== 'thumb') span(y, 31 - (ax0 + aw - 1 - off), 31 - (ax0 - off), c);
  }
  if (pose === 'thumb'){   // bras droit levé, pouce en l'air
    const x0 = 31 - (ax0 + aw - 1), x1 = 31 - ax0;
    for (let y = 4; y <= 11; y++) span(y, x0, x1, y >= 9 ? 7 : 8);
    span(2, x0, x1, 12); span(3, x0, x1, 12); g[1][x0] = 12; g[0][x0] = 12;
  }
  if (pose === 'flex'){    // double biceps
    for (const side of [0, 1]){
      const m = x => side ? 31 - x : x;
      for (let y = 11; y < 11 + aw; y++) for (let x = ax0 - aw; x <= ax0 + aw - 1; x++) g[y][m(x)] = 7;
      for (let y = 5; y <= 10; y++) for (let x = ax0 - aw; x <= ax0 - 1; x++) g[y][m(x)] = 8;
      for (let y = 3; y <= 4; y++) for (let x = ax0 - aw; x <= ax0 - 1; x++) g[y][m(x)] = 12;
      if (s >= 3) g[10][m(ax0 - 1)] = 4;
    }
  }
  if (s >= 3){ for (let x = 16 - sh + 2; x <= 15 + sh - 2; x++) if (x !== 15 && x !== 16) g[13][x] = 4; }
  if (s >= 4){ for (let y = 15; y <= 19; y += 2) { g[y][14] = 4; g[y][17] = 4; } }
  if (s >= 5){ g[11][16-sh] = 4; g[11][15+sh] = 4; }
  for (let y = 20; y <= 23; y++) sym(y, wa + 1, 3);
  for (let y = 24; y <= 32; y++){ span(y, 15 - lw, 15, 10); span(y, 16, 16 + lw, 10); g[y][15] = 11; }
  for (let y = 33; y <= 34; y++){ span(y, 14 - lw, 15, 5); span(y, 16, 17 + lw, 5); }
  // accessoires
  const top = it.top, bot = it.bottom;
  if (top.v === 'coat'){ for (let y = 10; y <= 13; y++){ g[y][14] = 26; g[y][17] = 26; } span(14, 14, 15, 26); g[15][15] = 26; }
  if (it.belt.v === 'champ'){ sym(20, wa + 1, 28); span(19, 14, 17, 28); span(20, 15, 16, 24); span(21, 14, 17, 28); }
  if (bot.v === 'stripe') for (let y = 20; y <= 32; y++) for (let x = 0; x < W; x++) if ((g[y][x] === 3 || g[y][x] === 10) && x % 2 === 0) g[y][x] = 27;
  const bd = it.beard.v;
  if (bd === 'beard-s' || bd === 'beard-l'){ [6,7].forEach(y => { g[y][13] = 2; g[y][18] = 2; }); span(8, 14, 17, 2); }
  if (bd === 'beard-l'){ span(9, 14, 17, 2); span(10, 15, 16, 2); }
  if (bd === 'must-s' || bd.startsWith('beard')) span(7, 15, 16, 2);
  if (bd === 'must-l'){ span(7, 14, 17, 2); g[8][14] = 2; g[8][17] = 2; }
  if (it.face.v === 'glasses'){ [13,15,16,18].forEach(x => g[5][x] = 32); span(6, 13, 18, 32); g[6][14] = 33; g[6][17] = 33; }
  if (it.face.v === 'shades'){ span(5, 13, 15, 25); span(5, 16, 18, 25); span(6, 13, 14, 25); span(6, 17, 18, 25); }
  if (it.head.v === 'cap'){ sym(1, 3, 20); sym(2, 4, 20); span(3, 12, 22, 20); }
  if (it.head.v === 'band'){ sym(3, 4, 21); g[3][15] = 24; g[3][16] = 24; }
  if (it.head.v === 'hat'){ sym(0, 2, 22); sym(1, 3, 22); sym(2, 3, 30); span(3, 10, 21, 22); }
  if (it.head.v === 'crown'){ span(0, 13, 13, 23); span(0, 18, 18, 23); span(0, 15, 16, 23); span(1, 13, 18, 23); sym(2, 3, 23); g[2][15] = 24; g[2][16] = 24; g[2][13] = 31; g[2][18] = 31; }
  if (tired){   // C : tête baissée d'un pixel
    const isHead = c => c === 1 || c === 2 || c === 34 || c === 36 || (c >= 20 && c !== 26 && c !== 27 && c !== 28 && c !== 29);
    for (let y = 9; y >= 0; y--) for (let x = 8; x <= 23; x++) if (isHead(g[y][x])) { g[y+1][x] = g[y][x]; g[y][x] = 0; }
  }
  const out = g.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    if (g[y][x]) continue;
    if ([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => g[y+dy]?.[x+dx] > 0)) out[y][x] = 9;
  }
  const SKIN = '#f2c79a', SKD = '#d39a6a';
  const COL = {1:SKIN, 2:'#4a2e1a', 3:bot.c, 4:SKD, 5:it.shoes.c || '#f5f1e6', 6:SKIN, 7:SKIN, 8:SKIN, 9:'#0d1230', 10:SKIN, 11:SKD, 12:SKIN,
    20:'#ff5d5d', 21:'#f5f1e6', 22:'#8a5a2b', 23:'#ffd23f', 24:'#ff3b5c', 25:'#111111', 26:'#4fc3ff', 27:'#f5f1e6', 28:'#e0a800', 29:'#c0392b', 30:'#4a2e1a', 31:'#4fc3ff', 32:'#3a3f5c', 33:'#bfe3ff'};
  const isTee = top.v.startsWith('tee'), isLong = top.v.startsWith('pull') || top.v === 'coat';
  if (isTee || isLong){ COL[6] = COL[7] = top.c; COL[4] = shade(top.c, .85); }
  if (isLong) COL[8] = top.c;
  if (bot.v.startsWith('pant') || bot.v === 'stripe'){ COL[10] = bot.c; COL[11] = shade(bot.c); }
  COL[34] = '#7a2b2b'; COL[35] = '#f5f1e6'; COL[36] = '#b98a7a';
  let r = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[y][x]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${COL[out[y][x]]}"/>`;
  if (tier === 'S'){   // S : éclats qui brillent de temps en temps
    const spk = (x, y, d) => `<g class="spk" style="animation-delay:${d}s"><rect x="${x}" y="${y-1}" width="1" height="3" fill="#ffd23f"/><rect x="${x-1}" y="${y}" width="3" height="1" fill="#ffd23f"/></g>`;
    r += spk(3, 4, 0) + spk(28, 9, 1.3) + spk(4, 26, 2.6) + (pose ? spk(27, 22, .4) + spk(2, 14, .9) : '');
  }
  return `<div class="avatar"><svg width="${px}" height="${px*H/W}" viewBox="0 0 ${W} ${H}">${r}</svg></div>`;
}
let wardOpen = false;
document.addEventListener('toggle', e => {
  const id = e.target.id || '';
  if (id === 'wardrobe') wardOpen = e.target.open;
  if (id.startsWith('fold-')){ S.fold = S.fold || {}; S.fold[id.slice(5)] = e.target.open; save(); }
}, true);
function wardrobeWin(){
  const o = Object.assign({}, OUTFIT0, S.outfit);
  const sw = (part, it) => {
    if (!unlocked(it)) return `<div class="sw lock" title="${it.label}"><span class="ttl" style="font-size:7px">🔒 NIV ${it.lvl}</span><span class="small">${it.label}</span></div>`;
    const on = wItem(part, o[part]).v === it.v;
    const v = on && it.lvl && OUTFIT0[part] !== it.v ? OUTFIT0[part] : it.v;   // retoucher une récompense portée = l'enlever
    return `<button class="sw ${on?'on':''}" data-act="outfit" data-part="${part}" data-v="${v}" title="${it.label}" aria-label="${it.label}">${avatarSVG(2, 34, Object.assign({}, o, {[part]: it.v}))}</button>`;
  };
  const grp = (part, prefix, title) => `<div class="small muted">${title}</div><div class="row wrap" style="gap:6px">${WARDROBE[part].filter(i => !i.lvl && i.v.startsWith(prefix)).map(i => sw(part, i)).join('')}</div>`;
  const rew = `<div class="small muted">Récompenses de niveau</div><div class="row wrap" style="gap:6px">${REWARDS.map(i => sw(i.part, i)).join('')}</div>`;
  const next = REWARDS.find(i => !unlocked(i));
  return `<details class="win flat" id="wardrobe" ${wardOpen?'open':''}><summary>Garde-robe${next ? ` · prochaine récompense au niveau ${next.lvl}` : ''}</summary><div class="col" style="gap:8px">
    ${rew}${grp('beard','','Pilosité')}${grp('face','','Lunettes')}${grp('shoes','','Chaussures')}${grp('top','none','Haut')}${grp('top','tee','T-shirts')}${grp('top','pull','Pulls')}${grp('bottom','short','Shorts')}${grp('bottom','pant','Pantalons')}</div></details>`;
}

/* ================= Composants ================= */
const bar = (p, c) => `<div class="bar" style="--c:var(--${c})"><b style="width:${Math.max(0,Math.min(100,Math.round(p*100)))}%"></b></div>`;
const theme = () => 'pixel';   // un seul thème : Pixel 16 bits
const ico = k => `<div class="ico" style="--c:var(--${k})">${STATS.find(s=>s.k===k).abbr}</div>`;
function applyTheme(){ document.documentElement.dataset.theme = 'pixel'; }
const check = (done, act, data='') => act
  ? `<button class="check ${done?'done':''}" data-act="${act}" ${data} aria-label="cocher">${done?'✓':''}</button>`
  : `<div class="check ${done?'done':''}">${done?'✓':''}</div>`;
function statHead(k, snap){
  const s = STATS.find(x => x.k === k), l = snap.lv[k];
  return `<a class="back" href="#fiche">‹ Fiche</a>
  <div class="row">${ico(k)}<div class="grow"><div class="ttl big">${s.name} · Niv. ${l.lvl}</div>
  <div class="num" style="font-size:22px;color:var(--${k})">${l.xp} XP au total</div><div class="num muted" style="font-size:19px">${l.into} / ${l.cost} XP vers le niveau ${l.lvl+1}</div></div></div>${bar(l.into/l.cost, k)}`;
}
function journal(k, snap, n=12){
  const ev = snap.ev.filter(e => e.stat === k).sort((a,b) => b.date.localeCompare(a.date)).slice(0, n);
  if (!ev.length) return `<div class="muted small">Rien pour l'instant. Chaque action réelle apparaîtra ici avec son XP.</div>`;
  return `<div class="log">${ev.map(e => `<div><span class="d">${shortDate(e.date)}</span><span class="grow">${esc(e.label)}</span><span class="xp">+${e.xp}</span></div>`).join('')}</div>`;
}

/* ================= Séance ================= */
function nextPos(){
  const ws = [...S.workouts].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return ws.length ? (ws[ws.length-1].pos + 1) % CYCLE.length : 0;
}
function lastOf(id){
  for (let i = S.workouts.length-1; i >= 0; i--) if (S.workouts[i].ex[id]) return S.workouts[i].ex[id];
  return null;
}
function ensureCur(){
  if (S.cur) return S.cur;
  const pos = nextPos(); const type = CYCLE[pos];
  S.cur = {date: today(), pos, type, ex:{}, run:[false,false]};
  for (const [id,,sets] of PROGRAM[type].ex) S.cur.ex[id] = {kg: S.loads[id] ?? null, sets: Array(sets).fill(0)};
  return S.cur;
}
function setCurType(type){
  const pos = CYCLE.indexOf(type) === -1 ? 0 : (type === 'L' ? (nextPos() === 3 ? 3 : 1) : CYCLE.indexOf(type));
  S.cur = null; ensureCur(); S.cur.type = type; S.cur.pos = pos; S.cur.ex = {};
  for (const [id,,sets] of PROGRAM[type].ex) S.cur.ex[id] = {kg: S.loads[id] ?? null, sets: Array(sets).fill(0)};
}
function finishSession(){
  const c = S.cur; if (!c) return;
  const ex = {};
  for (const id in c.ex){ const e = c.ex[id]; if (e.sets.some(x => x)) ex[id] = {kg: Number(e.kg)||0, sets: e.sets}; }
  if (!Object.keys(ex).length){ toast('Valide au moins un exercice'); return; }
  const w = {id: uid(), date: c.date, type: c.type, pos: c.pos, ex, run: c.run};
  S.workouts.push(w);
  for (const id in ex){
    const def = EXN[id];
    S.loads[id] = ex[id].kg;   // la prochaine séance reprend la dernière charge saisie
  }
  S.rest = S.rest.filter(d => d !== c.date);
  S.cur = null;
  return w;
}
const doneToday = () => S.workouts.find(w => w.date === today());

/* ================= Écrans ================= */
// Sur Quêtes et Fiche, la liste défile dans sa propre zone (85 % du haut de l'écran)
const scroller = () => document.body.classList.contains('has-scene') ? (document.querySelector('.pane-scroll') || document.getElementById('app')) : (document.scrollingElement || document.documentElement);
function dailyDone(t = today()){
  const w = S.workouts.some(x => x.date === t), rest = S.rest.includes(t);
  const pagesT = S.pages.filter(p => p.date === t).reduce((a,p) => a + p.n, 0);
  return [w || rest, (S.pomo[t] || 0) >= 2, pagesT >= RULES.objectifPages, S.puzzles.some(p => p.date === t), !!(S.grade || {})[t]].filter(Boolean).length;
}
/* ---- Le monde : ciel, paysage du jour (Quêtes), demeure (Fiche) ---- */
let worldMood = null;
function drawWorld(r, snap){
  const mood = skyMood(); worldMood = mood;
  document.body.dataset.sky = mood;
  const box = document.getElementById('scene'); if (!box) return;
  const show = r === 'jour' || r === 'fiche';
  const nav = document.getElementById('tabs'); if (nav) document.body.style.setProperty('--nav', nav.offsetHeight + 'px');
  if (!show){ box.innerHTML = ''; return; }
  const W = r === 'jour' ? Math.min(190, Math.round(Math.min(innerWidth, 560) / 3)) : Math.min(280, Math.round(Math.min(innerWidth, 560) / 2)), H = r === 'jour' ? 64 : 76, LIFT = 0;
  box.className = r === 'jour' ? 'land' : 'home';
  box.innerHTML = `<canvas width="${W}" height="${H}"></canvas><div class="sc-over"></div>`;
  const cv = box.querySelector('canvas'), over = box.querySelector('.sc-over');
  document.body.style.setProperty('--sh', Math.round(box.clientWidth * H / W) + 'px');
  box.style.setProperty('--sk0', SKY[mood][0]);
  if (r === 'jour'){
    const w = landscape(cv, today(), mood, LIFT), n = dailyDone(), GH = H - LIFT;
    const fx = Math.round(w.fireX * W);
    if (w.fire) drawFire(cv.getContext('2d'), fx, GH - 4, 0);
    const scale = box.clientWidth / W;
    const avX = w.fire ? (fx - 14) * scale : box.clientWidth * .44;
    const avW = Math.min(70, box.clientWidth * .13), avB = Math.round((LIFT + 2) * scale), bubRight = avX + avW + 150 > box.clientWidth;
    over.innerHTML = `<div class="sc-av" style="left:${Math.round(avX)}px;bottom:${avB}px">${avatarSVG(stageOf(snap.lv.for.lvl), 44)}</div>
      ${w.fire && mood !== 'jour' ? `<div class="sc-glow" style="left:${Math.round(fx * scale)}px"></div>` : ''}
      <div class="sc-bub ${bubRight ? 'to-l' : 'to-r'}" style="bottom:${avB + Math.round(avW * .55)}px;${bubRight ? `right:${Math.round(box.clientWidth - avX + 6)}px` : `left:${Math.round(avX + avW + 6)}px`}">${esc(bubbleLine(w, n, 5, mood === 'nuit', S.name))}</div>
      <div class="sc-place">${BIOMES[w.biome].name}${w.castle ? ' · château en vue' : ''}${w.river ? ' · rivière' : ''}</div>`;
    clearInterval(drawWorld.fire);
    if (w.fire) { let t = 0; drawWorld.fire = setInterval(() => { if (!document.hidden && document.contains(cv)) drawFire(cv.getContext('2d'), fx, GH - 4, ++t); }, 450); }
  } else {
    clearInterval(drawWorld.fire);
    const st = homeScene(cv, snap.perso, mood);
    // La liste de la Fiche descend jusqu'au toit de la demeure (le flou fin est juste au-dessus)
    document.body.style.setProperty('--sh', Math.round(box.clientWidth / W * (14 + HOME_H[st] + 3)) + 'px');
    over.innerHTML = `<div class="sc-place">Ta demeure : ${HOMES[st]}${st < 5 ? ` · ${HOMES[st+1].toLowerCase()} au niv. ${(st+1)*2}` : ''}</div>`;
  }
}
// Le ciel change même sans toucher l'écran (aube, jour, crépuscule, nuit)
// Redessine quand la page a fini de charger (polices, styles) ou quand l'écran tourne
['load','resize','orientationchange'].forEach(ev => window.addEventListener(ev, () => drawWorld(route(), snapshot())));
setInterval(() => { if (document.hidden) return; if (skyMood() !== worldMood) render(); else drawWorld(route(), snapshot()); }, 60000);   // le soleil avance chaque minute
function viewJour(snap){
  const t = today();
  const w = doneToday(), rest = S.rest.includes(t);
  const type = S.cur && S.cur.date === t ? S.cur.type : CYCLE[nextPos()];
  const pagesT = S.pages.filter(p => p.date === t).reduce((a,p) => a + p.n, 0);
  const puzT = S.puzzles.filter(p => p.date === t).length;
  const kc = S.kcal[t] || '';
  const pomo = S.pomo[t] || 0;
  const book = S.books.find(b => !b.done);
  const q = (k, done, title, meta, xp, extra='') => `<div class="quest ${done?'dn':''}">
     ${check(done)}<div class="grow col"><div class="row"><span class="grow qt name">${title}</span><span class="xp">${xp}</span></div>
     ${meta ? `<div class="muted small">${meta}</div>` : ''}${extra}</div></div>`;

  const tq = (S.tquests || []).find(x => x.date === t);
  const qPerso = tq ? `<div class="quest ${tq.done?'dn':''}">${check(!!tq.done,'tqDone',`data-id="${tq.id}"`)}<div class="grow col">
     <div class="row"><span class="grow qt name">${esc(tq.text)}</span><span class="xp">+${RULES.queteDemain}</span></div>
     <div class="row"><span class="chip" style="background:var(--${tq.stat})">${STATS.find(x=>x.k===tq.stat).abbr}</span><span class="muted small">${tq.at ? `Écrite hier à ${new Date(tq.at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}` : 'Ta quête, écrite hier'}</span></div></div></div>` : '';
  const retour = retourToday() ? `<div class="banner">★ QUÊTE RETOUR ★<br>Bon retour ! Toute l'XP gagnée aujourd'hui compte double.</div>` : '';

  const qSeance = w
    ? q('for', true, `Séance ${PROGRAM[w.type].name}`, 'Terminée', `+${RULES.seance}`)
    : rest
      ? q('for', true, 'Repos prévu', 'La récupération fait partie du programme.', '', `<div><button class="btn sm ghost" data-act="unrest">Annuler le repos</button></div>`)
      : q('for', false, `Séance ${PROGRAM[type].name}`, `${PROGRAM[type].ex.length} exercices · 10 min de course avant et après`, `+${RULES.seance}`,
          `<div class="row wrap"><a class="btn sm pri" href="#force">Ouvrir la séance</a><button class="btn sm ghost" data-act="rest">Repos prévu</button></div>`);

  const qRev = q('sav', pomo >= 2, '2 × 25 min de révision', `${pomo} × 25 min aujourd'hui · +${RULES.pomo} XP par bloc, + les étapes de cours`, `+${2*RULES.pomo}`, pomoRow(pomo));

  const qLect = q('sag', pagesT >= RULES.objectifPages, `${RULES.objectifPages} pages de lecture`,
     book ? `${esc(book.title)} · ${pagesT} page${pagesT>1?'s':''} aujourd'hui` : 'Aucun livre en cours', `+${RULES.objectifPages}`,
     book ? `<div class="row wrap"><button class="btn sm" data-act="pages" data-n="10">+10 pages</button><input class="mid" type="number" inputmode="numeric" min="1" placeholder="autre" data-in="pagesq"><button class="btn sm" data-act="pagesq">OK</button></div>`
          : `<div><a class="btn sm" href="#sagesse">Ajouter un livre</a></div>`);

  const qPuz = q('str', puzT >= 1, '10 puzzles d\'échecs', `${puzT*10} puzzles aujourd'hui`, `+${RULES.puzzles}`,
     `<div class="row wrap"><button class="btn sm" data-act="puz">+ 1 série de 10</button>${puzT ? `<button class="btn sm ghost" data-act="unpuz">− annuler</button>` : ''}</div>`);

  const gT = (S.grade || {})[t];
  const qKcal = q('vit', !!gT, 'Ravitaillement', `Note la qualité de ce que tu as mangé · rang actuel : ${tierTxt(snap.tier)}`, gT ? `${gT} ${emo(gT)}` : '',
     `${gradeRow(t)}<div class="row"><input class="mid" type="number" inputmode="numeric" min="0" step="50" placeholder="total" value="${kc}" data-in="kcal"><span class="muted">kcal</span></div>`);

  const nDone = [!!(w || rest), pomo >= 2, pagesT >= RULES.objectifPages, puzT >= 1, !!gT].filter(Boolean).length;
  return `<div class="pane-head"><div class="row"><div class="grow"><div class="ttl big">Quêtes</div><div class="muted">${longDate(t)}</div></div>
     <div class="center"><div class="num big" style="color:var(--accent)">+${snap.todayXP} XP</div><div class="muted small">aujourd'hui</div></div></div></div>
   <div class="pane-scroll"><div class="pane-inner">
   ${retour}
   ${fold('daily', `QUÊTES QUOTIDIENNES · ${nDone}/5`, `${qSeance}${qRev}${qLect}${qPuz}${qKcal}`)}
   ${fold('demain', `QUÊTE DU LENDEMAIN${tq ? ` · ${tq.done ? 1 : 0}/1` : ''}`, `${qPerso}${tomorrowWin()}`)}
   ${fold('main', `QUÊTES PRINCIPALES${mqCount('main')}`, mqList('main'))}
   ${fold('side', `QUÊTES SECONDAIRES${mqCount('side')}`, mqList('side'))}
   ${weekWin()}</div></div>`;
}
// Section repliable (toucher le titre ouvre / ferme), état mémorisé
function fold(id, title, body){
  const open = (S.fold || {})[id] !== false;
  return `<details class="win fold" id="fold-${id}" ${open ? 'open' : ''}><summary class="ttl">${title}</summary><div class="col" style="gap:8px;margin-top:6px">${body}</div></details>`;
}
function mqCount(type){ const l = (S.mquests || []).filter(q => q.type === type); return l.length ? ` · ${l.filter(q => q.done).length}/${l.length}` : ''; }
function mqList(type){
  const l = (S.mquests || []).filter(q => q.type === type);
  const items = l.map(q => `<div class="quest ${q.done?'dn':''}">${check(!!q.done, 'mqDone', `data-id="${q.id}"`)}<div class="grow col">
     <div class="row"><span class="grow qt name">${esc(q.text)}</span>${q.xp ? `<span class="xp">+${q.xp}</span>` : ''}</div>
     <div class="row">${q.stat ? `<span class="chip" style="background:var(--${q.stat})">${STATS.find(x=>x.k===q.stat).abbr}</span>` : ''}<span class="grow muted small">${q.done ? `Réussie le ${shortDate(q.done)}` : ''}</span><button class="btn sm ghost" data-act="mqDel" data-id="${q.id}">×</button></div></div></div>`).join('');
  return `${items || `<div class="muted small">Aucune quête pour l'instant.</div>`}
    <div class="win flat col"><input placeholder="Nouvelle quête ${type === 'main' ? 'principale' : 'secondaire'}" data-in="mq-${type}" maxlength="120">
    <div class="row"><select data-in="mqs-${type}" class="sel">${STATS.filter(x => x.k !== 'vit').map(x => `<option value="${x.k}">${x.name}</option>`).join('')}</select>
    <input class="mid" type="number" inputmode="numeric" min="1" max="100" step="5" placeholder="XP" data-in="mqx-${type}"><span class="muted">XP</span>
    <button class="btn sm" data-act="mqAdd" data-t="${type}">Créer</button></div></div>`;
}
function gradeRow(d){
  const g = (S.grade || {})[d];
  return `<div class="row wrap">${GRADES.map(x => `<button class="btn sm grade ${g===x?'pri':''}" data-act="grade" data-d="${d}" data-g="${x}">${x} ${emo(x)}</button>`).join('')}</div>`;
}
function tomorrowWin(){
  const d = addDays(today(), 1), tq = (S.tquests || []).find(x => x.date === d);
  if (tq) return `<div class="win flat"><div class="ttl" style="font-size:9px;color:var(--accent)">QUÊTE DE DEMAIN</div>
    <div class="row"><span class="chip" style="background:var(--${tq.stat})">${STATS.find(x=>x.k===tq.stat).abbr}</span><span class="grow name">${esc(tq.text)}</span><span class="xp">+${RULES.queteDemain}</span></div>
    <button class="btn sm ghost" data-act="tqDel" data-id="${tq.id}">Modifier / supprimer</button></div>`;
  return `<div class="win flat col"><div class="ttl" style="font-size:9px;color:var(--accent)">ÉCRIRE LA QUÊTE DE DEMAIN</div>
    <div class="muted small">Une tâche précise pour demain. Réussie demain : +${RULES.queteDemain} XP dans la stat choisie.</div>
    <input placeholder="Ex. lire 100 pages de Karamazov" data-in="tqtext" maxlength="120">
    <div class="row"><select data-in="tqstat" class="sel">${STATS.filter(x => x.k !== 'vit').map(x => `<option value="${x.k}">${x.name}</option>`).join('')}</select>
    <button class="btn" data-act="tqAdd">Créer</button></div></div>`;
}
function weekWin(){
  const wk = weekKey(today()); const n = S.workouts.filter(w => weekKey(w.date) === wk).length;
  return `<div class="win flat row"><div class="grow"><div class="qt">Cette semaine</div><div class="muted small">Muscu ${Math.min(n,4)}/4 séances · la 4e donne +${RULES.semaine4} XP bonus</div></div><span class="ttl big">${Math.min(n,4)}/4</span></div>`;
}

function viewFiche(snap){
  const st = stageOf(snap.lv.for.lvl);
  const rows = STATS.map(s => {
    const l = snap.lv[s.k];
    if (s.k === 'vit'){ const ka = kcalAvg();
      return `<a href="#${s.page}" class="row stat-link" style="color:inherit;text-decoration:none;padding:6px 0">${ico(s.k)}
      <div class="grow col" style="gap:4px"><div class="row"><span class="grow name" style="font-weight:500">${s.name}</span><span class="ttl" style="color:var(--${s.k})">${tierTxt(snap.tier)}</span></div>
      <div class="row muted small"><span class="grow">${s.sub} · moyenne 30 jours</span><span class="num" style="font-size:17px">${ka ? ka.avg + ' kcal/j' : '— kcal/j'}</span></div></div></a>`; }
    const eloV = s.k === 'str' && S.elo.length ? ` · Elo ${S.elo[S.elo.length-1].v}` : '';
    return `<a href="#${s.page}" class="row stat-link" style="color:inherit;text-decoration:none;padding:6px 0">${ico(s.k)}
      <div class="grow col" style="gap:4px"><div class="row"><span class="grow name" style="font-weight:500">${s.name}</span><span class="num" style="color:var(--${s.k});font-size:19px">${l.xp} XP</span><span class="ttl" style="color:var(--${s.k})">NIV ${l.lvl}</span></div>
      ${bar(l.into/l.cost, s.k)}<div class="row muted small"><span class="grow">${s.sub}${eloV}</span><span class="num" style="font-size:17px">niv. ${l.lvl+1} : ${l.into}/${l.cost}</span></div></div></a>`;
  }).join('');
  return `<div class="pane-head"><div class="win row" style="gap:14px"><div id="hero">${avatarSVG(st, 72)}</div>
     <div class="grow col"><div class="ttl xl">${esc(S.name)}</div><div class="muted small">Stade ${st+1}/6 · ${STAGES[st]}</div>
     <div class="row wrap"><span class="ttl" style="white-space:nowrap">NIV. ${snap.perso} · ${tierTxt(snap.tier)}</span></div></div></div>
   ${wardrobeWin()}</div>
   <div class="pane-scroll"><div class="pane-inner"><div class="win"><div class="ttl" style="color:var(--accent)">ATTRIBUTS</div>${rows}</div>
   ${weekWin()}
   <a class="btn ghost" href="#reglages" style="text-align:center;text-decoration:none">Sauvegarde et réglages</a></div></div>`;
}

function viewForce(snap){
  const t = today(), st = stageOf(snap.lv.for.lvl), lvl = snap.lv.for.lvl;
  const nextStage = st < 5 ? `Stade suivant au niveau ${STAGE_LVL[st+1]} de Force` : 'Stade maximal atteint';
  const av = `<div class="win center" style="align-items:center">${avatarSVG(st, 120)}
     <div><div class="ttl">Stade ${st+1}/6 · ${STAGES[st]}</div><div class="muted small">${nextStage}</div></div>
     <div class="stages" style="width:100%">${STAGES.map((n,i) => `<div class="${i===st?'on':i<st?'past':''}">${avatarSVG(i, 34)}<span>${n}</span><span class="muted">N${STAGE_LVL[i]}</span></div>`).join('')}</div></div>`;

  const w = doneToday();
  let sess;
  if (w && !S.cur){
    sess = `<div class="sec">Séance du jour · ${PROGRAM[w.type].name}</div><div class="win flat">
      <div class="ttl" style="color:var(--vit)">SÉANCE TERMINÉE · +${RULES.seance} XP</div>
      ${Object.entries(w.ex).map(([id,e]) => `<div class="row small"><span class="grow">${esc(EXN[id][1])}</span><span class="num">${EXN[id][4]==='sec'?'':kgTxt(e.kg)+' kg'} ${e.sets.map(x=>x===1?'■':x===2?'×':'□').join('')}</span></div>`).join('')}
      <button class="btn sm ghost" data-act="undoWorkout">Annuler cette séance</button></div>`;
  } else {
    const c = S.cur || {type: CYCLE[nextPos()], date:t, ex:null, run:[false,false]};
    const exs = PROGRAM[c.type].ex.map(([id,name,n,reps,kind]) => {
      const e = c.ex ? c.ex[id] : {kg: S.loads[id] ?? null, sets: Array(n).fill(0)};
      const last = lastOf(id);
      let hint = '';
      if (last && kind !== 'sec') hint = `<span class="muted small">Dernière fois : ${kgTxt(last.kg)} kg${allSuccess(last) ? ', tout réussi' : ', pas tout réussi'}</span>`;
      else if (kind !== 'sec' && e.kg == null) hint = `<span class="muted small">Première fois : note la charge utilisée</span>`;
      const unit = kind === 'sec' ? `${reps} s` : `× ${reps}`;
      const kgIn = kind === 'sec' ? '' : `<input class="kg" type="number" inputmode="decimal" step="0.5" min="0" placeholder="${kind==='lest'?'lest':'kg'}" value="${e.kg ?? ''}" data-in="kg" data-id="${id}"><span class="muted">kg</span>`;
      return `<div class="ex"><div class="row"><span class="grow name">${esc(name)}</span>${kgIn}</div>
        <div class="row">${(() => { const st = e.sets.every(x => x === 1) ? 'ok' : e.sets.some(x => x === 2) ? 'ko' : '';
          return `<button class="btn grow ${st==='ok'?'pri':''}" data-act="exOk" data-id="${id}">${st==='ok' ? '✓ ' : ''}${n} ${unit} ${st==='ok' ? 'validé' : '· valider'}</button>
          <button class="btn sm ${st==='ko'?'danger':'ghost'}" data-act="exKo" data-id="${id}">${st==='ko' ? 'Raté ✓' : 'Raté'}</button>`; })()}</div>
        ${hint}</div>`;
    }).join('');
    const types = ['A','L','B'].map(k => `<button class="btn sm ${k===c.type?'pri':''}" data-act="type" data-t="${k}">${PROGRAM[k].name}</button>`).join('');
    sess = `<div class="sec">Séance du jour · ${PROGRAM[c.type].name}${c.date !== t ? ` (commencée le ${shortDate(c.date)})` : ''}</div>
     <div class="seg">${types}</div>
     <div class="win flat">
      <div class="row">${check(c.run[0],'run','data-i="0"')}<span class="grow">10 min de course (échauffement)</span></div>
      <div class="muted small">La charge reprend ta dernière saisie : change-la si tu veux augmenter. « Valider » = toutes les séries réussies. « Raté » = fait, mais pas toutes les reps (ne compte pas pour un record).</div>
      ${exs}
      <div class="row">${check(c.run[1],'run','data-i="1"')}<span class="grow">10 min de course (retour au calme)</span></div>
      <button class="btn pri" data-act="finish">Terminer la séance · +${RULES.seance} XP</button>
      ${S.cur ? `<button class="btn sm ghost" data-act="abandon">Effacer la séance en cours</button>` : ''}
     </div>`;
  }
  return `${statHead('for', snap)}${av}${sess}
   <details><summary>Mes charges</summary><div class="win flat">${chargesTable()}</div></details>
   <div class="sec">Journal Force</div><div class="win flat">${journal('for', snap)}</div>`;
}
function chargesTable(){
  return ['A','L','B'].map(t => `<div class="ttl" style="font-size:9px;color:var(--accent)">${PROGRAM[t].name}</div>` +
    PROGRAM[t].ex.filter(e => e[4] !== 'sec').map(([id,name]) => `<div class="row" style="padding:4px 0"><span class="grow small">${esc(name)}</span>
      <input class="kg" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" value="${S.loads[id] ?? ''}" data-in="load" data-id="${id}"></div>`).join('')).join('') +
    `<div class="muted small">Charge proposée à la prochaine séance. Elle se met à jour toute seule après chaque séance.</div>`;
}

function pomoRow(pomo, link=true){
  return `<div class="row wrap">${check(pomo>=1,'pomo','data-n="1"')}${check(pomo>=2,'pomo','data-n="2"')}<button class="btn sm" data-act="pomoPlus">+25 min</button>${pomo>2?`<button class="btn sm ghost" data-act="pomoMinus">−</button>`:''}${link?'<a class="link" href="#savoir">Mes cours ›</a>':''}</div>`;
}
function folderStats(fid){
  // cours maîtrisés / total, sous-dossiers compris
  let tot = 0, done = 0;
  const walk = id => { S.courses.filter(c => (c.folder || null) === id).forEach(c => { tot++; if (c.steps.rev) done++; });
    S.folders.filter(f => f.parent === id).forEach(f => walk(f.id)); };
  walk(fid); return {tot, done};
}
function viewSavoir(snap, arg){
  const t = today();
  const fid = arg && S.folders.some(f => f.id === arg) ? arg : null;
  const STEPS = [['lu','LU'],['fiche','APPRIS'],['quiz','QUIZ'],['rev','MAÎTRISÉ']];
  // fil d'Ariane
  const path = []; for (let f = S.folders.find(x => x.id === fid); f; f = S.folders.find(x => x.id === f.parent)) path.unshift(f);
  const crumbs = `<div class="row wrap" style="gap:4px"><a class="link" href="#savoir">Tous les cours</a>${path.map(f => ` <span class="muted">›</span> <a class="link" href="#savoir/${f.id}">${esc(f.name)}</a>`).join('')}</div>`;
  const folders = S.folders.filter(f => f.parent === fid).sort((a,b) => a.name.localeCompare(b.name, 'fr')).map(f => { const st = folderStats(f.id);
    return `<div class="ex"><div class="row"><a href="#savoir/${f.id}" class="row grow" style="color:inherit;text-decoration:none"><span class="ttl" style="color:var(--sav)">▣</span><span class="grow name">${esc(f.name)}</span><span class="num muted">${st.done}/${st.tot}</span><span class="ttl">›</span></a></div></div>`; }).join('');
  const courses = S.courses.filter(c => (c.folder || null) === fid).map(c => {
    const steps = STEPS.map(([k,l]) => `<button class="step ${c.steps[k]?'on':''}" data-act="step" data-id="${c.id}" data-k="${k}">${l}</button>`).join('');
    const n = Object.values(c.steps).filter(Boolean).length;
    return `<div class="ex"><div class="row" style="align-items:flex-start"><span class="grow name">${esc(c.name)}</span><span class="num muted">${n}/4</span></div>
      <div class="steps">${steps}</div>
      <div class="row">${c.url ? `<a class="link" href="${esc(c.url)}" target="_blank" rel="noopener">Ouvrir le cours ↗</a>` : `<span class="muted small">Pas de lien</span>`}<span class="grow"></span><button class="btn sm ghost" data-act="delCourse" data-id="${c.id}">Suppr.</button></div></div>`;
  }).join('');
  const here = fid ? S.folders.find(f => f.id === fid).name : 'Tous les cours';
  const exams = S.exams.map(x => `<div class="row" style="padding:6px 0"><span class="grow name">${esc(x.name)}</span>
     ${x.passed ? `<span class="chip">RÉUSSI ${shortDate(x.passed)}</span><button class="btn sm ghost" data-act="examUndo" data-id="${x.id}">↺</button>`
                : `<button class="btn sm" data-act="examOk" data-id="${x.id}">Réussi · +${RULES.examen}</button><button class="btn sm ghost" data-act="delExam" data-id="${x.id}">×</button>`}</div>`).join('');
  const pomo = S.pomo[t] || 0;
  return `${statHead('sav', snap)}
   <div class="win flat"><div class="qt">Révision aujourd'hui · ${pomo} × 25 min</div><div class="muted small">+${RULES.pomo} XP par bloc de 25 min</div>${pomoRow(pomo, false)}</div>
   <div class="sec">Mes cours · ${RULES.etapeCours} XP par étape</div>
   ${crumbs}
   <div class="win flat">${folders + courses || '<div class="muted small">Dossier vide. Ajoute un dossier ou un cours ci-dessous.</div>'}
     ${fid ? `<button class="btn sm danger" data-act="delFolder" data-id="${fid}">Supprimer le dossier « ${esc(here)} »</button>` : ''}</div>
   <div class="win flat col"><div class="ttl" style="font-size:9px">NOUVEAU DOSSIER DANS « ${esc(here).toUpperCase()} »</div>
     <div class="row"><input placeholder="Nom du dossier" data-in="fname"><button class="btn sm" data-act="addFolder" data-f="${fid || ''}">Créer</button></div></div>
   <div class="win flat col"><div class="ttl" style="font-size:9px">NOUVEAU COURS DANS « ${esc(here).toUpperCase()} »</div>
     <input placeholder="Nom du cours (ex. Cardio · Insuffisance cardiaque)" data-in="cname">
     <input type="url" placeholder="Lien du fichier (iCloud, Drive…) facultatif" data-in="curl">
     <button class="btn" data-act="addCourse" data-f="${fid || ''}">Ajouter</button></div>
   <div class="sec">Examens · +${RULES.examen} XP si réussi</div>
   <div class="win flat">${exams || '<div class="muted small">Aucun examen.</div>'}
     <div class="row"><input placeholder="Nom de l'examen" data-in="ename"><button class="btn sm" data-act="addExam">+</button></div></div>
   <div class="sec">Journal Savoir</div><div class="win flat">${journal('sav', snap)}</div>`;
}

function viewSagesse(snap){
  const t = today();
  const cur = S.books.filter(b => !b.done), fin = S.books.filter(b => b.done);
  const readOf = id => S.pages.filter(p => p.book === id).reduce((a,p) => a + p.n, 0);
  const todayLogs = S.pages.filter(p => p.date === t);
  const books = cur.map(b => { const r = readOf(b.id); return `<div class="ex"><div class="row"><span class="grow name">${esc(b.title)}</span><span class="num muted">${r}${b.total ? '/'+b.total : ''} p.</span></div>
     ${b.total ? bar(r/b.total, 'sag') : ''}
     <div class="row wrap"><button class="btn sm" data-act="pages" data-n="10" data-id="${b.id}">+10</button>
     <input class="mid" type="number" inputmode="numeric" min="1" placeholder="pages" data-in="pg-${b.id}"><button class="btn sm" data-act="pagesq" data-id="${b.id}">OK</button>
     <button class="btn sm pri" data-act="finishBook" data-id="${b.id}">Fini · +${RULES.livre}</button></div></div>`; }).join('');
  return `${statHead('sag', snap)}
   <div class="sec">En cours · ${RULES.page} XP par page</div>
   <div class="win flat">${books || '<div class="muted small">Aucun livre en cours.</div>'}</div>
   ${todayLogs.length ? `<div class="win flat"><div class="ttl" style="font-size:9px">AUJOURD'HUI</div>${todayLogs.map(p => `<div class="row small"><span class="grow">${p.n} pages · ${esc((S.books.find(b=>b.id===p.book)||{}).title||'')}</span><button class="btn sm ghost" data-act="delPages" data-id="${p.id}">×</button></div>`).join('')}</div>` : ''}
   <div class="win flat col"><div class="ttl" style="font-size:9px">AJOUTER UN LIVRE</div>
     <input placeholder="Titre" data-in="btitle"><input type="number" inputmode="numeric" placeholder="Nombre de pages (facultatif)" data-in="btotal">
     <button class="btn" data-act="addBook">Ajouter</button></div>
   ${fin.length ? `<div class="sec">Livres finis · ${fin.length}</div><div class="win flat">${fin.map(b => `<div class="row small"><span class="grow">${esc(b.title)}</span><span class="num muted">${shortDate(b.done)}</span><button class="btn sm ghost" data-act="unfinishBook" data-id="${b.id}">↺</button></div>`).join('')}</div>` : ''}
   <div class="sec">Journal Sagesse</div><div class="win flat">${journal('sag', snap)}</div>`;
}

function viewStrategie(snap){
  const t = today(), puzT = S.puzzles.filter(p => p.date === t).length;
  const elo = S.elo.length ? S.elo[S.elo.length-1].v : null;
  const hist = S.elo.slice(-8).reverse();
  return `${statHead('str', snap)}
   <div class="win center" style="align-items:center"><div class="muted small">Elo rapide</div><div class="num big" style="font-size:44px;color:var(--str)">${elo ?? '—'}</div>
     <div class="row"><input class="mid" type="number" inputmode="numeric" placeholder="nouvel Elo" data-in="elo"><button class="btn sm" data-act="elo">Mettre à jour</button></div></div>
   <div class="win flat row"><div class="grow"><div class="qt">Puzzles aujourd'hui</div><div class="muted small">${puzT*10} puzzles · +${RULES.puzzles} XP par série de 10</div></div>
     <button class="btn sm pri" data-act="puz">+10</button>${puzT ? `<button class="btn sm ghost" data-act="unpuz">−</button>` : ''}</div>
   ${hist.length ? `<div class="sec">Historique Elo</div><div class="win flat log">${hist.map(e => `<div><span class="d">${shortDate(e.date)}</span><span class="grow num">${e.v}</span></div>`).join('')}</div>` : ''}
   <div class="sec">Journal Stratégie</div><div class="win flat">${journal('str', snap)}</div>`;
}

function viewVitalite(snap){
  const t = today(), kc = S.kcal[t] || '', tr = snap.tier, ka = kcalAvg();
  const days = Array.from({length:7}, (_,i) => addDays(t, -i));
  return `<a class="back" href="#fiche">‹ Fiche</a>
   <div class="row">${ico('vit')}<div class="grow"><div class="ttl big">Ravitaillement</div>
     <div class="ttl" style="font-size:16px;color:var(--vit);margin-top:6px">${tierTxt(tr)}</div>
     <div class="muted small">${tr ? `Moyenne ${tr.avg.toFixed(2).replace('.', ',')} sur ${tr.n} jour${tr.n>1?'s':''} noté${tr.n>1?'s':''} (30 derniers jours)` : 'Note ta première journée pour obtenir un rang'}</div>
     <div class="num" style="font-size:19px">${ka ? `${ka.avg} kcal/jour en moyenne (${ka.n} j saisis)` : 'Pas encore de calories saisies'}</div></div></div>
   <div class="win"><div class="qt">Qualité du jour</div>${gradeRow(t)}
     <div class="qt" style="margin-top:8px">Total du jour</div>
     <div class="row"><input class="mid" type="number" inputmode="numeric" min="0" step="50" placeholder="kcal" value="${kc}" data-in="kcal"><span class="muted">kcal · objectif ${RULES.kcalSeuil}</span></div>
     ${bar((kc||0)/RULES.kcalSeuil, 'vit')}
     <div class="muted small">S 🥩 excellent · A 🍗 bon · B 🍝 moyen · C 🍔 mauvais. Ton rang change l'allure de ton personnage.</div></div>
   <div class="sec">7 derniers jours</div>
   <div class="win flat log">${days.map(d => { const v = S.kcal[d], g = (S.grade || {})[d]; return `<div><span class="d">${shortDate(d)}</span><span class="grow">${v ? v+' kcal' : '<span class="muted">—</span>'}</span><span class="xp">${g ? g+' '+emo(g) : ''}</span></div>`; }).join('')}</div>
   <div class="muted small">Oublié de noter hier ? Ouvre « Sauvegarde et réglages » : la saisie d'hier y est possible.</div>`;
}

function viewReglages(){
  const y = addDays(today(), -1);
  return `<a class="back" href="#fiche">‹ Fiche</a><div class="ttl big">Sauvegarde et réglages</div>
   <div class="win flat row"><div class="grow"><div class="qt">Sons</div><div class="muted small">Coupés aussi quand l'iPhone est en silencieux.</div></div>
     <button class="btn sm ${S.sound === false ? '' : 'pri'}" data-act="sound">${S.sound === false ? 'Coupés' : 'Activés'}</button></div>
   <div class="win flat col"><div class="qt">Sauvegarde</div>
     <div class="muted small">Tes données sont uniquement sur cet appareil. Exporte une sauvegarde de temps en temps (par exemple chaque dimanche) et range-la dans iCloud Drive. Elle sert aussi à passer du PC à l'iPhone.</div>
     <button class="btn" data-act="export">Exporter une sauvegarde</button>
     <label class="btn ghost center">Importer une sauvegarde<input type="file" accept=".json,application/json,text/plain" data-in="import" hidden></label></div>
   <div class="win flat col"><div class="qt">Rattraper hier (${shortDate(y)})</div>
     ${gradeRow(y)}<div class="row"><input class="mid" type="number" inputmode="numeric" placeholder="kcal" value="${S.kcal[y] || ''}" data-in="kcalY"><span class="muted">kcal</span></div>
     <div class="row wrap"><button class="btn sm" data-act="puzY">+10 puzzles hier</button></div></div>
   <div class="win flat col"><div class="qt">Nom du personnage</div><input value="${esc(S.name)}" data-in="name"></div>
   <div class="win flat col"><div class="qt">Règles actuelles</div><div class="muted small">
     Niveau n d'une stat : 100 × n XP. Niveau perso : somme des niveaux Force, Savoir, Sagesse, Stratégie ÷ 4.<br>
     Force : ${RULES.seance} XP/séance (charges gérées par toi, préremplies avec la dernière saisie), +${RULES.semaine4} à la 4e séance de la semaine, +${RULES.record} par record (charge plus lourde avec toutes les séries réussies).<br>
     Savoir : ${RULES.pomo} XP par 25 min de révision, ${RULES.etapeCours} XP par étape de cours (lu, appris, quiz, maîtrisé), +${RULES.examen} par examen. Sagesse : ${RULES.page} XP/page, +${RULES.livre} par livre.<br>
     Stratégie : ${RULES.puzzles} XP par série de 10 puzzles. Ravitaillement : pas d'XP ; rang = moyenne de tes notes C/B/A/S sur 30 jours (jours sans note ignorés), lettre la plus proche. Il change l'allure du personnage.<br>
     Quête du lendemain réussie : +${RULES.queteDemain} XP. Quêtes principales et secondaires : l'XP et l'attribut que tu choisis (1 à 100 XP). Récompenses : un objet de garde-robe par niveau perso, du 1 au 10.<br>
     Aucune pénalité. Après ${RULES.absenceRetour} jours sans rien, l'XP du jour de reprise compte double.</div></div>
   <button class="btn danger" data-act="reset">Tout effacer</button>
   <div class="muted small center">Life RPG · prototype v1.2.7</div>`;
}

/* ================= Rendu et routage ================= */
const VIEWS = {jour:viewJour, fiche:viewFiche, force:viewForce, savoir:viewSavoir, sagesse:viewSagesse, strategie:viewStrategie, vitalite:viewVitalite, reglages:viewReglages};
const TABS = [['jour','Quêtes'],['fiche','Fiche']];
let lastLevels = null;
function route(){ const r = location.hash.slice(1).split('/')[0]; return VIEWS[r] ? r : 'jour'; }
const routeArg = () => decodeURIComponent(location.hash.slice(1).split('/')[1] || '');
function render(){
  // Séance d'un jour passé jamais commencée : on l'oublie
  if (S.cur && S.cur.date !== today() && !Object.values(S.cur.ex).some(e => e.sets.some(x => x))) S.cur = null;
  applyTheme();
  const snap = snapshot(), r = route();
  persoLvl = snap.perso;
  document.body.classList.toggle('has-scene', r === 'jour' || r === 'fiche'); document.body.dataset.route = r;
  document.documentElement.classList.toggle('locked', r === 'jour' || r === 'fiche');
  const y = scroller().scrollTop;
  let html = VIEWS[r](snap, routeArg());
  if (!html.trimStart().startsWith('<a class="back"') && (r === 'force' || r === 'savoir')) html = `<a class="back" href="#fiche">‹ Fiche</a>` + html;
  document.getElementById('app').innerHTML = html;
  drawWorld(r, snap);
  const parent = {force:'fiche', savoir:'fiche', sagesse:'fiche', strategie:'fiche', vitalite:'fiche', reglages:'fiche'}[r] || r;
  document.getElementById('tabs').innerHTML = TABS.map(([k,l]) => `<a href="#${k}" class="${k===parent?'on':''}">${k===parent?'▸ ':''}${l}</a>`).join('');
  if (render.keepScroll) scroller().scrollTop = y; render.keepScroll = false;
  // Montée de niveau ?
  if (lastLevels){ for (const s of STATS) if (s.k !== 'vit' && snap.lv[s.k].lvl > lastLevels[s.k]) toast(`★ ${s.name} niveau ${snap.lv[s.k].lvl} ! ★`, 'lvl', 4000); }
  if (lastLevels && snap.perso > lastLevels.perso){
    const rw = REWARDS.filter(i => i.lvl > lastLevels.perso && i.lvl <= snap.perso).map(i => i.label).join(', ');
    toast(`★ Niveau ${snap.perso} !${rw ? ' Récompense : ' + rw : ''} ★`, 'lvl', 5000);
  }
  lastLevels = Object.fromEntries(STATS.map(s => [s.k, snap.lv[s.k].lvl])); lastLevels.perso = snap.perso;
}
function commit(){ save(); render.keepScroll = true; render(); }
/* ---- Sons choisis (voir sons.js) ---- */
const SOUND_PICK = {pixel: {quete:'A', onglet:'B', attribut:'B', niveau:'B'}};
function play(action){
  if (S.sound === false || typeof SOUNDS === 'undefined') return;
  try { const t = theme(); playSound(SOUNDS[t][action][SOUND_PICK[t][action]]); } catch {}
}
// Après une action : son de niveau si une stat ou le perso monte, sinon son de quête si de l'XP a été gagnée
function feedback(before){
  const after = snapshot();
  const up = after.perso > before.perso || STATS.some(s => after.lv[s.k].lvl > before.lv[s.k].lvl);
  const gained = Object.keys(after.tot).some(k => after.tot[k] > before.tot[k]);
  if (up) play('niveau'); else if (gained) play('quete');
}
document.addEventListener('click', e => {
  if (e.target.closest('nav.tabs a')) play('onglet');
  else if (e.target.closest('a.stat-link')) play('attribut');
}, true);
let toastT;
function toast(msg, cls='', ms=2200){
  document.querySelector('.toast')?.remove(); clearTimeout(toastT);
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = msg; document.body.appendChild(d);
  toastT = setTimeout(() => d.remove(), ms);
}
const val = name => { const el = document.querySelector(`[data-in="${name}"]`); return el ? el.value.trim() : ''; };

/* ================= Actions ================= */
const ACTS = {
  rest(){ if (!S.rest.includes(today())) S.rest.push(today()); },
  unrest(){ S.rest = S.rest.filter(d => d !== today()); },
  pomo(el){ const n = +el.dataset.n, t = today(), c = S.pomo[t] || 0; S.pomo[t] = c >= n ? n-1 : n; if (S.pomo[t] > c) toast(`+${RULES.pomo} XP Savoir`); },
  pomoPlus(){ const t = today(); S.pomo[t] = (S.pomo[t] || 0) + 1; toast(`+${RULES.pomo} XP Savoir`); },
  pomoMinus(){ const t = today(); S.pomo[t] = Math.max(0, (S.pomo[t] || 0) - 1); },
  tqAdd(){ const text = val('tqtext'); if (!text) return toast('Écris ta quête'); const d = addDays(today(), 1);
    S.tquests = (S.tquests || []).filter(x => x.date !== d); S.tquests.push({id:uid(), date:d, stat: val('tqstat') || 'sag', text, done:null, at: Date.now()}); toast('Quête prête pour demain'); },
  tqDel(el){ const q = S.tquests.find(x => x.id === el.dataset.id); S.tquests = S.tquests.filter(x => x !== q); setTimeout(() => { const i = document.querySelector('[data-in=tqtext]'); if (i && q) { i.value = q.text; document.querySelector('[data-in=tqstat]').value = q.stat; } }, 0); },
  tqDone(el){ const q = S.tquests.find(x => x.id === el.dataset.id); q.done = q.done ? null : today(); if (q.done) toast(`Quête réussie ! +${RULES.queteDemain} XP`); },
  mqAdd(el){ const t = el.dataset.t, text = val('mq-' + t); if (!text) return toast('Écris ta quête');
    const xp = Math.max(0, Math.min(100, Math.round(parseFloat(val('mqx-' + t)) || 0)));
    if (!xp) return toast('Indique l\'XP (de 1 à 100)');
    S.mquests = S.mquests || []; S.mquests.push({id: uid(), type: t, text, stat: val('mqs-' + t) || 'sag', xp, done: null}); toast('Quête créée'); },
  mqDone(el){ const q = (S.mquests || []).find(x => x.id === el.dataset.id); if (q) q.done = q.done ? null : today(); },
  mqDel(el){ S.mquests = (S.mquests || []).filter(x => x.id !== el.dataset.id); },
  grade(el){ S.grade = S.grade || {}; const d = el.dataset.d, g = el.dataset.g;
    if (S.grade[d] === g) delete S.grade[d]; else { S.grade[d] = g; { const tr = tierOf(); toast(`${g} ${GEMO[g]} noté · rang ${tr.letter}-tier ${GEMO[tr.letter]}`); }; } },
  sound(){ S.sound = S.sound === false; if (S.sound) setTimeout(() => play('quete'), 50); },
  outfit(el){ S.outfit = Object.assign({}, S.outfit, {[el.dataset.part]: el.dataset.v}); },
  pages(el){
    const id = el.dataset.id || (S.books.find(b => !b.done) || {}).id; if (!id) return;
    const n = +el.dataset.n; S.pages.push({id:uid(), date:today(), book:id, n}); toast(`+${n} XP Sagesse`);
  },
  pagesq(el){
    const id = el.dataset.id || (S.books.find(b => !b.done) || {}).id; if (!id) return;
    const n = parseInt(val(el.dataset.id ? 'pg-'+id : 'pagesq')); if (!(n > 0)) return toast('Nombre de pages ?');
    S.pages.push({id:uid(), date:today(), book:id, n}); toast(`+${n} XP Sagesse`);
  },
  delPages(el){ S.pages = S.pages.filter(p => p.id !== el.dataset.id); },
  addBook(){ const title = val('btitle'); if (!title) return toast('Titre ?'); S.books.push({id:uid(), title, total: parseInt(val('btotal')) || 0, done:null}); },
  finishBook(el){ const b = S.books.find(b => b.id === el.dataset.id); b.done = today(); toast(`Livre fini ! +${RULES.livre} XP`); },
  unfinishBook(el){ S.books.find(b => b.id === el.dataset.id).done = null; },
  puz(){ S.puzzles.push({id:uid(), date:today()}); toast(`+${RULES.puzzles} XP Stratégie`); },
  puzY(){ S.puzzles.push({id:uid(), date:addDays(today(),-1)}); toast('Ajouté à hier'); },
  unpuz(){ const i = S.puzzles.map(p => p.date).lastIndexOf(today()); if (i >= 0) S.puzzles.splice(i, 1); },
  elo(){ const v = parseInt(val('elo')); if (!(v > 0)) return toast('Elo ?'); const t = today(); S.elo = S.elo.filter(e => e.date !== t); S.elo.push({date:t, v}); },
  addCourse(el){ const name = val('cname'); if (!name) return toast('Nom du cours ?'); S.courses.push({id:uid(), name, url: val('curl'), folder: el.dataset.f || null, steps:{lu:null,fiche:null,quiz:null,rev:null}}); },
  addFolder(el){ const name = val('fname'); if (!name) return toast('Nom du dossier ?'); S.folders.push({id:uid(), name, parent: el.dataset.f || null}); },
  delFolder(el){
    const ids = []; const walk = id => { ids.push(id); S.folders.filter(f => f.parent === id).forEach(f => walk(f.id)); }; walk(el.dataset.id);
    const nc = S.courses.filter(c => ids.includes(c.folder)).length, nf = ids.length - 1;
    const msg = nc || nf ? `Ce dossier contient ${nc} cours et ${nf} sous-dossier(s). Tout supprimer, avec l'XP de ces cours ?` : 'Supprimer ce dossier vide ?';
    if (!confirm(msg)) return;
    const parent = S.folders.find(f => f.id === el.dataset.id).parent;
    S.folders = S.folders.filter(f => !ids.includes(f.id)); S.courses = S.courses.filter(c => !ids.includes(c.folder));
    location.hash = parent ? 'savoir/' + parent : 'savoir';
  },
  delCourse(el){ if (confirm('Supprimer ce cours et son XP ?')) S.courses = S.courses.filter(c => c.id !== el.dataset.id); },
  step(el){ const c = S.courses.find(c => c.id === el.dataset.id), k = el.dataset.k;
    if (c.steps[k]) { c.steps[k] = null; } else { c.steps[k] = today(); toast(`+${RULES.etapeCours} XP Savoir`); } },
  addExam(){ const name = val('ename'); if (!name) return toast('Nom de l\'examen ?'); S.exams.push({id:uid(), name, passed:null}); },
  examOk(el){ S.exams.find(x => x.id === el.dataset.id).passed = today(); toast(`Examen réussi ! +${RULES.examen} XP`); },
  examUndo(el){ S.exams.find(x => x.id === el.dataset.id).passed = null; },
  delExam(el){ S.exams = S.exams.filter(x => x.id !== el.dataset.id); },
  exOk(el){ const e = ensureCur().ex[el.dataset.id]; const on = e.sets.every(x => x === 1); e.sets = e.sets.map(() => on ? 0 : 1); },
  exKo(el){ const e = ensureCur().ex[el.dataset.id]; const on = e.sets.some(x => x === 2); e.sets = e.sets.map((x,i) => on ? 0 : (i === e.sets.length-1 ? 2 : 1)); },
  run(el){ const c = ensureCur(); c.run[+el.dataset.i] = !c.run[+el.dataset.i]; },
  type(el){ const c = S.cur; if (c && Object.values(c.ex).some(e => e.sets.some(x => x)) && !confirm('Changer de séance efface les séries cochées. Continuer ?')) return; setCurType(el.dataset.t); },
  finish(){ ensureCur(); const w = finishSession(); if (w) { toast(`Séance terminée ! +${RULES.seance} XP`); scroller().scrollTop = 0; } },
  abandon(){ if (confirm('Effacer la séance en cours ?')) S.cur = null; },
  undoWorkout(){
    const w = doneToday(); if (!w || !confirm('Annuler la séance du jour ? Tu pourras la refaire.')) return;
    S.workouts = S.workouts.filter(x => x !== w);
    S.cur = {date:w.date, pos:w.pos, type:w.type, run:w.run, ex:{}};
    for (const [id,,n] of PROGRAM[w.type].ex) S.cur.ex[id] = w.ex[id] ? {kg:w.ex[id].kg, sets:[...w.ex[id].sets]} : {kg:S.loads[id] ?? null, sets:Array(n).fill(0)};
    for (const id in w.ex) S.loads[id] = w.ex[id].kg;
  },
  export(){
    const name = `life-rpg-${today()}.json`, txt = JSON.stringify(S, null, 1);
    // iPhone : feuille de partage (Enregistrer dans Fichiers, AirDrop…). Mac : téléchargement classique.
    try {
      const file = new File([txt], name, {type:'application/json'});
      if (/iPhone|iPad/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({files:[file]})) { navigator.share({files:[file], title:name}).catch(() => {}); return; }
    } catch {}
    const blob = new Blob([txt], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  reset(){ if (confirm('Tout effacer ? Exporte une sauvegarde avant si tu veux la garder.') && confirm('Vraiment tout effacer ?')) { S = blank(); lastLevels = null; } },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  e.preventDefault(); const before = snapshot(); ACTS[el.dataset.act]?.(el); commit(); feedback(before);
});
document.addEventListener('change', e => {
  const el = e.target, k = el.dataset.in; if (!k) return; const before = snapshot();
  const num = parseFloat(String(el.value).replace(',', '.'));
  if (k === 'kcal' || k === 'kcalY'){ const d = k === 'kcal' ? today() : addDays(today(), -1); if (num > 0) S.kcal[d] = Math.round(num); else delete S.kcal[d]; }
  else if (k === 'kg'){ const c = ensureCur(); c.ex[el.dataset.id].kg = isNaN(num) ? null : num; }
  else if (k === 'load'){ if (isNaN(num)) delete S.loads[el.dataset.id]; else S.loads[el.dataset.id] = num;
    if (S.cur && S.cur.ex[el.dataset.id] && !S.cur.ex[el.dataset.id].sets.some(x => x)) S.cur.ex[el.dataset.id].kg = isNaN(num) ? null : num; }
  else if (k === 'name'){ S.name = el.value.trim() || 'Boss'; }
  else if (k === 'import'){
    const f = el.files[0]; if (!f) return;
    f.text().then(txt => { try { const d = JSON.parse(txt); if (!d || d.v !== 1) throw 0; S = Object.assign(blank(), d); S.mig06 = false; migrate(); lastLevels = null; commit(); toast('Sauvegarde importée'); } catch { toast('Fichier invalide'); } });
    return;
  }
  else return;   // champs de saisie libre (nom de cours…) : lus au clic sur le bouton
  commit(); feedback(before);
});
// Entrée dans un champ « OK » déclenche le bouton voisin
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return; const el = e.target; if (!el.dataset?.in) return;
  const btn = el.parentElement.querySelector('[data-act]'); if (btn) { e.preventDefault(); el.dispatchEvent(new Event('change', {bubbles:true})); btn.click(); }
});
window.addEventListener('hashchange', () => { window.scrollTo(0,0); document.getElementById('app').scrollTop = 0; render(); });
// Repasser sur l'appli le lendemain : rafraîchir la date
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* Petite animation de l'avatar sur la Fiche, toutes les ~20 s (pouce, clin d'œil, biceps) */
let poseI = 0;
setInterval(() => {
  const el = document.getElementById('hero'); if (!el || document.hidden) return;
  const st = stageOf(snapshot().lv.for.lvl), tr = curTier();
  const seq = tr === 'C' ? ['yawn', 'thumb', 'yawn'] : ['thumb', 'wink', 'flex'];   // C : fatigué, il bâille
  const pose = seq[poseI++ % 3], hop = tr === 'C' ? 'hop-soft' : tr === 'S' ? 'hop-big' : 'hop';
  el.innerHTML = avatarSVG(st, 72, S.outfit, pose, tr); el.classList.add(hop);
  setTimeout(() => { el.classList.remove(hop); if (document.getElementById('hero') === el) el.innerHTML = avatarSVG(st, 72); }, 900);
}, 20000);
load(); migrate(); render();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js', {updateViaCache:'none'});
