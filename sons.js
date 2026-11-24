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

// Grincement de porte : frottement « accroche-glisse » du gond = train d'impulsions dont la cadence varie,
// chaque impulsion fait résonner le bois. Puis rendu façon console 16 bits (échantillonnage réduit, quantification).
function creak({D = 0.95, r0 = 38, r1 = 70, k = 1, wob = 12} = {}){
  const c = ac(), sr = c.sampleRate, n = Math.ceil(sr * D), buf = c.createBuffer(1, n, sr), out = buf.getChannelData(0);
  const res = [[620*k, 0.9, 0.0045/k], [1180*k, 0.5, 0.003/k], [2350*k, 0.22, 0.0018/k]];   // résonances du bois : fréquence, poids, amortissement
  let phase = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rate = x => r0 + r1 * Math.sin(Math.PI * Math.min(1, x / (D * 0.8))) ** 0.8 + wob * Math.sin(x * 9);   // cadence : monte puis retombe
  const env = x => Math.min(1, x / 0.08) * Math.max(0, Math.min(1, (D - x) / (D * 0.26)));
  const pulses = [];
  for (let k = 0; k < n; k++){ const x = k / sr; phase += rate(x) / sr; if (phase >= 1){ phase -= 1; pulses.push([k, env(x) * (0.75 + 0.25 * rnd())]); } }
  for (const [k0, a] of pulses) for (const [f, w, tau] of res){
    const len = Math.min(n - k0, Math.ceil(sr * tau * 6));
    for (let k = 0; k < len; k++){ const t = k / sr; out[k0 + k] += a * w * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t); }
  }
  // 16 bits façon console : 16 kHz « tenu », 7 bits de profondeur, puis lissage
  const hold = Math.max(1, Math.round(sr / 16000)), q = 64; let last = 0, lp = 0;
  for (let k = 0; k < n; k++){ if (k % hold === 0) last = Math.round(Math.max(-1, Math.min(1, out[k] * 0.55)) * q) / q; lp += (last - lp) * 0.55; out[k] = lp; }
  const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = 0.6;
  src.connect(g).connect(c.destination); src.start();
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
    cabane: {
      A: () => creak({D:0.6, r0:45, r1:75}),                     // court
      B: () => creak({D:1.4, r0:22, r1:40, k:0.7, wob:8}),       // long et grave
      C: () => creak({D:0.9, r0:60, r1:110, k:1.6, wob:18}),     // aigu
    },
  },
};
