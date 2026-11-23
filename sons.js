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
  },
  chess: {
    quete: {
      A: () => { noise({f:900, q:2, d:0.06, v:0.6}); tone({f:180, f2:120, d:0.09, v:0.35}); },
      B: () => { noise({f:900, q:2, d:0.05, v:0.5}); tone({f:170, f2:120, d:0.08, v:0.3}); noise({t:0.16, ft:'highpass', f:3500, d:0.02, v:0.5}); },
    },
    onglet: {
      A: () => noise({ft:'highpass', f:3000, d:0.015, v:0.45}),
      B: () => noise({f:1500, q:3, d:0.03, v:0.5}),
    },
    attribut: {
      A: () => noise({ft:'lowpass', f:600, f2:2400, d:0.16, v:0.35}),
      B: () => { tone({f:300, f2:200, d:0.06, v:0.3}); noise({f:1200, q:2, d:0.03, v:0.3}); },
    },
    niveau: {
      A: () => { [0, 0.14, 0.28].forEach((t, i) => { noise({t, f:800 + i*300, q:2, d:0.05, v:0.5}); tone({t, f:160 + i*30, d:0.08, v:0.3}); }); bell(784, 0.45); },
      B: () => { bell(659, 0, 1.4, 0.13); bell(988, 0.25, 1.4, 0.1); },
    },
  },
  clinic: {
    // Inspirés d'appareils médicaux : scope ECG, oxymètre de pouls, pousse-seringue, défibrillateur, alarmes normalisées
    quete: {
      A: () => tone({f:960, d:0.09, v:0.22, a:0.002}),                                              // bip QRS du scope ECG
      B: () => { tone({f:55, f2:40, d:0.12, v:0.5}); tone({f:1050, t:0.01, d:0.08, v:0.2, a:0.002}); }, // battement + bip de saturomètre
    },
    onglet: {
      A: () => tone({f:2000, type:'square', d:0.02, v:0.05, a:0.001}),                               // touche de moniteur
      B: () => tone({f:1250, type:'triangle', d:0.018, v:0.2, a:0.001}),                              // clic d'écran tactile médical
    },
    attribut: {
      A: () => { tone({f:1400, d:0.04, v:0.18, a:0.002}); tone({f:1400, t:0.08, d:0.04, v:0.18, a:0.002}); },   // validation pousse-seringue
      B: () => { tone({f:880, d:0.06, v:0.18, a:0.002}); tone({f:1175, t:0.07, d:0.07, v:0.18, a:0.002}); },  // saturomètre qui remonte
    },
    niveau: {
      A: () => { tone({f:300, f2:2800, type:'sawtooth', d:1.1, v:0.035, a:0.05}); tone({f:300, f2:2800, d:1.1, v:0.08, a:0.05});
                 [0, 0.18].forEach(t => tone({f:1600, t:1.2 + t, d:0.12, v:0.2, a:0.002})); },           // charge du défibrillateur puis « prêt »
      B: () => [[523,0],[659,0.2],[784,0.4],[784,0.85],[1047,1.05]].forEach(([f,t]) => tone({f, type:'triangle', t, d:0.16, v:0.22, a:0.01})), // mélodie d'alarme normalisée
    },
  },
};
