/* Life RPG — sons générés en Web Audio (aucun fichier).
   SOUNDS[thème][action][version] = fonction qui joue le son. */
'use strict';
let AC = null;
/* iOS Safari met le contexte audio en pause (« suspended » / « interrupted ») après une mise en veille,
   un passage en arrière-plan, un appel ou un autre son, et le reprend parfois mal.
   Parade : on recrée un contexte neuf à chaque retour au premier plan, on le réveille à chaque toucher,
   et on attend qu'il tourne vraiment avant de jouer. */
function ac(){
  if (!AC || AC.state === 'closed') AC = new (window.AudioContext || window.webkitAudioContext)();
  return AC;
}
function unlock(){
  const c = ac();
  if (c.state !== 'running') c.resume().catch(() => {});
  try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch {}
}
function resetAudio(){ if (AC) { try { AC.close(); } catch {} } AC = null; }
document.addEventListener('touchstart', unlock, {passive:true, capture:true});
document.addEventListener('pointerdown', unlock, {passive:true, capture:true});
document.addEventListener('visibilitychange', () => { if (document.hidden) resetAudio(); });
window.addEventListener('pagehide', resetAudio);
// Joue fn() dès que le contexte tourne ; s'il refuse de reprendre, on en recrée un et on réessaie une fois
function playSound(fn){
  const c = ac();
  if (c.state === 'running') { fn(); return; }
  c.resume().then(() => { if (c.state === 'running') fn(); else { resetAudio(); ac().resume().then(fn).catch(() => {}); } })
           .catch(() => { resetAudio(); ac().resume().then(fn).catch(() => {}); });
}
// Note simple avec enveloppe
function tone({f = 440, f2 = null, type = 'sine', t = 0, d = 0.1, v = 0.2, a = 0.005}){
  const c = ac(), o = c.createOscillator(), g = c.createGain(), s = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, s);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + d);
  g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(v, s + a); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
  o.connect(g).connect(c.destination); o.start(s); o.stop(s + d + 0.02);
}
// Bruit filtré (bois, clics, glissements)
function noise({t = 0, d = 0.05, v = 0.3, ft = 'bandpass', f = 1000, f2 = null, q = 1}){
  const c = ac(), len = Math.ceil(c.sampleRate * (d + 0.02)), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), s = c.currentTime + t;
  src.buffer = buf; fl.type = ft; fl.frequency.setValueAtTime(f, s); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, s + d);
  g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(0.0001, s + d);
  src.connect(fl).connect(g).connect(c.destination); src.start(s); src.stop(s + d + 0.02);
}
const bell = (f, t = 0, d = 1.2, v = 0.12) => { [1, 2.01, 3.02].forEach((m, i) => tone({f: f*m, t, d: d/(i+1), v: v/(i+1), a: 0.003})); };

// Sons enregistrés (fichiers courts) : décodés une fois, puis rejoués
const SAMPLES = {};
function sample(url, v = 0.8){
  const c = ac();
  const go = b => { const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = v; s.connect(g).connect(c.destination); s.start(); };
  if (SAMPLES[url]) return go(SAMPLES[url]);
  fetch(url).then(r => r.arrayBuffer()).then(a => new Promise((ok, ko) => c.decodeAudioData(a, ok, ko))).then(b => { SAMPLES[url] = b; go(b); }).catch(() => {});
}

const SOUNDS = {
  pixel: {
    quete: {
      A: () => { tone({f:988, type:'square', d:0.07, v:0.12}); tone({f:1319, type:'square', t:0.07, d:0.3, v:0.12}); },
      B: () => [523, 659, 784, 1047].forEach((f, i) => tone({f, type:'square', t:i*0.05, d:0.09, v:0.1})),
    },
    onglet: {
      A: () => tone({f:1800, type:'square', d:0.025, v:0.08}),
      B: () => tone({f:660, f2:990, type:'triangle', d:0.05, v:0.18}),
    },
    attribut: {
      A: () => tone({f:880, f2:440, type:'square', d:0.08, v:0.1}),
      B: () => { tone({f:523, type:'square', d:0.05, v:0.1}); tone({f:784, type:'square', t:0.05, d:0.07, v:0.1}); },
    },
    niveau: {
      A: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({f, type:'square', t:i*0.09, d:0.1, v:0.1})); tone({f:1319, type:'square', t:0.56, d:0.5, v:0.11}); },
      B: () => { tone({f:200, f2:1600, type:'square', d:0.35, v:0.08}); [2093, 2637, 3136].forEach((f, i) => tone({f, type:'triangle', t:0.38 + i*0.07, d:0.25, v:0.1})); },
    },
    // Entrée dans la cabane : grincement d'une vieille porte en bois, rendu 16 bits
    // Entrée dans la cabane : vraies portes en bois (Kenney, RPG Audio, CC0), rendu 16 bits léger
    cabane: {
      A: () => sample('sons/porte1.mp3'),
      B: () => sample('sons/porte2.mp3'),
      C: () => sample('sons/porte3.mp3'),
    },
  },
};
