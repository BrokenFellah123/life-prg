/* Life RPG — le monde : ciel jour / nuit, paysage du jour (onglet Quêtes) et demeure (onglet Fiche).
   Tout est dessiné en pixel art sur un canvas basse résolution, agrandi sans lissage.
   Le paysage dépend de la date : chaque jour un nouvel endroit du monde du logo. */

// Moment du ciel : nuit, aube (6h45-7h15), jour (7h15-17h45), crépuscule (17h45-18h15)
function skyMood(d = new Date()){
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 405 && m < 435) return 'aube';
  if (m >= 435 && m < 1065) return 'jour';
  if (m >= 1065 && m < 1095) return 'crep';
  return 'nuit';
}
const isDay = (d = new Date()) => { const m = skyMood(d); return m === 'jour' || m === 'aube'; };
const tintOf = mood => mood === 'nuit' ? (c => mix(c, '#0b1030', .55)) : mood === 'jour' ? (c => c) : (c => mix(mix(c, '#ff8a5a', .2), '#2a1d3a', .15));

// Générateur pseudo-aléatoire à graine (même date → même paysage)
function seeded(str){
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const hex = c => [1,3,5].map(i => parseInt(c.slice(i,i+2),16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v,i) => Math.round(v + (B[i]-v)*t).toString(16).padStart(2,'0')).join(''); };

// Biomes du monde (couleurs de jour ; la nuit les assombrit)
const BIOMES = {
  prairie: {name:'Prairie',          far:'#7f9fd0', mid:'#5fae4a', mid2:'#4a9a3c', grass:'#6cc24a', grass2:'#4f9e38', tree:'#2f7d32', trunk:'#7a4b28', flowers:['#ff6b8a','#ffd23f','#ffffff']},
  fleurs:  {name:'Vallée fleurie',   far:'#8aa6d8', mid:'#6cbf52', mid2:'#58a844', grass:'#78cc54', grass2:'#5aad3e', tree:'#33853a', trunk:'#7a4b28', flowers:['#ff5d73','#ffd23f','#b388ff','#ffffff','#ff9f43']},
  foret:   {name:'Forêt',            far:'#6f8cc0', mid:'#3f8a3a', mid2:'#2f7430', grass:'#4fa83e', grass2:'#3a8a30', tree:'#1f5e2a', trunk:'#5e3a1e', flowers:['#ffffff']},
  automne: {name:'Bois d\'automne',  far:'#9a9ac8', mid:'#c08a3a', mid2:'#a8742e', grass:'#b8a040', grass2:'#9a8632', tree:'#d0602a', trunk:'#6a3e20', flowers:['#ffd23f','#ff7a3a']},
  neige:   {name:'Col enneigé',      far:'#a8b8e0', mid:'#dfe8f2', mid2:'#c8d4e4', grass:'#eef4fb', grass2:'#cdd9e8', tree:'#2f6a4a', trunk:'#5e3a1e', flowers:[]},
  lande:   {name:'Lande',            far:'#8c94c0', mid:'#8a9a5a', mid2:'#76864c', grass:'#9aaa62', grass2:'#7e8e50', tree:'#4e6e3a', trunk:'#5e3a1e', flowers:['#b388ff','#ffffff']},
};

function dayWorld(dateStr){
  const r = seeded('monde-' + dateStr);
  const keys = Object.keys(BIOMES);
  const biome = keys[Math.floor(r() * keys.length)];
  return {
    r, biome,
    river: r() < .38, castle: r() < .3, fire: r() < .5, snow: biome === 'neige' || r() < .25,
    trees: Math.floor(r() * 7), rocks: Math.floor(r() * 4), riverX: .15 + r() * .7, fireX: .5 + r() * .08,
  };
}

// ---------- Dessin ----------
function px(ctx, x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawTree(ctx, x, y, s, B, kind, night){
  const leaf = night ? mix(B.tree, '#0b1030', .5) : B.tree, dark = mix(leaf, '#000000', .25), trunk = night ? mix(B.trunk, '#0b1030', .5) : B.trunk;
  if (kind === 'pin'){
    px(ctx, x, y - 2*s, s, 2*s, trunk);
    for (let i = 0; i < 4*s; i++){ const w = Math.max(1, Math.round((i+1) / 2)); px(ctx, x - w + Math.ceil(s/2), y - 2*s - 4*s + i, 2*w - Math.ceil(s/2) + 1 - (s>1?0:1) + s - 1, 1, i % 3 === 2 ? dark : leaf); }
  } else {
    px(ctx, x, y - 3*s, s, 3*s, trunk);
    const rr = 2*s + 1;
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (dx*dx + dy*dy <= rr*rr) px(ctx, x + dx, y - 3*s - rr + dy, 1, 1, (dx + dy > rr/2) ? dark : leaf);
  }
}
function drawRock(ctx, x, y, s, night){
  const c = night ? '#4a4c66' : '#8f949e', d = night ? '#35364a' : '#6c7079', l = night ? '#5e6080' : '#b4b8c0';
  px(ctx, x, y - 2*s, 4*s, 2*s, c); px(ctx, x + s, y - 3*s, 2*s, s, c); px(ctx, x + s, y - 3*s, s, s, l); px(ctx, x + 3*s, y - s, s, s, d);
}
function drawCastle(ctx, x, y, c, flag){   // silhouette au loin (le château du logo)
  px(ctx, x, y - 6, 9, 6, c); px(ctx, x - 2, y - 9, 3, 9, c); px(ctx, x + 8, y - 9, 3, 9, c); px(ctx, x + 3, y - 11, 3, 5, c);
  px(ctx, x - 2, y - 10, 1, 1, c); px(ctx, x, y - 10, 1, 1, c); px(ctx, x + 8, y - 10, 1, 1, c); px(ctx, x + 10, y - 10, 1, 1, c);
  px(ctx, x + 4, y - 14, 1, 3, c); px(ctx, x + 5, y - 14, 2, 1, flag);
}
function drawFire(ctx, x, y, t){
  px(ctx, x - 3, y - 1, 7, 1, '#6a3e20'); px(ctx, x - 2, y - 2, 5, 1, '#8a5a2b');
  const f = t % 2;
  px(ctx, x - 1, y - 4, 3, 2, '#d9472b'); px(ctx, x, y - 6 - f, 1, 2 + f, '#d9472b'); px(ctx, x - 1 + f, y - 5, 1, 1, '#f6a43a');
  px(ctx, x, y - 4, 1, 2, '#f6a43a'); px(ctx, x, y - 3, 1, 1, '#ffe9a8');
}

function landscape(canvas, dateStr, mood, lift = 0){
  const night = mood === 'nuit';
  const W = canvas.width, H = canvas.height - lift, ctx = canvas.getContext('2d');   // lift : bas de l'image, sous les onglets
  ctx.clearRect(0, 0, W, canvas.height);
  const w = dayWorld(dateStr), r = w.r, B = BIOMES[w.biome];
  const N = tintOf(mood);
  skyBand(ctx, W, H, mood);
  sunMoon(ctx, mood, Math.round(W * .84), 8, H, W, 2/3);   // pixels 3× ici contre 2× sur la Fiche
  // montagnes au loin
  const far = N(B.far), snow = N('#f4f7ff');
  let peaks = []; const np = 3 + Math.floor(r() * 3);
  for (let i = 0; i < np; i++) peaks.push({x: (i + .2 + r() * .6) / np * W, h: 6 + r() * 12});
  for (let x = 0; x < W; x++){
    let top = H;
    for (const p of peaks){ const y = H - 20 - p.h + Math.abs(x - p.x) * .9; if (y < top) top = y; }
    top = Math.round(top);
    px(ctx, x, top, 1, H - top, far);
    if (w.snow) for (const p of peaks){ const pt = H - 20 - p.h; if (p.h > 18 && top < pt + 4) px(ctx, x, top, 1, Math.min(3, pt + 4 - top), snow); }
  }
  // château au loin, posé sur une montagne
  if (w.castle){ const p = peaks[Math.floor(r() * peaks.length)]; drawCastle(ctx, Math.round(p.x) - 4, Math.round(H - 20 - p.h) + 3, N(mix(B.far, '#1b2040', .45)), N('#ff5d5d')); }
  // collines
  const a1 = r() * 6, a2 = r() * 6, mid = N(B.mid), mid2 = N(B.mid2);
  for (let x = 0; x < W; x++){
    const y = Math.round(H - 16 - 4 * Math.sin(x / 17 + a1) - 2 * Math.sin(x / 7 + a2));
    px(ctx, x, y, 1, H - y, mid); px(ctx, x, y + 3, 1, H - y, mid2);
  }
  // arbres lointains sur les collines
  for (let i = 0; i < w.trees; i++){ const x = Math.round(r() * W); drawTree(ctx, x, Math.round(H - 15 - 4 * Math.sin(x / 17 + a1)), 1, B, r() < .5 ? 'pin' : 'rond', night); }
  // sol
  const g1 = N(B.grass), g2 = N(B.grass2), gy = H - 10;
  px(ctx, 0, gy, W, H - gy, g1); px(ctx, 0, gy, W, 1, g2);
  for (let i = 0; i < W / 3; i++) px(ctx, Math.round(r() * W), gy + 1 + Math.floor(r() * 9), 1, 1, g2);
  // rivière
  if (w.river){
    const water = night ? '#24407a' : '#4fa8e0', light = night ? '#6f86c0' : '#bfe6ff';
    let x = Math.round(w.riverX * W);
    for (let y = H - 15; y < H; y++){
      const wd = 2 + Math.floor((y - (H - 15)) / 2.2);
      x += (r() < .5 ? -1 : 1) * (r() < .4 ? 1 : 0);
      px(ctx, x - Math.floor(wd/2), y, wd, 1, water);
      if (r() < .35) px(ctx, x - Math.floor(wd/2) + Math.floor(r() * wd), y, Math.min(2, wd), 1, light);
    }
  }
  // fleurs
  if (B.flowers.length) for (let i = 0; i < W / (w.biome === 'fleurs' ? 3 : 8); i++) px(ctx, Math.round(r() * W), gy + 2 + Math.floor(r() * 7), 1, 1, N(B.flowers[Math.floor(r() * B.flowers.length)]));
  // pierres et arbres proches
  for (let i = 0; i < w.rocks; i++) drawRock(ctx, Math.round(r() * (W - 6)), H - 2 - Math.floor(r() * 3), 1, night);
  const nearT = Math.floor(r() * 3);
  for (let i = 0; i < nearT; i++){ const x = r() < .5 ? 4 + Math.round(r() * W * .2) : Math.round(W * .82 + r() * W * .15); drawTree(ctx, x, H - 2, 2, B, w.biome === 'neige' || r() < .4 ? 'pin' : 'rond', night); }
  if (lift){   // l'herbe continue sous les onglets
    px(ctx, 0, H, W, lift, g1);
    for (let i = 0; i < W * lift / 14; i++) px(ctx, Math.round(r() * W), H + Math.floor(r() * lift), 1, 1, r() < .7 ? g2 : N(B.flowers[0] || B.grass2));
  }
  return w;
}

// ---------- Demeure (onglet Fiche) : cabane → château, une amélioration tous les 2 niveaux ----------
const HOMES = ['Cabane', 'Chalet', 'Maison de pierre', 'Manoir', 'Tour fortifiée', 'Château'];
const homeStage = () => 0;   // v1.7 : la cabane ne change plus d'aspect, on la meuble de l'intérieur
const HOME_H = [16, 21, 25, 28, 38, 56];   // hauteur de chaque demeure (pixels du dessin)

function drawHome(ctx, cx, gy, st, night, N){
  const wood = N('#9a6234'), woodD = N('#6e4220'), roof = N('#b8432e'), roofD = N('#8a2e20'), stone = N('#a7a3a0'), stoneD = N('#7c7874'), stoneL = N('#c9c5c0');
  const win = night ? '#ffd98a' : '#7fc8f0', door = N('#5a3418'), gold = '#ffd23f', flag = N('#ff5d5d');
  const box = (x, y, w, h, c) => px(ctx, cx + x, gy - y - h, w, h, c);   // repère : x depuis le centre, y depuis le sol
  const roofTri = (x0, w, y, h, c, c2) => { for (let i = 0; i < h; i++){ const ww = w - 2 * Math.round(i * (w/2) / h); box(x0 + (w - ww)/2, y + i, Math.max(1, ww), 1, i % 2 ? c2 : c); } };
  const bricks = (x, y, w, h) => { box(x, y, w, h, stone); for (let j = 1; j < h; j += 3) for (let i = (j % 2 ? 0 : 2); i < w; i += 4) box(x + i, y + j, 1, 1, stoneD); box(x, y + h - 1, w, 1, stoneL); };
  const crenel = (x, y, w, c) => { for (let i = 0; i < w; i += 2) box(x + i, y, 1, 2, c); };
  const window1 = (x, y) => { box(x, y, 3, 3, win); box(x + 1, y, 1, 3, N('#3a2a1a')); };
  if (st === 0){   // cabane sobre
    box(-8, 0, 16, 9, wood); for (let j = 1; j < 9; j += 2) box(-8, j, 16, 1, woodD);
    roofTri(-10, 20, 9, 7, roof, roofD); box(-2, 0, 4, 6, door); window1(4, 3);
  } else if (st === 1){   // chalet : plus grand, cheminée, deux fenêtres
    box(-12, 0, 24, 11, wood); for (let j = 1; j < 11; j += 2) box(-12, j, 24, 1, woodD);
    roofTri(-14, 28, 11, 10, roof, roofD); box(6, 15, 3, 6, stone); box(-2, 0, 4, 7, door); window1(-9, 4); window1(6, 4); box(-1, 13, 3, 3, win);
  } else if (st === 2){   // maison de pierre
    bricks(-14, 0, 28, 14); roofTri(-16, 32, 14, 11, roof, roofD); box(9, 19, 3, 6, stoneD);
    box(-2, 0, 5, 8, door); box(0, 8, 1, 1, gold); window1(-10, 6); window1(7, 6); window1(-1, 16);
  } else if (st === 3){   // manoir : corps + deux ailes
    bricks(-22, 0, 10, 12); bricks(12, 0, 10, 12); bricks(-12, 0, 24, 18);
    roofTri(-24, 14, 12, 7, roof, roofD); roofTri(10, 14, 12, 7, roof, roofD); roofTri(-14, 28, 18, 10, roof, roofD);
    box(-3, 0, 6, 9, door); box(-3, 9, 6, 1, gold); [-9, 5].forEach(x => { window1(x, 5); window1(x, 12); }); window1(-19, 5); window1(16, 5); window1(-1, 20);
  } else if (st === 4){   // tour fortifiée : muraille + donjon
    bricks(-24, 0, 48, 10); crenel(-24, 10, 48, stone);
    bricks(-8, 0, 16, 30); crenel(-8, 30, 16, stone); box(-3, 0, 6, 9, door); box(-3, 8, 6, 1, N('#3a2a1a'));
    window1(-2, 14); window1(-2, 22); box(0, 32, 1, 6, woodD); box(1, 35, 4, 3, flag); window1(-19, 4); window1(16, 4);
  } else {   // château (niveau 10)
    bricks(-30, 0, 60, 14); crenel(-30, 14, 60, stone);
    [-30, 22].forEach(x => { bricks(x, 0, 8, 24); crenel(x, 24, 8, stone); roofTri(x - 1, 10, 26, 8, roof, roofD); window1(x + 2, 16); });
    bricks(-11, 0, 22, 30); crenel(-11, 30, 22, stone); bricks(-5, 30, 10, 10); roofTri(-7, 14, 40, 10, roof, roofD);
    box(0, 50, 1, 6, woodD); box(1, 53, 5, 3, flag); box(-4, 0, 8, 11, door); box(-4, 10, 8, 1, gold);
    window1(-8, 18); window1(5, 18); window1(-1, 33); for (let i = -26; i < 26; i += 9) if (Math.abs(i) > 12) window1(i, 6);
  }
}
// Ciel peint dans la bande (net, en paliers de pixels), raccord avec le ciel de l'écran
const SKY = {jour:['#9cd1f9','#b9e2ff'], nuit:['#281b33','#2b1d2a'], aube:['#e0909a','#ffb070'], crep:['#d46d6a','#ff8a4a']};
function skyBand(ctx, W, H, mood){
  const [a, b] = SKY[mood], n = 6;
  for (let i = 0; i < n; i++) px(ctx, 0, Math.floor(i * H / n), W, Math.ceil(H / n) + 1, mix(a, b, i / (n - 1)));
  if (mood === 'nuit'){ const r = seeded('etoiles'); for (let i = 0; i < W / 9; i++) px(ctx, Math.floor(r() * W), Math.floor(r() * H * .5), 1, 1, r() < .3 ? '#ffe9a8' : '#ffffff'); }
}
function disc(ctx, cx, cy, rad, c){ for (let dy = -rad; dy <= rad; dy++){ const w = Math.round(Math.sqrt(rad*rad - dy*dy)); px(ctx, cx - w, cy + dy, 2*w + 1, 1, c); } }
// Soleil (ou lune) en second plan : dessiné avant le paysage, donc derrière les montagnes
function sunMoon(ctx, mood, x, y, H, W, k = 1){   // k : facteur de taille (même taille à l'écran sur les deux onglets)
  if (mood === 'nuit'){ disc(ctx, x, y + 1, Math.round(5 * k), '#f4f1d8'); disc(ctx, x + Math.round(3 * k), y - 1, Math.round(4 * k), SKY.nuit[0]); return; }
  // Le soleil suit l'heure : il sort de derrière les collines à 6h45, monte jusqu'à midi et demi, redescend et disparaît à 18h15
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  const top = 7, hz = H - 9, rise = H - 27;   // rise : hauteur à la fin de l'aube, au-dessus des montagnes
  let xx, yy;
  if (m < 435){ const k = Math.max(0, (m - 405) / 30); xx = .1 + .08 * k; yy = hz - (hz - rise) * k; }              // aube : il sort de derrière l'horizon
  else if (m < 1065){ const k = (m - 435) / 630; xx = .18 + .64 * k; yy = rise - (rise - top) * Math.sin(Math.PI * k); }   // jour : arc dans le ciel
  else { const k = Math.min(1, (m - 1065) / 30); xx = .82 + .08 * k; yy = rise + (hz - rise) * k; }                // crépuscule : il se couche
  xx = W ? Math.round(W * xx) : x; yy = Math.round(yy);
  const low = mood !== 'jour';
  disc(ctx, xx, yy, Math.round(8 * k), low ? '#ffb070' : '#fff2b0');
  disc(ctx, xx, yy, Math.round(6 * k), low ? '#ff8a3a' : '#ffe27a');
}

function homeScene(canvas, lvl, mood){
  const night = mood === 'nuit';
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const B = BIOMES.prairie, N = tintOf(mood), r = seeded('maison');
  skyBand(ctx, W, H, mood);
  sunMoon(ctx, mood, 22, 12, H, W);
  const a = 1.3;
  for (let x = 0; x < W; x++){ const y = Math.round(H - 22 - 3 * Math.sin(x / 19 + a)); px(ctx, x, y, 1, H - y, N(B.mid)); px(ctx, x, y + 3, 1, H - y, N(B.mid2)); }
  const gy = H - 14; px(ctx, 0, gy, W, H - gy, N(B.grass)); px(ctx, 0, gy, W, 1, N(B.grass2));
  for (let i = 0; i < W / 3; i++) px(ctx, Math.round(r() * W), gy + 1 + Math.floor(r() * 13), 1, 1, N(B.flowers[Math.floor(r() * 3)]));
  drawTree(ctx, 16, gy + 1, 2, B, 'rond', night); drawTree(ctx, W - 20, gy + 1, 2, B, 'pin', night);
  const st = homeStage(lvl);
  drawHome(ctx, Math.round(W / 2), gy + 1, st, night, N);
  return st;
}

// ---------- Petites phrases (écrites pour toi, selon l'heure, l'endroit et la journée) ----------
function bubbleLine(w, done, total, night, name){
  const h = new Date().getHours(), r = seeded('phrase-' + today() + '-' + done);
  const pick = a => a[Math.floor(r() * a.length)];
  const place = BIOMES[w.biome].name.toLowerCase();
  if (done >= total) return pick([`Tout est fait. On peut souffler.`, `Journée bouclée. Fier de toi, ${name}.`, `Plus rien à cocher. Profite du ${w.fire ? 'feu' : 'calme'}.`]);
  if (h < 7) return pick([`Debout avant le soleil ? Respect.`, `Il fait encore nuit. Doucement.`]);
  if (h < 11 && done === 0) return pick([`Nouveau jour, nouvel endroit : ${place}.`, w.river ? `Une rivière ce matin. On la longe ?` : `Bien dormi ? On commence par quoi ?`, w.castle ? `Le château se voit d'ici. On avance.` : `Café, puis la première quête.`]);
  if (night && done === 0) return pick([`Il reste la soirée. Une quête, juste une ?`, `Pas grave si la journée a filé. On en fait une ?`]);
  if (total - done === 1) return pick([`Plus qu'une. Tu l'as.`, `Une dernière et c'est plié.`]);
  if (w.fire && night) return pick([`On se pose cinq minutes près du feu ?`, `${done} sur ${total}. Le feu tient bon, toi aussi.`]);
  return pick([`${done} sur ${total}. Ça avance.`, `Encore ${total - done} quêtes et la journée est pliée.`, `Belle ${place} aujourd'hui. On continue ?`]);
}

// ---------- Intérieur de la cabane (v1.7) : pièce en rondins, meublée selon les objets ajoutés ----------
function cabinInterior(canvas, items, mood){
  const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d'), night = mood === 'nuit';
  const dim = c => night ? mix(c, '#140c24', .38) : c;
  const fy = H - 26;                                   // ligne du sol
  // Mur en rondins
  for (let y = 0; y < fy; y += 6){ px(ctx, 0, y, W, 6, dim('#8a5630')); px(ctx, 0, y + 4, W, 1, dim('#6e4220')); px(ctx, 0, y + 5, W, 1, dim('#4a2c16')); px(ctx, 0, y, W, 1, dim('#a8703e')); }
  for (let y = 0; y < fy; y += 12) for (let x = (y / 12 % 2) * 20 + 8; x < W; x += 40) px(ctx, x, y + 2, 2, 2, dim('#5a3418'));   // nœuds du bois
  // Poutre et plafond
  px(ctx, 0, 0, W, 4, dim('#4a2c16')); px(ctx, 0, 4, W, 1, dim('#2e1a0c'));
  // Plancher
  for (let y = fy; y < H; y += 5){ px(ctx, 0, y, W, 5, dim('#9a6a3a')); px(ctx, 0, y + 4, W, 1, dim('#6e4220')); }
  for (let y = fy, k = 0; y < H; y += 5, k++) for (let x = (k % 2) * 17 + 6; x < W; x += 34) px(ctx, x, y, 1, 4, dim('#6e4220'));
  px(ctx, 0, fy, W, 2, dim('#3a2210'));                // plinthe
  // Fenêtre (le ciel suit l'heure)
  const wx = Math.round(W / 2 - 14), wy = 14, ww = 28, wh = 22, [s1, s2] = SKY[mood];
  px(ctx, wx - 3, wy - 3, ww + 6, wh + 6, '#3a2210');
  for (let i = 0; i < wh; i++) px(ctx, wx, wy + i, ww, 1, mix(s1, s2, i / wh));
  if (night){ px(ctx, wx + 6, wy + 5, 1, 1, '#fff7e6'); px(ctx, wx + 20, wy + 9, 1, 1, '#fff7e6'); px(ctx, wx + 15, wy + 3, 1, 1, '#fff7e6'); px(ctx, wx + 18, wy + 13, 4, 4, '#f3ecd8'); }
  else { px(ctx, wx + 5, wy + 4, 5, 5, mood === 'jour' ? '#ffd23f' : '#ffb070'); px(ctx, wx, wy + wh - 6, ww, 6, '#5fa04e'); px(ctx, wx, wy + wh - 6, ww, 1, '#7cc060'); }
  px(ctx, wx + ww / 2 - 1, wy, 2, wh, '#5a3418'); px(ctx, wx, wy + wh / 2 - 1, ww, 2, '#5a3418');
  px(ctx, wx - 4, wy + wh + 3, ww + 8, 3, '#6e4220');  // rebord
  // Porte à droite
  const dx = W - 34; px(ctx, dx - 2, fy - 44, 26, 44, '#2e1a0c'); px(ctx, dx, fy - 42, 22, 42, dim('#6e4220'));
  for (let x = dx + 5; x < dx + 22; x += 6) px(ctx, x, fy - 42, 1, 42, dim('#4a2c16'));
  px(ctx, dx + 2, fy - 30, 18, 2, dim('#4a2c16')); px(ctx, dx + 2, fy - 12, 18, 2, dim('#4a2c16')); px(ctx, dx + 17, fy - 22, 2, 3, '#d9a35a');
  // Lumière chaude la nuit
  if (night){ ctx.fillStyle = 'rgba(255,190,90,.10)'; ctx.fillRect(0, 0, W, H); }
  // ---- Objets ----
  if (items.lit){   // lit à gauche : cadre en bois, matelas, oreiller, couverture rouge à carreaux
    const bx = 10, bw = 58, by = fy + 6;
    px(ctx, bx, by - 30, 5, 30, '#4a2c16'); px(ctx, bx - 1, by - 32, 7, 3, '#6e4220');            // tête de lit
    px(ctx, bx + bw - 4, by - 16, 4, 16, '#4a2c16'); px(ctx, bx + bw - 5, by - 18, 6, 3, '#6e4220'); // pied de lit
    px(ctx, bx + 4, by - 12, bw - 8, 6, '#6e4220'); px(ctx, bx + 4, by - 12, bw - 8, 1, '#9a6234');  // cadre
    px(ctx, bx + 5, by - 17, bw - 10, 5, '#f3ecd8');                                                // matelas
    px(ctx, bx + 6, by - 22, 12, 6, '#fff7e6'); px(ctx, bx + 6, by - 17, 12, 1, '#d8cfc0');          // oreiller
    px(ctx, bx + 19, by - 19, bw - 24, 8, dim('#b8323a'));                                          // couverture
    for (let x = bx + 21; x < bx + bw - 6; x += 5) px(ctx, x, by - 19, 2, 8, dim('#8a2228'));
    px(ctx, bx + 19, by - 16, bw - 24, 1, dim('#d9505a'));
    px(ctx, bx + 5, by - 6, 2, 6, '#3a2210'); px(ctx, bx + bw - 7, by - 6, 2, 6, '#3a2210');          // pieds
  }
}
